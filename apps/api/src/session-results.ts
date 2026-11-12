import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHash } from "node:crypto";
import { pool, transaction, type DB } from "./db.ts";
import { actor, scope, check, audit, type Actor } from "./security.ts";
import { loadScheme, examRoster } from "./exams.ts";
import { attendanceSummary } from "./performance.ts";
import { resultPreflight, renderResultPDF } from "./results.ts";
import {
  policySchema,
  uuid,
  resultSheetCSV,
  type ResultSheetData,
} from "../../../packages/domain/src/index.ts";
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
type SessionContext = {
  section: { id: string; name: string; code: string; academic_year_id: string };
  year: { id: string; label: string; hijri_label?: string; state: string };
  program: { name: string };
  level: { name_en: string; name_ur?: string };
  cycle: { id: string; code: string; title: string };
  institute: any;
  scheme: Awaited<ReturnType<typeof loadScheme>>;
  roster: any[];
  papers: any[];
  marks: any[];
  attendance: Awaited<ReturnType<typeof attendanceSummary>>;
  contextHash: string;
};
export async function sessionContext(
  db: DB,
  a: Actor,
  cycle: string,
  section: string,
  lock = false,
): Promise<SessionContext> {
  await scope(db, a, section, "results");
  const row = (
    await db.query(
      `SELECT to_jsonb(s) AS section,to_jsonb(y) AS year,to_jsonb(p) AS program,to_jsonb(l) AS level,to_jsonb(c) AS cycle
 FROM sections s JOIN academic_years y ON y.id=s.academic_year_id JOIN programs p ON p.id=s.program_id JOIN levels l ON l.id=s.level_id
 JOIN exam_cycles c ON c.academic_year_id=y.id WHERE s.id=$1 AND c.id=$2`,
      [section, cycle],
    )
  ).rows[0];
  check(row, "Session does not belong to this class academic year", 404);
  const institute = (
    await db.query("SELECT * FROM organizations WHERE id=$1", [a.org])
  ).rows[0];
  const config =
    (
      await db.query(
        "SELECT config FROM organization_settings WHERE organization_id=$1",
        [a.org],
      )
    ).rows[0]?.config ?? {};
  const policy = policySchema.safeParse(config.approvedPolicy);
  const window = (
    await db.query(
      "SELECT attendance_from::text AS start,attendance_through::text AS finish FROM exam_section_settings WHERE exam_cycle_id=$1 AND section_id=$2",
      [cycle, section],
    )
  ).rows[0];
  const scheme = await loadScheme(db, cycle, section);
  const roster = await examRoster(
    db,
    section,
    policy.success && window
      ? { ...window, eligibility: policy.data.eligibility }
      : undefined,
  );
  const papers = (
    await db.query(
      `SELECT id,state,submitted_at,approved_by FROM exam_assessments WHERE id=ANY($1::uuid[]) ORDER BY id ${lock ? "FOR UPDATE" : ""}`,
      [scheme.papers.map((p) => p.id)],
    )
  ).rows;
  const marks = (
    await db.query(
      `SELECT * FROM marks WHERE assessment_id=ANY($1::uuid[]) AND enrollment_id=ANY($2::uuid[]) ORDER BY id ${lock ? "FOR UPDATE" : ""}`,
      [scheme.papers.map((p) => p.id), roster.map((r) => r.id)],
    )
  ).rows;
  const attendance = window
    ? await attendanceSummary(
        db,
        section,
        window.start,
        window.finish < a.today ? window.finish : a.today,
      )
    : [];
  const identity = {
    section: row.section.id,
    year: row.year.id,
    cycle: row.cycle.id,
    scheme,
    roster: roster.map((r) => ({
      id: r.id,
      number: r.student_number,
      name: r.full_name,
      roll: r.roll_number,
      joined: r.joined_date,
      left: r.left_date,
    })),
  };
  return {
    ...row,
    institute,
    scheme,
    roster,
    papers,
    marks,
    attendance,
    contextHash: digest(identity),
  };
}
export async function sessionSheet(
  db: DB,
  a: Actor,
  cycle: string,
  section: string,
  source = "AUTO",
): Promise<ResultSheetData> {
  await scope(db, a, section, "results");
  check(
    (
      await db.query(
        "SELECT 1 FROM sections s JOIN exam_cycles c ON c.academic_year_id=s.academic_year_id WHERE s.id=$1 AND c.id=$2",
        [section, cycle],
      )
    ).rowCount,
    "Class/session unavailable",
    404,
  );
  const published = (
    await db.query(
      "SELECT id,revision,document_snapshot FROM result_runs WHERE section_id=$1 AND exam_cycle_id=$2 AND state='PUBLISHED' ORDER BY revision DESC LIMIT 1",
      [section, cycle],
    )
  ).rows[0];
  if (source !== "LIVE" && published)
    return {
      source: "PUBLISHED",
      publication: { id: published.id, revision: published.revision },
      blockingErrors: [],
      snapshot: {
        ...published.document_snapshot,
        draft: false,
        formattedCopy: true,
      },
    };
  check(
    source !== "PUBLISHED",
    "This session has no published result yet",
    404,
  );
  const report = await resultPreflight(db, a, cycle, section);
  const window = report.snapshot.attendanceWindow;
  const attendance = window
    ? await attendanceSummary(
        db,
        section,
        window.start,
        window.finish < a.today ? window.finish : a.today,
      )
    : [];
  const students = report.snapshot.students.map((s) => ({
    ...s,
    attendance:
      attendance.find((x) => x.enrollmentId === s.enrollmentId) ?? null,
  }));
  return {
    source: "LIVE",
    publication: published
      ? { id: published.id, revision: published.revision }
      : null,
    blockingErrors: report.blockingErrors,
    snapshot: { ...report.snapshot, students, draft: true, asOf: a.today },
  };
}
export function sessionResults(app: FastifyInstance) {
  for (const format of ["", ".csv", ".pdf"])
    app.get(
      "/v1/exam-cycles/:cycle/sections/:section/result-sheet" + format,
      async (req, reply) => {
        const a = await actor(req),
          p = req.params as any,
          cycle = uuid.parse(p.cycle),
          section = uuid.parse(p.section);
        const q = z
          .object({
            source: z.enum(["AUTO", "LIVE", "PUBLISHED"]).default("AUTO"),
          })
          .parse(req.query);
        const report = await transaction((db) =>
          sessionSheet(db, a, cycle, section, q.source),
        );
        if (!format) return report;
        await audit(
          pool,
          a,
          "EXPORT_SESSION_SHEET",
          "sections",
          section,
          null,
          {
            cycle,
            source: report.source,
            publication: report.publication,
            format,
          },
        );
        reply
          .header(
            "Content-Disposition",
            `attachment; filename="session-results${format}"`,
          )
          .header("Cache-Control", "private, no-store");
        if (format === ".csv")
          return reply
            .type("text/csv; charset=utf-8")
            .send(resultSheetCSV(report.snapshot));
        return reply
          .type("application/pdf")
          .send(await renderResultPDF(report.snapshot));
      },
    );
}
