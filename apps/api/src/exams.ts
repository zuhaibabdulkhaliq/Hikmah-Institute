import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool, transaction, type DB } from "./db.ts";
import { actor, admin, check, scope, audit, type Actor } from "./security.ts";
import {
  schemeSchema,
  markInput,
  policySchema,
  uuid,
  schoolDate,
} from "../../../packages/domain/src/index.ts";
export async function loadScheme(db: DB, cycle: string, section: string) {
  const papers = (
    await db.query(
      "SELECT a.*, (SELECT min(exam_date)::text FROM exam_schedule_entries WHERE assessment_id=a.id) AS scheduled_date FROM exam_assessments a JOIN section_subjects s ON s.id=a.section_subject_id WHERE a.exam_cycle_id=$1 AND s.section_id=$2 AND a.exam_scheme_revision=current_scheme_revision($1,$2) ORDER BY a.display_order",
      [cycle, section],
    )
  ).rows;
  const groups = (
    await db.query(
      "SELECT g.*,array_agg(a.paper_code ORDER BY a.display_order) AS codes FROM result_groups g JOIN result_group_components c ON c.result_group_id=g.id JOIN exam_assessments a ON a.id=c.assessment_id WHERE g.exam_cycle_id=$1 AND g.section_id=$2 AND g.scheme_revision=current_scheme_revision($1,$2) GROUP BY g.id ORDER BY g.display_order",
      [cycle, section],
    )
  ).rows;
  return {
    papers: papers.map((p) => ({
      id: p.id,
      offeringId: p.section_subject_id,
      code: p.paper_code,
      label: p.display_label_ur ?? p.title,
      max: Number(p.max_marks),
      type: p.assessment_type,
      pattern: p.question_pattern ?? "",
      date: p.scheduled_date ?? null,
    })),
    groups: groups.map((g) => ({
      name: g.name,
      max: Number(g.target_max_marks),
      paperCodes: g.codes,
    })),
  };
}
export async function paperScope(db: DB, a: Actor, id: string) {
  const p = (
    await db.query(
      "SELECT a.*,s.section_id FROM exam_assessments a JOIN section_subjects s ON s.id=a.section_subject_id WHERE a.id=$1",
      [id],
    )
  ).rows[0];
  check(p, "Paper unavailable", 404);
  await scope(db, a, p.section_id);
  if (!a.admin) {
    const r = await db.query(
      "SELECT 1 FROM subject_teacher_assignments WHERE section_subject_id=$1 AND teacher_user_id=$2 AND starts_on<=$3::date AND (ends_on IS NULL OR ends_on>=$3::date)",
      [p.section_subject_id, a.id, a.today],
    );
    check(r.rowCount, "Paper access denied", 403);
  }
  return p;
}
export function exams(app: FastifyInstance) {
  app.get("/v1/exam-cycles", async (req) => {
    const a = await actor(req);
    return (
      await pool.query(
        "SELECT c.* FROM exam_cycles c JOIN academic_years y ON y.id=c.academic_year_id WHERE y.organization_id=$1 ORDER BY c.sort_order",
        [a.org],
      )
    ).rows;
  });
  app.post("/v1/exam-cycles", async (req) => {
    const a = await actor(req);
    admin(a);
    const d = z
      .object({
        yearId: uuid,
        code: z.string().min(1).max(30),
        title: z.string().min(1).max(150),
        order: z.number().int(),
        attendanceFrom: schoolDate,
        attendanceThrough: schoolDate,
      })
      .parse(req.body);
    return transaction(async (db) => {
      const year = await db.query(
        "SELECT 1 FROM academic_years WHERE id=$1 AND organization_id=$2",
        [d.yearId, a.org],
      );
      check(year.rowCount, "Year unavailable");
      const r = await db.query(
        "INSERT INTO exam_cycles(academic_year_id,code,title,sort_order,attendance_from,attendance_through) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        Object.values(d),
      );
      await audit(db, a, "CREATE", "exam_cycles", r.rows[0].id, null, d);
      return r.rows[0];
    });
  });
  app.get("/v1/exam-cycles/:cycle/sections/:section/scheme", async (req) => {
    const a = await actor(req),
      { cycle, section } = req.params as any;
    uuid.parse(cycle);
    await scope(pool, a, uuid.parse(section), "results");
    return {
      scheme: await loadScheme(pool, cycle, section),
      approval:
        (
          await pool.query(
            "SELECT * FROM exam_scheme_approvals WHERE exam_cycle_id=$1 AND section_id=$2 AND state='APPROVED'",
            [cycle, section],
          )
        ).rows[0] ?? null,
      window:
        (
          await pool.query(
            "SELECT * FROM exam_section_settings WHERE exam_cycle_id=$1 AND section_id=$2",
            [cycle, section],
          )
        ).rows[0] ?? null,
    };
  });
  app.put("/v1/exam-cycles/:cycle/sections/:section/window", async (req) => {
    const a = await actor(req);
    admin(a);
    const { cycle, section } = req.params as any;
    uuid.parse(cycle);
    await scope(pool, a, uuid.parse(section));
    const d = z
      .object({
        attendanceFrom: schoolDate,
        attendanceThrough: schoolDate,
        examStart: schoolDate.nullable(),
        examEnd: schoolDate.nullable(),
        acknowledgeOverlap: z.boolean().default(false),
      })
      .parse(req.body);
    check(
      d.attendanceFrom <= d.attendanceThrough,
      "Attendance start must precede end",
    );
    return transaction(async (db) => {
      const match = await db.query(
        "SELECT y.start_date::text AS start,y.end_date::text AS finish FROM exam_cycles c JOIN sections s ON s.academic_year_id=c.academic_year_id JOIN academic_years y ON y.id=c.academic_year_id WHERE c.id=$1 AND s.id=$2",
        [cycle, section],
      );
      check(match.rowCount, "Cycle and section year mismatch");
      check(
        d.attendanceFrom >= match.rows[0].start &&
          d.attendanceThrough <= match.rows[0].finish,
        "Attendance window must be inside academic year",
      );
      check(
        (!d.examStart || d.examStart >= match.rows[0].start) &&
          (!d.examEnd || d.examEnd <= match.rows[0].finish),
        "Exam dates must be inside academic year",
      );
      const overlaps = await db.query(
        "SELECT 1 FROM exam_section_settings WHERE section_id=$1 AND exam_cycle_id<>$2 AND attendance_from<=$3 AND attendance_through>=$4",
        [section, cycle, d.attendanceThrough, d.attendanceFrom],
      );
      check(
        !overlaps.rowCount || d.acknowledgeOverlap,
        "Attendance windows overlap; explicit acknowledgment required",
      );
      await db.query(
        "INSERT INTO exam_section_settings(exam_cycle_id,section_id,attendance_from,attendance_through,exam_start,exam_end) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(exam_cycle_id,section_id) DO UPDATE SET attendance_from=$3,attendance_through=$4,exam_start=$5,exam_end=$6",
        [
          cycle,
          section,
          d.attendanceFrom,
          d.attendanceThrough,
          d.examStart,
          d.examEnd,
        ],
      );
      await audit(db, a, "WINDOW", "sections", section, null, d);
      return { ok: true };
    });
  });
  app.put("/v1/exam-cycles/:cycle/sections/:section/scheme", async (req) => {
    const a = await actor(req);
    admin(a);
    const { cycle, section } = req.params as any;
    uuid.parse(cycle);
    await scope(pool, a, uuid.parse(section));
    const s = schemeSchema.parse(req.body);
    return transaction(async (db) => {
      const approved = await db.query(
        "SELECT 1 FROM exam_scheme_approvals WHERE exam_cycle_id=$1 AND section_id=$2 AND revision=current_scheme_revision($1,$2)",
        [cycle, section],
      );
      check(
        !approved.rowCount,
        "Approved schemes require a new cycle/revision; cannot overwrite",
        409,
      );
      const count = await db.query(
        "SELECT 1 FROM marks m JOIN exam_assessments p ON p.id=m.assessment_id JOIN section_subjects o ON o.id=p.section_subject_id WHERE p.exam_cycle_id=$1 AND o.section_id=$2 AND p.exam_scheme_revision=current_scheme_revision($1,$2)",
        [cycle, section],
      );
      check(!count.rowCount, "Scheme already has marks; cannot replace", 409);
      await db.query(
        "DELETE FROM result_group_components WHERE result_group_id IN(SELECT id FROM result_groups WHERE exam_cycle_id=$1 AND section_id=$2 AND scheme_revision=current_scheme_revision($1,$2))",
        [cycle, section],
      );
      await db.query(
        "DELETE FROM result_groups WHERE exam_cycle_id=$1 AND section_id=$2 AND scheme_revision=current_scheme_revision($1,$2)",
        [cycle, section],
      );
      await db.query(
        "DELETE FROM exam_schedule_entries WHERE assessment_id IN(SELECT a.id FROM exam_assessments a JOIN section_subjects o ON o.id=a.section_subject_id WHERE a.exam_cycle_id=$1 AND o.section_id=$2 AND a.exam_scheme_revision=current_scheme_revision($1,$2))",
        [cycle, section],
      );
      await db.query(
        "DELETE FROM exam_assessments WHERE exam_cycle_id=$1 AND exam_scheme_revision=current_scheme_revision($1,$2) AND section_subject_id IN(SELECT id FROM section_subjects WHERE section_id=$2)",
        [cycle, section],
      );
      const ids = new Map<string, string>();
      for (const [i, p] of s.papers.entries()) {
        const valid = await db.query(
          "SELECT 1 FROM section_subjects o JOIN sections s ON s.id=o.section_id JOIN exam_cycles c ON c.academic_year_id=s.academic_year_id WHERE o.id=$1 AND s.id=$2 AND c.id=$3",
          [p.offeringId, section, cycle],
        );
        check(valid.rowCount, "Paper offering and cycle mismatch");
        const r = await db.query(
          "INSERT INTO exam_assessments(exam_cycle_id,section_subject_id,title,display_label_ur,paper_code,max_marks,assessment_type,question_pattern,display_order,exam_scheme_revision) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,current_scheme_revision($1,(SELECT section_id FROM section_subjects WHERE id=$2))) RETURNING id",
          [cycle, p.offeringId, p.label, p.code, p.max, p.type, p.pattern, i],
        );
        ids.set(p.code, r.rows[0].id);
        if (p.date)
          await db.query(
            "INSERT INTO exam_schedule_entries(assessment_id,exam_date) VALUES($1,$2)",
            [r.rows[0].id, p.date],
          );
      }
      for (const [i, g] of s.groups.entries()) {
        const r = await db.query(
          "INSERT INTO result_groups(exam_cycle_id,section_id,name,display_order,target_max_marks,scheme_revision) VALUES($1,$2,$3,$4,$5,current_scheme_revision($1,$2)) RETURNING id",
          [cycle, section, g.name, i, g.max],
        );
        for (const code of g.paperCodes)
          await db.query(
            "INSERT INTO result_group_components(result_group_id,assessment_id,contribution_max) VALUES($1,$2,$3)",
            [
              r.rows[0].id,
              ids.get(code),
              s.papers.find((p) => p.code === code)!.max,
            ],
          );
      }
      await audit(db, a, "SCHEME", "sections", section, null, s);
      return { ok: true };
    });
  });
  app.post(
    "/v1/exam-cycles/:cycle/sections/:section/scheme/approve",
    async (req) => {
      const a = await actor(req);
      admin(a);
      const { cycle, section } = req.params as any;
      uuid.parse(cycle);
      await scope(pool, a, uuid.parse(section));
      return transaction(async (db) => {
        const s = schemeSchema.parse(await loadScheme(db, cycle, section));
        await db.query(
          "INSERT INTO exam_scheme_approvals(exam_cycle_id,section_id,revision,state,scheme_snapshot,approved_by,approved_at) VALUES($1,$2,current_scheme_revision($1,$2),'APPROVED',$3,$4,now())",
          [cycle, section, JSON.stringify(s), a.id],
        );
        await db.query(
          "UPDATE exam_assessments SET state='OPEN' WHERE exam_cycle_id=$1 AND exam_scheme_revision=current_scheme_revision($1,$2) AND section_subject_id IN(SELECT id FROM section_subjects WHERE section_id=$2)",
          [cycle, section],
        );
        await audit(db, a, "APPROVE_SCHEME", "sections", section, null, s);
        return { ok: true };
      });
    },
  );
  app.get("/v1/assessments", async (req) => {
    const a = await actor(req);
    const all = (
      await pool.query(
        "SELECT a.*,s.section_id FROM exam_assessments a JOIN section_subjects s ON s.id=a.section_subject_id JOIN sections c ON c.id=s.section_id WHERE c.organization_id=$1 AND a.exam_scheme_revision=current_scheme_revision(a.exam_cycle_id,s.section_id) ORDER BY a.display_order",
        [a.org],
      )
    ).rows;
    const visible = [];
    for (const p of all) {
      try {
        await paperScope(pool, a, p.id);
        visible.push(p);
      } catch {
        /* omit */
      }
    }
    return visible;
  });
  app.get("/v1/assessments/:id/marks", async (req) => {
    const a = await actor(req);
    const id = uuid.parse((req.params as any).id);
    const p = await paperScope(pool, a, id);
    return {
      paper: p,
      entries: (
        await pool.query(
          'SELECT e.id AS "enrollmentId",s.full_name,s.student_number,m.entry_state AS state,m.awarded,m.version FROM enrollments e JOIN students s ON s.id=e.student_id LEFT JOIN marks m ON m.enrollment_id=e.id AND m.assessment_id=$1 WHERE e.section_id=$2 ORDER BY e.roll_number',
          [id, p.section_id],
        )
      ).rows,
    };
  });
  app.put("/v1/assessments/:id/marks/bulk", async (req) => {
    const a = await actor(req),
      id = uuid.parse((req.params as any).id);
    const { entries } = z
      .object({ entries: z.array(markInput).min(1).max(500) })
      .parse(req.body);
    return transaction(async (db) => {
      const p = await paperScope(db, a, id);
      check(
        p.state === "OPEN",
        "Approve scheme before entering official marks",
      );
      check(!p.submitted_at, "Paper submitted; reopen with reason first", 409);
      for (const e of entries) {
        const old = (
          await db.query(
            "SELECT * FROM marks WHERE assessment_id=$1 AND enrollment_id=$2 FOR UPDATE",
            [id, e.enrollmentId],
          )
        ).rows[0];
        check(
          !old ||
            old.entry_state !== "UNKNOWN_LEGACY_BLANK" ||
            e.state === "UNKNOWN_LEGACY_BLANK" ||
            (e.reason?.length ?? 0) >= 5,
          "Resolving an unknown legacy blank requires a reason",
        );
        check((old?.version ?? 0) === e.version, "Mark changed; refresh", 409);
        await db.query(
          "INSERT INTO marks(assessment_id,enrollment_id,entry_state,awarded,entered_by,entered_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(assessment_id,enrollment_id) DO UPDATE SET entry_state=$3,awarded=$4,entered_by=$5,updated_at=now(),version=marks.version+1,approved_by=NULL,approved_at=NULL",
          [id, e.enrollmentId, e.state, e.awarded ?? null, a.id],
        );
        await audit(
          db,
          a,
          "MARK",
          "exam_assessments",
          id,
          old ?? null,
          e,
          e.reason,
        );
      }
      return { ok: true };
    });
  });
  app.post("/v1/assessments/:id/submit", async (req) => {
    const a = await actor(req),
      id = uuid.parse((req.params as any).id);
    return transaction(async (db) => {
      const p = await paperScope(db, a, id);
      check(p.state === "OPEN", "Scheme not approved");
      const missing = await db.query(
        "SELECT 1 FROM enrollments e LEFT JOIN marks m ON m.enrollment_id=e.id AND m.assessment_id=$1 WHERE e.section_id=$2 AND e.state='ACTIVE' AND (m.id IS NULL OR m.entry_state IN ('PENDING','UNKNOWN_LEGACY_BLANK','WITHHELD'))",
        [id, p.section_id],
      );
      check(!missing.rowCount, "All enrolled learners require resolved marks");
      await db.query(
        "UPDATE exam_assessments SET submitted_at=now() WHERE id=$1",
        [id],
      );
      await audit(db, a, "SUBMIT_MARKS", "exam_assessments", id, null, null);
      return { ok: true };
    });
  });
  app.post("/v1/assessments/:id/approve", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id);
    return transaction(async (db) => {
      const p = await paperScope(db, a, id);
      check(p.submitted_at, "Submit paper first");
      await db.query("UPDATE exam_assessments SET approved_by=$2 WHERE id=$1", [
        id,
        a.id,
      ]);
      await db.query(
        "UPDATE marks SET approved_by=$2,approved_at=now() WHERE assessment_id=$1",
        [id, a.id],
      );
      await audit(db, a, "APPROVE_MARKS", "exam_assessments", id, null, null);
      return { ok: true };
    });
  });
  app.post("/v1/assessments/:id/reopen", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id);
    const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
    return transaction(async (db) => {
      await paperScope(db, a, id);
      await db.query(
        "UPDATE exam_assessments SET submitted_at=NULL,approved_by=NULL WHERE id=$1",
        [id],
      );
      await db.query(
        "UPDATE marks SET approved_by=NULL,approved_at=NULL WHERE assessment_id=$1",
        [id],
      );
      await audit(
        db,
        a,
        "REOPEN_MARKS",
        "exam_assessments",
        id,
        null,
        null,
        reason,
      );
      return { ok: true };
    });
  });
  app.get("/v1/policies", async (req) => {
    const a = await actor(req);
    admin(a);
    return (
      await pool.query(
        "SELECT config,version FROM organization_settings WHERE organization_id=$1",
        [a.org],
      )
    ).rows[0];
  });
  app.put("/v1/policies", async (req) => {
    const a = await actor(req);
    admin(a);
    const d = z
      .object({
        policy: z.record(z.string(), z.unknown()),
        approve: z.boolean(),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    return transaction(async (db) => {
      const old = (
        await db.query(
          "SELECT * FROM organization_settings WHERE organization_id=$1 FOR UPDATE",
          [a.org],
        )
      ).rows[0];
      check(old.version === d.version, "Policy changed; refresh", 409);
      if (d.approve) {
        const p = policySchema.parse(d.policy);
        const years = (
          await db.query(
            "SELECT id FROM academic_years WHERE organization_id=$1",
            [a.org],
          )
        ).rows;
        for (const year of years) {
          const attendance = (
            await db.query(
              "INSERT INTO attendance_policies(academic_year_id,title,version,rounding_decimals,zero_denominator_action,workflow_state,approved_by,approved_at) VALUES($1,'Institute approved policy',$2,$3,$4,'APPROVED',$5,now()) RETURNING id",
              [
                year.id,
                old.version,
                p.attendance.decimals,
                p.attendance.zeroDenominator,
                a.id,
              ],
            )
          ).rows[0];
          for (const [status, credit] of Object.entries(p.attendance.credits))
            await db.query(
              "INSERT INTO attendance_status_rules(attendance_policy_id,status,earned_credit,possible_credit) VALUES($1,$2,$3,$4)",
              [attendance.id, status, credit.earned, credit.possible],
            );
          const scale = (
            await db.query(
              "INSERT INTO grade_scales(academic_year_id,code,version,state,pass_rules_json,rounding_decimals,approved_by,approved_at) VALUES($1,'INSTITUTE',$2,'APPROVED',$3,1,$4,now()) RETURNING id",
              [
                year.id,
                old.version,
                JSON.stringify({
                  minimum: p.passMinimumPercent,
                  paperMinimum: p.paperMinimumPercent,
                  missing: p.missing,
                }),
                a.id,
              ],
            )
          ).rows[0];
          for (const [i, b] of p.grades.entries())
            await db.query(
              "INSERT INTO grade_bands(grade_scale_id,label_en,label_ur,min_percent,max_percent_exclusive,pass,sort_order) VALUES($1,$2,$2,$3,$4,$5,$6)",
              [scale.id, b.label, b.min, b.max, b.pass, i],
            );
          await db.query(
            "INSERT INTO ranking_policies(academic_year_id,version,state,tie_strategy,display_top_n,rank_only_passing,tie_breaker,approved_by,approved_at) VALUES($1,$2,'APPROVED',$3,$4,$5,'NONE',$6,now())",
            [
              year.id,
              old.version,
              p.ranking.tie,
              p.ranking.topN,
              p.ranking.onlyPassing,
              a.id,
            ],
          );
        }
      }
      const config = {
        ...old.config,
        draftPolicy: d.policy,
        ...(d.approve
          ? {
              approvedPolicy: d.policy,
              approvedEditWindow: {
                days: (d.policy as any).attendance.backdateDays,
                approvedBy: a.id,
                approvedAt: new Date().toISOString(),
              },
              approvedBy: a.id,
              approvedAt: new Date().toISOString(),
            }
          : { approvedPolicy: null, approvedBy: null, approvedAt: null }),
      };
      await db.query(
        "UPDATE organization_settings SET config=$2,version=version+1,updated_by=$3,updated_at=now() WHERE organization_id=$1",
        [a.org, JSON.stringify(config), a.id],
      );
      await audit(
        db,
        a,
        d.approve ? "APPROVE_POLICY" : "DRAFT_POLICY",
        "organization_settings",
        a.org,
        old.config,
        config,
      );
      return { ok: true };
    });
  });
}
