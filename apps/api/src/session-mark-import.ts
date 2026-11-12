import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import Decimal from "decimal.js";
import { createHash, randomUUID } from "node:crypto";
import { pool, transaction, type DB } from "./db.ts";
import { actor, scope, check, audit, type Actor } from "./security.ts";
import { sessionContext } from "./session-results.ts";
import {
  sessionMarksPreviewSchema,
  sessionMarksApplySchema,
  uuid,
  paperHeading,
  sheetIdentityHeaders,
  sheetComputedHeaders,
  sheetMetadata,
  sheetCSV,
  spreadsheetText,
  sheetAttendance,
  type SheetPaper,
  type SessionImportPreview,
} from "../../../packages/domain/src/index.ts";
type Value = {
  state: string;
  awarded: number | null;
  onLeave: boolean;
  onTime: boolean | null;
  version: number;
};
type Manifest = {
  contextHash: string;
  timing: boolean;
  headers: string[];
  papers: SheetPaper[];
  roster: {
    id: string;
    number: string;
    roll: string;
    name: string;
    attendance: string;
  }[];
  marks: Record<string, Value>;
  metadata: unknown[][];
};
type Change = {
  assessmentId: string;
  enrollmentId: string;
  studentNumber: string;
  name: string;
  paperCode: string;
  before: Value;
  after: Value;
  overwrite: boolean;
};
const key = (paper: string, enrollment: string) => paper + ":" + enrollment;
const value = (mark: any): Value => ({
  state: mark?.entry_state ?? "PENDING",
  awarded: mark?.awarded == null ? null : Number(mark.awarded),
  onLeave: mark?.on_leave ?? false,
  onTime: mark?.on_time ?? null,
  version: mark?.version ?? 0,
});
const same = (a: Value, b: Value) =>
  a.state === b.state &&
  a.awarded === b.awarded &&
  a.onLeave === b.onLeave &&
  a.onTime === b.onTime;
const describe = (v: Value) =>
  (v.state === "GRADED" ? String(v.awarded) : v.state) +
  (v.onLeave ? " · exam leave" : "") +
  (v.onTime === true
    ? " · on time"
    : v.onTime === false
      ? " · not on time"
      : " · timing unknown");
const normal = (s: string) =>
  s
    .trim()
    .replace(/[۰-۹٠-٩]/g, (c) =>
      String(c.charCodeAt(0) - (c >= "۰" ? 1776 : 1632)),
    )
    .replaceAll("٫", ".");
