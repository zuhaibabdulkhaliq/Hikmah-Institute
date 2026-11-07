import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { createHash } from "node:crypto";
import { pool, transaction, type DB } from "./db.ts";
import { actor, admin, check, scope, audit, type Actor } from "./security.ts";
import {
  attendanceDay,
  schoolDate,
  uuid,
} from "../../../packages/domain/src/index.ts";
export async function eligible(db: DB, section: string, date: string) {
  return (
    await db.query(
      "SELECT e.*,s.student_number,s.full_name,s.full_name_ur FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.section_id=$1 AND e.joined_on<=$2 AND (e.left_on IS NULL OR e.left_on>=$2) ORDER BY e.roll_number",
      [section, date],
    )
  ).rows;
}
export async function replay(
  db: DB,
  a: Actor,
  req: FastifyRequest,
  fn: () => Promise<unknown>,
) {
  const key = z.string().min(8).max(100).parse(req.headers["idempotency-key"]);
  const route = req.url;
  const hash = createHash("sha256")
    .update(JSON.stringify(req.body))
    .digest("hex");
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    a.id + route + key,
  ]);
  const old = await db.query(
    "SELECT * FROM request_receipts WHERE actor_id=$1 AND route=$2 AND key=$3",
    [a.id, route, key],
  );
  if (old.rowCount) {
    check(
      old.rows[0].body_hash === hash,
      "Idempotency key reused with different data",
      409,
    );
    return old.rows[0].response;
  }
  const response = await fn();
  await db.query("INSERT INTO request_receipts VALUES($1,$2,$3,$4,$5)", [
    a.id,
    route,
    key,
    hash,
    JSON.stringify(response),
  ]);
  return response;
}
async function editDate(db: DB, a: Actor, date: string) {
  check(date <= a.today, "Future attendance prohibited");
  if (!a.admin && date < a.today) {
    const result = await db.query(
      "SELECT CASE WHEN config ? 'approvedEditWindow' THEN config->'approvedEditWindow'->>'days' ELSE config->'approvedPolicy'->'attendance'->>'backdateDays' END AS days FROM organization_settings WHERE organization_id=$1",
      [a.org],
    );
    check(
      result.rows[0]?.days != null,
      "Historical attendance edit window requires approval",
      403,
    );
    check(
      (Date.parse(a.today) - Date.parse(date)) / 86400000 <=
        Number(result.rows[0].days),
      "Date is outside approved edit window",
      403,
    );
  }
}
async function save(
  db: DB,
  a: Actor,
  section: string,
  day: z.infer<typeof attendanceDay>,
) {
  await scope(db, a, section, "attendance");
  const calendar = await db.query(
    "SELECT 1 FROM section_calendar_days WHERE section_id=$1 AND school_date=$2 AND is_instructional AND counts_for_attendance",
    [section, day.schoolDate],
  );
  check(
    calendar.rowCount,
    "Date must be an attendance-counting instructional day",
  );
  await editDate(db, a, day.schoolDate);
  const old = (
    await db.query(
      "SELECT * FROM attendance_sheets WHERE section_id=$1 AND school_date=$2 FOR UPDATE",
      [section, day.schoolDate],
    )
  ).rows[0];
  check(
    (old?.version ?? 0) === day.version,
    "Sheet changed; refresh before editing",
    409,
  );
  check(
    !old || old.state === "DRAFT",
    "Reopen submitted or locked sheet before editing",
    409,
  );
  const roster = await eligible(db, section, day.schoolDate);
  const ids = day.records.map((r) => r.enrollmentId);
  check(
    new Set(ids).size === ids.length &&
      ids.every((id) => roster.some((e) => e.id === id)),
    "Duplicate or ineligible enrollment",
  );
  const sheet = await db.query(
    `INSERT INTO attendance_sheets(section_id,school_date,created_by) VALUES($1,$2,$3) ON CONFLICT(section_id,school_date) DO UPDATE SET version=attendance_sheets.version+1,updated_at=now() RETURNING *`,
    [section, day.schoolDate, a.id],
  );
  const s = sheet.rows[0];
  const previous = (
    await db.query("SELECT * FROM attendance_records WHERE sheet_id=$1", [s.id])
  ).rows;
  await db.query("DELETE FROM attendance_records WHERE sheet_id=$1", [s.id]);
  for (const r of day.records)
    await db.query(
      "INSERT INTO attendance_records(sheet_id,enrollment_id,status,remark,marked_by) VALUES($1,$2,$3,$4,$5)",
      [s.id, r.enrollmentId, r.status, r.remark ?? null, a.id],
    );
  await audit(db, a, "SAVE", "attendance_sheets", s.id, previous, day);
  return { version: s.version, status: s.state };
}
export function attendance(app: FastifyInstance) {
  app.get("/v1/sections/:id/calendar", async (req) => {
    const a = await actor(req),
      id = uuid.parse((req.params as any).id);
    await scope(pool, a, id);
    const q = z
      .object({
        from: schoolDate.optional(),
        through: schoolDate.optional(),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    return (
      await pool.query(
        "SELECT * FROM section_calendar_days WHERE section_id=$1 AND ($2::date IS NULL OR school_date>=$2) AND ($3::date IS NULL OR school_date<=$3) ORDER BY school_date LIMIT 100 OFFSET $4",
        [id, q.from ?? null, q.through ?? null, q.offset],
      )
    ).rows;
  });
  app.put("/v1/sections/:id/calendar", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id);
    await scope(pool, a, id);
    const d = z
      .array(
        z.object({
          schoolDate,
          isInstructional: z.boolean(),
          countsForAttendance: z.boolean(),
          note: z.string().max(200).default(""),
        }),
      )
      .min(1)
      .max(366)
      .parse(req.body);
    return transaction(async (db) => {
      for (const v of d)
        await db.query(
          "INSERT INTO section_calendar_days(section_id,school_date,is_instructional,counts_for_attendance,calendar_note) VALUES($1,$2,$3,$4,$5) ON CONFLICT(section_id,school_date) DO UPDATE SET is_instructional=$3,counts_for_attendance=$4,calendar_note=$5",
          [id, v.schoolDate, v.isInstructional, v.countsForAttendance, v.note],
        );
      await audit(db, a, "CALENDAR", "sections", id, null, d);
      return { ok: true };
    });
  });
  app.get("/v1/sections/:id/attendance/:date", async (req) => {
    const a = await actor(req),
      id = uuid.parse((req.params as any).id),
      date = schoolDate.parse((req.params as any).date);
    await scope(pool, a, id, "attendance");
    const s = (
      await pool.query(
        "SELECT * FROM attendance_sheets WHERE section_id=$1 AND school_date=$2",
        [id, date],
      )
    ).rows[0];
    return {
      sectionId: id,
      schoolDate: date,
      version: s?.version ?? 0,
      status: s?.state ?? "DRAFT",
      roster: await eligible(pool, id, date),
      records: s
        ? (
            await pool.query(
              'SELECT enrollment_id AS "enrollmentId",status,remark FROM attendance_records WHERE sheet_id=$1',
              [s.id],
            )
          ).rows
        : [],
    };
  });
  app.put("/v1/sections/:id/attendance/:date", async (req) => {
    const a = await actor(req),
      id = uuid.parse((req.params as any).id);
    const day = attendanceDay.parse({
      ...(req.body as any),
      schoolDate: (req.params as any).date,
      version: Number(req.headers["if-match"]),
    });
    return transaction((db) => save(db, a, id, day));
  });
  app.post("/v1/sections/:id/attendance/bulk", async (req) => {
    const a = await actor(req),
      id = uuid.parse((req.params as any).id);
    const d = z
      .object({ days: z.array(attendanceDay).min(1).max(100) })
      .parse(req.body);
    return transaction((db) =>
      replay(db, a, req, async () => {
        const results = [];
        for (const day of d.days) results.push(await save(db, a, id, day));
        return results;
      }),
    );
  });
  app.post("/v1/sections/:id/attendance/:date/submit", async (req) => {
    const a = await actor(req),
      id = uuid.parse((req.params as any).id),
      date = schoolDate.parse((req.params as any).date);
    return transaction(async (db) => {
      await scope(db, a, id, "attendance");
      await editDate(db, a, date);
      const s = (
        await db.query(
          "SELECT * FROM attendance_sheets WHERE section_id=$1 AND school_date=$2 FOR UPDATE",
          [id, date],
        )
      ).rows[0];
      check(s && s.state === "DRAFT", "No editable draft");
      check(
        s.version === Number(req.headers["if-match"]),
        "Stale sheet version",
        409,
      );
      const roster = await eligible(db, id, date),
        records = await db.query(
          "SELECT enrollment_id FROM attendance_records WHERE sheet_id=$1",
          [s.id],
        );
      check(
        roster.length > 0 &&
          roster.length === records.rowCount &&
          roster.every((e) =>
            records.rows.some((r) => r.enrollment_id === e.id),
          ),
        "Every eligible student requires an explicit status",
      );
      await db.query(
        "UPDATE attendance_sheets SET state='SUBMITTED',version=version+1,submitted_by=$2,submitted_at=now() WHERE id=$1",
        [s.id, a.id],
      );
      await audit(db, a, "SUBMIT", "attendance_sheets", s.id, s, null);
      return { ok: true };
    });
  });
  app.post("/v1/sections/:id/attendance/:date/reopen", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id),
      date = schoolDate.parse((req.params as any).date);
    const { reason } = z
      .object({ reason: z.string().min(5).max(1000) })
      .parse(req.body);
    return transaction(async (db) => {
      await scope(db, a, id);
      const r = await db.query(
        "UPDATE attendance_sheets SET state='DRAFT',version=version+1 WHERE section_id=$1 AND school_date=$2 RETURNING id",
        [id, date],
      );
      check(r.rowCount, "Sheet not found", 404);
      await audit(
        db,
        a,
        "REOPEN",
        "attendance_sheets",
        r.rows[0].id,
        null,
        null,
        reason,
      );
      return { ok: true };
    });
  });
}
