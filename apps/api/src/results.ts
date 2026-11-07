import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import Decimal from "decimal.js";
import { pool, transaction, type DB } from "./db.ts";
import { actor, admin, scope, check, audit, type Actor } from "./security.ts";
import { loadScheme } from "./exams.ts";
import { eligible, replay } from "./attendance.ts";
import {
  schemeSchema,
  policySchema,
  calculate,
  rank,
  attendancePercent,
  uuid,
  csvCell,
  type Mark,
} from "../../../packages/domain/src/index.ts";
const hash = (v: unknown) =>
  createHash("sha256")
    .update(Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest("hex");
async function preflight(db: DB, a: Actor, cycle: string, section: string) {
  await scope(db, a, section, "results");
  const errors: string[] = [];
  const activeYear = await db.query(
    "SELECT 1 FROM sections s JOIN academic_years y ON y.id=s.academic_year_id WHERE s.id=$1 AND y.state='ACTIVE'",
    [section],
  );
  if (!activeYear.rowCount)
    errors.push(
      "Academic year is not active; historical results remain read-only",
    );
  const setting = (
    await db.query(
      "SELECT * FROM organization_settings WHERE organization_id=$1",
      [a.org],
    )
  ).rows[0];
  const policy = policySchema.safeParse(setting?.config.approvedPolicy);
  if (!policy.success)
    errors.push(
      "Academic, attendance, grade and ranking policies require explicit approval",
    );
  const raw = await loadScheme(db, cycle, section),
    scheme = schemeSchema.safeParse(raw);
  if (!scheme.success)
    errors.push("Paper group scheme is incomplete or invalid");
  const approved = (
    await db.query(
      "SELECT * FROM exam_scheme_approvals WHERE exam_cycle_id=$1 AND section_id=$2 AND state='APPROVED'",
      [cycle, section],
    )
  ).rows[0];
  if (!approved) errors.push("Paper scheme requires approval");
  const window = (
    await db.query(
      "SELECT *,attendance_from::text AS start,attendance_through::text AS finish FROM exam_section_settings WHERE exam_cycle_id=$1 AND section_id=$2",
      [cycle, section],
    )
  ).rows[0];
  if (!window) errors.push("Configure explicit section attendance window");
  const cycleRow = (
    await db.query(
      "SELECT c.* FROM exam_cycles c JOIN sections s ON s.academic_year_id=c.academic_year_id WHERE c.id=$1 AND s.id=$2",
      [cycle, section],
    )
  ).rows[0];
  check(cycleRow, "Cycle does not belong to section year");
  let enrolled = (
    await db.query(
      "SELECT e.*,e.joined_on::text AS joined_date,e.left_on::text AS left_date,s.full_name,s.student_number FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.section_id=$1 ORDER BY e.roll_number",
      [section],
    )
  ).rows;
  if (policy.success && window) {
    enrolled = enrolled.filter(
      (e) =>
        e.joined_date <= window.finish &&
        (e.left_date === null ||
          e.left_date >=
            (policy.data.eligibility === "ACTIVE_AT_WINDOW_END"
              ? window.finish
              : window.start)),
    );
  }
  if (!enrolled.length)
    errors.push(
      "No eligible enrolled learners in the configured reporting window",
    );
  const marks = (
    await db.query(
      "SELECT m.*,a.paper_code,a.submitted_at,a.approved_by AS paper_approved FROM marks m JOIN exam_assessments a ON a.id=m.assessment_id JOIN section_subjects o ON o.id=a.section_subject_id WHERE a.exam_cycle_id=$1 AND o.section_id=$2 AND a.exam_scheme_revision=current_scheme_revision($1,$2) ORDER BY m.id",
      [cycle, section],
    )
  ).rows;
  const days = window
    ? (
        await db.query(
          "SELECT school_date::text AS day FROM section_calendar_days WHERE section_id=$1 AND counts_for_attendance AND is_instructional AND school_date BETWEEN $2 AND $3 ORDER BY school_date",
          [section, window.start, window.finish],
        )
      ).rows
    : [];
  if (window && !days.length)
    errors.push("Attendance calendar has no counting dates in selected window");
  const attendanceRows: any[] = [];
  for (const day of days) {
    const roster = await eligible(db, section, day.day);
    const sheet = (
      await db.query(
        "SELECT * FROM attendance_sheets WHERE section_id=$1 AND school_date=$2",
        [section, day.day],
      )
    ).rows[0];
    if (!sheet || sheet.state === "DRAFT") {
      errors.push(`Attendance ${day.day} is unsubmitted`);
      continue;
    }
    const records = (
      await db.query(
        "SELECT * FROM attendance_records WHERE sheet_id=$1 ORDER BY enrollment_id",
        [sheet.id],
      )
    ).rows;
    if (!roster.every((e) => records.some((r) => r.enrollment_id === e.id)))
      errors.push(`Attendance coverage incomplete: ${day.day}`);
    attendanceRows.push(
      ...records.map((r) => ({
        ...r,
        schoolDate: day.day,
        version: sheet.version,
      })),
    );
  }
  const students = enrolled.map((e) => {
    const own = marks.filter((m) => m.enrollment_id === e.id);
    const map: Record<string, Mark> = Object.fromEntries(
      own.map((m) => [
        m.paper_code,
        {
          state: m.entry_state,
          awarded: m.awarded === null ? null : Number(m.awarded),
        },
      ]),
    );
    const result = scheme.success
      ? calculate(scheme.data, map, policy.success ? policy.data : undefined)
      : null;
    if (result && result.possible === 0)
      errors.push(`${e.student_number}: academic denominator is zero`);
    if (result?.errors.length)
      errors.push(`${e.student_number}: ${result.errors.join(", ")}`);
    if (own.some((m) => !m.submitted_at || !m.paper_approved))
      errors.push(`${e.student_number}: marks require submission and approval`);
    const att = policy.success
      ? attendancePercent(
          attendanceRows
            .filter((r) => r.enrollment_id === e.id)
            .map((r) => r.status),
          policy.data.attendance,
        )
      : { percent: null, earned: 0, possible: 0 };
    if (
      policy.success &&
      att.percent === null &&
      policy.data.attendance.zeroDenominator === "BLOCK"
    )
      errors.push(`${e.student_number}: attendance denominator is zero`);
    const rounding = policy.success
      ? {
          HALF_UP: Decimal.ROUND_HALF_UP,
          HALF_EVEN: Decimal.ROUND_HALF_EVEN,
          DOWN: Decimal.ROUND_DOWN,
        }[policy.data.rounding]
      : Decimal.ROUND_HALF_UP;
    return {
      enrollmentId: e.id,
      name: e.full_name,
      studentNumber: e.student_number,
      roll: e.roll_number,
      marks: map,
      ...(result ?? {
        groups: [],
        total: 0,
        possible: 0,
        percent: null,
        grade: null,
        passing: false,
      }),
      displayPercent: result?.percent
        ? new Decimal(result.percent).toFixed(1, rounding)
        : null,
      attendance: {
        ...att,
        displayPercent:
          att.percent !== null && policy.success
            ? new Decimal(att.percent).toFixed(
                policy.data.attendance.decimals,
                rounding,
              )
            : null,
      },
      rank: null as number | null,
    };
  });
  const ranked = policy.success
    ? rank(students, policy.data.ranking)
    : students;
  const snapshot = {
    institute: (
      await db.query("SELECT * FROM organizations WHERE id=$1", [a.org])
    ).rows[0],
    year: (
      await db.query(
        "SELECT y.* FROM academic_years y JOIN sections s ON s.academic_year_id=y.id WHERE s.id=$1",
        [section],
      )
    ).rows[0],
    section: (await db.query("SELECT * FROM sections WHERE id=$1", [section]))
      .rows[0],
    cycle: cycleRow,
    scheme: raw,
    policy: policy.success ? policy.data : null,
    students: ranked,
    attendanceWindow: window ?? null,
    attendanceRows,
  };
  return {
    canPublish: errors.length === 0,
    blockingErrors: [...new Set(errors)],
    warnings: [] as string[],
    validationHash: hash({
      snapshot,
      marks,
      settingVersion: setting.version,
      approval: approved?.id,
    }),
    snapshot,
  };
}
function render(snapshot: unknown): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PDF_PYTHON ?? "python3",
      ["scripts/render_pdf.py"],
      {
        env: {
          ...process.env,
          XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? "/tmp/hikmah-cache",
        },
      },
    );
    const output: Buffer[] = [];
    let error = "";
    child.stdout.on("data", (b) => output.push(b));
    child.stderr.on("data", (b) => {
      error += b.toString();
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(output))
        : reject(new Error(`PDF renderer: ${error}`)),
    );
    child.stdin.end(JSON.stringify(snapshot));
  });
}
export function results(app: FastifyInstance) {
  app.post("/v1/results/:cycle/:section/validate", async (req) => {
    const a = await actor(req),
      p = req.params as any;
    return transaction((db) =>
      preflight(db, a, uuid.parse(p.cycle), uuid.parse(p.section)),
    );
  });
  app.post("/v1/results/:cycle/:section/publish", async (req, reply) => {
    const a = await actor(req);
    admin(a);
    const cycle = uuid.parse((req.params as any).cycle),
      section = uuid.parse((req.params as any).section);
    const d = z
      .object({
        validationHash: z.string().length(64),
        correctionReason: z.string().min(5).optional(),
      })
      .parse(req.body);
    return transaction((db) =>
      replay(db, a, req, async () => {
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          cycle + section,
        ]);
        const report = await preflight(db, a, cycle, section);
        check(report.canPublish, report.blockingErrors.join("; "));
        check(
          report.validationHash === d.validationHash,
          "Source changed; validate again",
          409,
        );
        const old = (
          await db.query(
            "SELECT * FROM result_runs WHERE exam_cycle_id=$1 AND section_id=$2 ORDER BY revision DESC LIMIT 1",
            [cycle, section],
          )
        ).rows[0];
        check(
          !old || d.correctionReason,
          "Correction reason required for new revision",
        );
        const revision = (old?.revision ?? 0) + 1;
        const snapshot = {
          ...report.snapshot,
          revision,
          publishedAt: new Date().toISOString(),
        };
        const policyIds = (
          await db.query(
            `SELECT
        (SELECT id FROM attendance_policies WHERE academic_year_id=$1 AND workflow_state='APPROVED' ORDER BY version DESC LIMIT 1) AS attendance,
        (SELECT id FROM grade_scales WHERE academic_year_id=$1 AND state='APPROVED' ORDER BY version DESC LIMIT 1) AS grade,
        (SELECT id FROM ranking_policies WHERE academic_year_id=$1 AND state='APPROVED' ORDER BY version DESC LIMIT 1) AS ranking,
        (SELECT id FROM exam_scheme_approvals WHERE exam_cycle_id=$2 AND section_id=$3 AND state='APPROVED') AS scheme`,
            [snapshot.year.id, cycle, section],
          )
        ).rows[0];
        check(
          policyIds.attendance &&
            policyIds.grade &&
            policyIds.ranking &&
            policyIds.scheme,
          "Approve policies for the selected academic year",
        );
        const documents = [];
        for (const key of [
          "class",
          ...snapshot.students.map((s) => s.enrollmentId),
        ])
          documents.push({
            key,
            pdf: await render({
              ...snapshot,
              ...(key !== "class" ? { enrollment: key } : {}),
            }),
          });
        if (old)
          await db.query(
            "UPDATE result_runs SET state='SUPERSEDED' WHERE id=$1",
            [old.id],
          );
        const run = (
          await db.query(
            "INSERT INTO result_runs(exam_cycle_id,section_id,revision,state,policy_snapshot,generated_by,published_by,published_at,supersedes_run_id,source_version_hash,document_snapshot,validation_report) VALUES($1,$2,$3,'PUBLISHED',$4,$5,$5,now(),$6,$7,$8,$9) RETURNING id",
            [
              cycle,
              section,
              revision,
              JSON.stringify(snapshot.policy),
              a.id,
              old?.id ?? null,
              d.validationHash,
              JSON.stringify(snapshot),
              JSON.stringify({ canPublish: true }),
            ],
          )
        ).rows[0];
        await db.query(
          "UPDATE result_runs SET attendance_policy_id=$2,grade_scale_id=$3,ranking_policy_id=$4,scheme_approval_id=$5 WHERE id=$1",
          [
            run.id,
            policyIds.attendance,
            policyIds.grade,
            policyIds.ranking,
            policyIds.scheme,
          ],
        );
        for (const student of snapshot.students) {
          const snap = (
            await db.query(
              "INSERT INTO result_snapshots(result_run_id,enrollment_id,student_name_snapshot,roll_number_snapshot,attendance_possible,attendance_credited,attendance_percent,total_awarded,total_possible,academic_percent,rank_in_section,grade,remarks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
              [
                run.id,
                student.enrollmentId,
                student.name,
                student.roll,
                student.attendance.possible,
                student.attendance.earned,
                student.attendance.percent,
                student.total,
                student.possible,
                student.percent,
                student.rank,
                student.grade,
                student.passing ? "PASS" : "FAIL",
              ],
            )
          ).rows[0];
          const groups = (
            await db.query(
              "SELECT * FROM result_groups WHERE exam_cycle_id=$1 AND section_id=$2 AND scheme_revision=current_scheme_revision($1,$2)",
              [cycle, section],
            )
          ).rows;
          for (const g of student.groups) {
            const group = groups.find((g2) => g2.name === g.name);
            await db.query(
              "INSERT INTO result_snapshot_groups(snapshot_id,result_group_id,group_name_snapshot,awarded,possible) VALUES($1,$2,$3,$4,$5)",
              [snap.id, group.id, g.name, g.awarded, g.possible],
            );
          }
          for (const p of snapshot.scheme.papers) {
            const g = groups.find((g2) =>
              snapshot.scheme.groups
                .find((g3) => g3.name === g2.name)
                ?.paperCodes.includes(p.code),
            );
            await db.query(
              "INSERT INTO result_snapshot_papers(snapshot_id,assessment_id,result_group_id,paper_label_ur,paper_display_order,awarded,max_marks,mark_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
              [
                snap.id,
                p.id,
                g.id,
                p.label,
                snapshot.scheme.papers.indexOf(p),
                student.marks[p.code].awarded,
                p.max,
                student.marks[p.code].state,
              ],
            );
          }
        }
        for (const doc of documents)
          await db.query(
            "INSERT INTO publication_documents VALUES($1,$2,$3,$4)",
            [run.id, doc.key, doc.pdf, hash(doc.pdf)],
          );
        await db.query(
          "UPDATE attendance_sheets SET state='LOCKED',version=version+1 WHERE section_id=$1 AND school_date BETWEEN $2 AND $3",
          [
            section,
            snapshot.attendanceWindow.start,
            snapshot.attendanceWindow.finish,
          ],
        );
        await audit(
          db,
          a,
          "PUBLISH",
          "result_runs",
          run.id,
          old ? { id: old.id } : null,
          { revision },
          d.correctionReason,
        );
        reply.code(201);
        return { id: run.id, revision };
      }),
    );
  });
  app.get("/v1/results", async (req) => {
    const a = await actor(req);
    const runs = (
      await pool.query(
        "SELECT id,section_id,revision,state,published_at,document_snapshot->'students' AS students FROM result_runs ORDER BY published_at DESC LIMIT 200",
      )
    ).rows;
    const visible = [];
    for (const r of runs) {
      try {
        await scope(pool, a, r.section_id, "results");
        visible.push(r);
      } catch {
        /* omit */
      }
    }
    return visible;
  });
  for (const path of [
    "/v1/results/:run/sectionsheet.pdf",
    "/v1/results/:run/students/:enrollment.pdf",
  ])
    app.get(path, async (req, reply) => {
      const a = await actor(req),
        p = req.params as any;
      const id = uuid.parse(p.run),
        key = p.enrollment ? uuid.parse(p.enrollment) : "class";
      const run = (
        await pool.query("SELECT * FROM result_runs WHERE id=$1", [id])
      ).rows[0];
      check(run, "Result unavailable", 404);
      await scope(pool, a, run.section_id, "results");
      const doc = (
        await pool.query(
          "SELECT pdf FROM publication_documents WHERE run_id=$1 AND enrollment_key=$2",
          [id, key],
        )
      ).rows[0];
      check(doc, "Document unavailable", 404);
      await audit(pool, a, "EXPORT", "result_runs", id, null, {
        format: "pdf",
        key,
      });
      return reply
        .header("Cache-Control", "private, no-store")
        .header(
          "Content-Disposition",
          `attachment; filename="hikmah-${run.revision}-${key}.pdf"`,
        )
        .type("application/pdf")
        .send(doc.pdf);
    });
  app.get("/v1/results/:run/export.csv", async (req, reply) => {
    const a = await actor(req);
    const id = uuid.parse((req.params as any).run);
    const run = (
      await pool.query("SELECT * FROM result_runs WHERE id=$1", [id])
    ).rows[0];
    check(run, "Result unavailable", 404);
    await scope(pool, a, run.section_id, "results");
    const rows = run.document_snapshot.students.map((s: any) =>
      [
        s.studentNumber,
        s.name,
        s.total,
        s.possible,
        s.displayPercent,
        s.grade,
        s.rank,
        s.passing,
      ]
        .map(csvCell)
        .join(","),
    );
    await audit(pool, a, "EXPORT", "result_runs", id, null, { format: "csv" });
    return reply
      .type("text/csv; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="results.csv"')
      .send(
        "\uFEFF" +
          [
            "student_number,name,total,possible,percent,grade,rank,passing",
            ...rows,
          ].join("\r\n"),
      );
  });
}