async function makeManifest(
  db: DB,
  a: Actor,
  cycle: string,
  section: string,
  timing: boolean,
): Promise<Manifest> {
  const c = await sessionContext(db, a, cycle, section);
  check(
    c.scheme.papers.length,
    "Configure papers for this exam session before downloading a template",
  );
  check(
    c.roster.length && c.roster.length <= 500,
    "A marks template needs between 1 and 500 eligible students",
  );
  const headers = [
    ...sheetIdentityHeaders,
    ...c.scheme.papers.map(paperHeading),
    ...sheetComputedHeaders,
    ...(timing
      ? c.scheme.papers.flatMap((p) => [
          p.code + " | Exam leave (YES/NO)",
          p.code + " | On time (YES/NO/UNKNOWN)",
        ])
      : []),
  ];
  return {
    contextHash: c.contextHash,
    timing,
    headers,
    papers: c.scheme.papers,
    metadata: sheetMetadata({ ...c, students: [], policy: null }),
    roster: c.roster.map((r) => ({
      id: r.id,
      number: r.student_number,
      roll: r.roll_number,
      name: r.full_name,
      attendance: sheetAttendance(
        c.attendance.find((x) => x.enrollmentId === r.id) ?? null,
      ),
    })),
    marks: Object.fromEntries(
      c.marks.map((m) => [key(m.assessment_id, m.enrollment_id), value(m)]),
    ),
  };
}
function templateCSV(id: string, m: Manifest) {
  return sheetCSV([
    ["HIKMAH_MARKS_TEMPLATE", "2", id],
    ...m.metadata,
    [
      "Instructions",
      "Edit paper marks only. Blanks keep existing marks; zero is a score. AUTO columns are calculated by the system. Timing stays unchanged unless included and explicitly edited.",
    ],
    m.headers,
    ...m.roster.map((r) => [
      r.number,
      r.roll,
      r.name,
      r.attendance,
      ...m.papers.map(() => ""),
      ...sheetComputedHeaders.map(() => "AUTO"),
      ...(m.timing
        ? m.papers.flatMap((p) => {
            const v = m.marks[key(p.id, r.id)];
            return [
              v?.onLeave ? "YES" : "NO",
              v?.onTime === true
                ? "YES"
                : v?.onTime === false
                  ? "NO"
                  : "UNKNOWN",
            ];
          })
        : []),
    ]),
  ]);
}
function readCSV(csv: string) {
  check(Buffer.byteLength(csv, "utf8") <= 500000, "CSV must be at most 500 KB");
  check(
    !csv.includes("\0"),
    "Export the spreadsheet as UTF-8 CSV, not UTF-16 or an Excel workbook",
  );
  const text = csv.replace(/^\uFEFF/, "");
  const delimiter =
    text.startsWith('"HIKMAH_MARKS_TEMPLATE";') ||
    text.startsWith("HIKMAH_MARKS_TEMPLATE;")
      ? ";"
      : text.startsWith('"HIKMAH_MARKS_TEMPLATE"\t') ||
          text.startsWith("HIKMAH_MARKS_TEMPLATE\t")
        ? "\t"
        : ",";
  try {
    return parse(text, {
      bom: true,
      delimiter,
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: 100000,
    }) as string[][];
  } catch {
    check(
      false,
      "CSV could not be read. Save as UTF-8 CSV with intact quoted cells.",
    );
  }
}
export function sessionMarkImport(app: FastifyInstance) {
  app.get(
    "/v1/exam-cycles/:cycle/sections/:section/marks/template.csv",
    async (req, reply) => {
      const a = await actor(req),
        p = req.params as any,
        cycle = uuid.parse(p.cycle),
        section = uuid.parse(p.section);
      const q = z
        .object({ timing: z.enum(["include", "preserve"]).default("preserve") })
        .parse(req.query);
      return transaction(async (db) => {
        const m = await makeManifest(
            db,
            a,
            cycle,
            section,
            q.timing === "include",
          ),
          id = randomUUID();
        await db.query(
          "INSERT INTO exam_mark_templates(id,organization_id,section_id,exam_cycle_id,created_by,manifest) VALUES($1,$2,$3,$4,$5,$6)",
          [id, a.org, section, cycle, a.id, JSON.stringify(m)],
        );
        await audit(
          db,
          a,
          "DOWNLOAD_MARKS_TEMPLATE",
          "sections",
          section,
          null,
          { template: id, cycle, timing: m.timing },
        );
        return reply
          .header(
            "Content-Disposition",
            'attachment; filename="marks-entry-template.csv"',
          )
          .header("Cache-Control", "private, no-store")
          .type("text/csv; charset=utf-8")
          .send(templateCSV(id, m));
      });
    },
  );
  app.post(
    "/v1/exam-cycles/:cycle/sections/:section/marks/import/preview",
    async (req) => {
      const a = await actor(req),
        p = req.params as any,
        cycle = uuid.parse(p.cycle),
        section = uuid.parse(p.section),
        input = sessionMarksPreviewSchema.parse(req.body);
      await scope(pool, a, section, "results");
      const rows = readCSV(input.csv);
      check(
        rows[0]?.[0] === "HIKMAH_MARKS_TEMPLATE" && rows[0]?.[1] === "2",
        "Use the downloadable blank marks template for this class/session. Result exports and arbitrary CSVs cannot be imported.",
      );
      const id = uuid.safeParse(rows[0]?.[2]);
      check(id.success, "Template reference is missing or invalid");
      return transaction(async (db) => {
        const t = (
          await db.query(
            "SELECT * FROM exam_mark_templates WHERE id=$1 AND organization_id=$2 AND section_id=$3 AND exam_cycle_id=$4",
            [id.data, a.org, section, cycle],
          )
        ).rows[0];
        check(t, "This template belongs to another class or exam session", 422);
        const m = t.manifest as Manifest,
          c = await sessionContext(db, a, cycle, section);
        check(
          m.metadata.every(
            (row, index) =>
              rows[index + 1]?.length === row.length &&
              row.every(
                (cell, column) =>
                  rows[index + 1][column] === spreadsheetText(cell),
              ),
          ),
          "The institute, year, class or exam reference rows changed. Keep the downloaded reference rows intact.",
        );
        check(
          c.contextHash === m.contextHash,
          "The roster or paper scheme changed after this template was downloaded. Download a fresh template.",
          409,
        );
        check(rows.length <= 507, "Maximum 500 student rows");
        const header = rows[6]?.map((s) => s.trim());
        check(
          header?.length === m.headers.length &&
            header.every((s, i) => s === spreadsheetText(m.headers[i]).trim()),
          "Column headers changed, are duplicated, or are missing. Keep the generated paper codes, names and maxima intact.",
        );
        const errors: SessionImportPreview["errors"] = [],
          warnings: string[] = [],
          changes: Change[] = [],
          seen = new Set<string>();
        let blankCells = 0,
          unchangedCells = 0;
        const current = new Map(
          c.marks.map((mark) => [
            key(mark.assessment_id, mark.enrollment_id),
            value(mark),
          ]),
        );
        for (const [i, row] of rows.slice(7).entries()) {
          const line = i + 8,
            number = row[0] ?? "";
          if (row.length !== m.headers.length) {
            errors.push({
              row: line,
              message: "Column count differs from the template",
            });
            continue;
          }
          const student = m.roster.find(
            (r) => spreadsheetText(r.number) === number,
          );
          if (!student) {
            errors.push({
              row: line,
              studentNumber: number,
              message:
                "Student number is not in this template. Keep student numbers as text, including leading zeros.",
            });
            continue;
          }
          if (seen.has(student.id)) {
            errors.push({
              row: line,
              studentNumber: student.number,
              message: "Duplicate student row",
            });
            continue;
          }
          seen.add(student.id);
          if (
            row[1] !== spreadsheetText(student.roll) ||
            row[2] !== spreadsheetText(student.name) ||
            row[3] !== spreadsheetText(student.attendance)
          ) {
            errors.push({
              row: line,
              studentNumber: student.number,
              message:
                "A protected roll, student name or attendance cell changed. Edit only marks and optional exam flags.",
            });
            continue;
          }
          for (const [index, paper] of m.papers.entries()) {
            const raw = normal(row[index + 4] ?? ""),
              before = m.marks[key(paper.id, student.id)] ?? value(null),
              now = current.get(key(paper.id, student.id)) ?? value(null);
            const after = { ...before };
            try {
              if (!raw) blankCells++;
              else if (raw === "LEAVE") {
                after.state = "PENDING";
                after.awarded = null;
                after.onLeave = true;
                after.onTime = false;
              } else if (
                [
                  "PENDING",
                  "ABSENT",
                  "EXEMPT",
                  "WITHHELD",
                  "UNKNOWN_LEGACY_BLANK",
                ].includes(raw)
              ) {
                after.state = raw;
                after.awarded = null;
              } else {
                check(
                  /^\d+(?:\.\d{1,2})?$/.test(raw),
                  "Use a non-negative number with at most two decimal places, or an allowed status. Formulas are not accepted.",
                );
                const score = new Decimal(raw);
                check(
                  score.lte(paper.max),
                  `Marks must be between 0 and ${paper.max}`,
                );
                after.state = "GRADED";
                after.awarded = score.toNumber();
              }
              if (m.timing) {
                const at = 4 + m.papers.length + 4 + index * 2,
                  leave = (row[at] ?? "").trim().toUpperCase(),
                  time = (row[at + 1] ?? "").trim().toUpperCase();
                check(
                  ["", "YES", "NO"].includes(leave),
                  "Exam leave must be YES or NO",
                );
                check(
                  ["", "YES", "NO", "UNKNOWN"].includes(time),
                  "On time must be YES, NO or UNKNOWN",
                );
                if (leave && leave !== (before.onLeave ? "YES" : "NO"))
                  after.onLeave = leave === "YES";
                if (
                  time &&
                  time !==
                    (before.onTime === true
                      ? "YES"
                      : before.onTime === false
                        ? "NO"
                        : "UNKNOWN")
                )
                  after.onTime = time === "UNKNOWN" ? null : time === "YES";
                check(
                  !(after.onLeave && after.onTime === true),
                  "Exam leave cannot be marked on time",
                );
                if (after.onLeave) after.onTime = false;
              }
              if (raw || !same(before, after))
                check(
                  now.version === before.version,
                  "These marks changed after template download; download a fresh template.",
                  409,
                );
              if (same(before, after)) {
                unchangedCells++;
                continue;
              }
              changes.push({
                assessmentId: paper.id,
                enrollmentId: student.id,
                studentNumber: student.number,
                name: student.name,
                paperCode: paper.code,
                before,
                after,
                overwrite: before.version > 0,
              });
            } catch (e) {
              errors.push({
                row: line,
                column: paper.code,
                studentNumber: student.number,
                message: (e as Error).message,
              });
            }
          }
        }
        for (const student of m.roster)
          if (!seen.has(student.id))
            errors.push({
              row: 0,
              studentNumber: student.number,
              message:
                "Student row is missing. Keep every template row; leave unchanged marks blank.",
            });
        if (c.year.state !== "ACTIVE")
          errors.push({
            row: 0,
            message:
              "Academic year is not active. An administrator must reopen it before marks can change.",
          });
        const touched = [...new Set(changes.map((x) => x.assessmentId))];
        for (const paper of c.papers.filter((p) => touched.includes(p.id)))
          if (paper.state !== "OPEN" || paper.submitted_at)
            errors.push({
              row: 0,
              column: m.papers.find((p) => p.id === paper.id)?.code,
              message:
                "Approve the scheme and reopen submitted papers before importing marks.",
            });
        if (!changes.length)
          errors.push({
            row: 0,
            message:
              "No changes found. Fill paper marks or explicitly edit included exam flags. Blank marks keep existing values.",
          });
        const published = (
          await db.query(
            "SELECT revision FROM result_runs WHERE exam_cycle_id=$1 AND section_id=$2 AND state='PUBLISHED'",
            [cycle, section],
          )
        ).rows[0];
        if (changes.some((x) => x.after.onTime == null))
          warnings.push(
            "Some changed marks have unconfirmed exam timing. On-time completion is never assumed; confirm it before assigning positions.",
          );
        if (published)
          warnings.push(
            "Only working marks will change. The existing published result and PDF remain unchanged; review and publish a new revision separately.",
          );
        warnings.push(
          "Computed total, percentage, grade and position columns are ignored and recalculated by the system.",
        );
        const summary = {
          changedCells: changes.length,
          overwrites: changes.filter((x) => x.overwrite).length,
          students: new Set(changes.map((x) => x.enrollmentId)).size,
          papers: touched.length,
          blankCells,
          unchangedCells,
        };
        const batchId = randomUUID(),
          canApply = changes.length > 0 && errors.length === 0;
        const plan = {
          cycle,
          section,
          reason: input.reason,
          contextHash: m.contextHash,
          changes,
          summary,
          errors,
          warnings,
          canApply,
          publishedRevision: published?.revision ?? null,
        };
        await db.query(
          "INSERT INTO exam_mark_import_batches(id,template_id,organization_id,created_by,csv_sha256,plan) VALUES($1,$2,$3,$4,$5,$6)",
          [
            batchId,
            t.id,
            a.org,
            a.id,
            createHash("sha256").update(input.csv).digest("hex"),
            JSON.stringify(plan),
          ],
        );
        await audit(
          db,
          a,
          "PREVIEW_SESSION_MARK_IMPORT",
          "exam_mark_import_batches",
          batchId,
          null,
          { cycle, section, summary, canApply },
          input.reason,
        );
        return {
          batchId,
          canApply,
          summary,
          errors,
          warnings,
          publishedRevision: plan.publishedRevision,
          changes: changes.slice(0, 200).map((x) => ({
            studentNumber: x.studentNumber,
            name: x.name,
            paperCode: x.paperCode,
            before: describe(x.before),
            after: describe(x.after),
          })),
        } satisfies SessionImportPreview;
      });
    },
  );
  app.post("/v1/session-mark-imports/:id/apply", async (req) => {
    const a = await actor(req),
      id = uuid.parse((req.params as any).id),
      input = sessionMarksApplySchema.parse(req.body);
    return transaction(async (db) => {
      const batch = (
        await db.query(
          "SELECT * FROM exam_mark_import_batches WHERE id=$1 AND organization_id=$2 AND created_by=$3 FOR UPDATE",
          [id, a.org, a.id],
        )
      ).rows[0];
      check(batch, "Import preview unavailable", 404);
      const p = batch.plan as {
        cycle: string;
        section: string;
        reason: string;
        contextHash: string;
        changes: Change[];
        summary: SessionImportPreview["summary"];
        canApply: boolean;
      };
      await scope(db, a, p.section, "manage");
      if (batch.state === "APPLIED")
        return { ok: true, replayed: true, summary: p.summary };
      check(
        p.canApply,
        "Resolve every validation issue and preview the file again",
      );
      check(
        !p.summary.overwrites || input.acknowledgeOverwrite,
        "Confirm replacement of existing marks before applying",
        409,
      );
      const c = await sessionContext(db, a, p.cycle, p.section, true);
      check(c.year.state === "ACTIVE", "Academic year is not active", 409);
      check(
        c.contextHash === p.contextHash,
        "Roster or scheme changed; download a fresh template and preview again",
        409,
      );
      for (const change of p.changes) {
        const paper = c.papers.find((x) => x.id === change.assessmentId);
        check(
          paper?.state === "OPEN" && !paper.submitted_at,
          "Paper workflow changed; reopen and preview again",
          409,
        );
        const before = value(
          c.marks.find(
            (x) =>
              x.assessment_id === change.assessmentId &&
              x.enrollment_id === change.enrollmentId,
          ),
        );
        check(
          before.version === change.before.version,
          "Marks changed since preview; download a fresh template and review again",
          409,
        );
        await db.query(
          `INSERT INTO marks(assessment_id,enrollment_id,entry_state,awarded,entered_by,entered_at,on_leave,on_time)
     VALUES($1,$2,$3,$4,$5,now(),$6,$7) ON CONFLICT(assessment_id,enrollment_id) DO UPDATE SET
     entry_state=EXCLUDED.entry_state,awarded=EXCLUDED.awarded,entered_by=EXCLUDED.entered_by,entered_at=now(),on_leave=EXCLUDED.on_leave,on_time=EXCLUDED.on_time,version=marks.version+1,updated_at=now(),approved_by=NULL,approved_at=NULL`,
          [
            change.assessmentId,
            change.enrollmentId,
            change.after.state,
            change.after.awarded,
            a.id,
            change.after.onLeave,
            change.after.onTime,
          ],
        );
        await audit(
          db,
          a,
          "IMPORT_MARK",
          "exam_assessments",
          change.assessmentId,
          before,
          { ...change.after, enrollmentId: change.enrollmentId, batchId: id },
          p.reason,
        );
      }
      await db.query(
        "UPDATE exam_mark_import_batches SET state='APPLIED',applied_at=now() WHERE id=$1",
        [id],
      );
      await audit(
        db,
        a,
        "APPLY_SESSION_MARK_IMPORT",
        "exam_mark_import_batches",
        id,
        null,
        p.summary,
        p.reason,
      );
      return { ok: true, replayed: false, summary: p.summary };
    });
  });
}
