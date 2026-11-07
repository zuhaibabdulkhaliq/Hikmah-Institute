import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { parse } from "csv-parse/sync";
import { pool, transaction } from "./db.ts";
import { actor, admin, audit, check, scope } from "./security.ts";
import {
  uuid,
  schoolDate,
  csvCell,
} from "../../../packages/domain/src/index.ts";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const studentRow = z
  .object({
    student_number: z.string().min(1).max(60),
    full_name: z.string().min(1).max(150),
    roll_number: z.string().min(1).max(30),
    joined_on: schoolDate,
  })
  .refine(
    (r) => !Object.values(r).some((v) => /^[\s]*[=+\-@\t\r]/.test(v)),
    "Formula-like values prohibited",
  );
export function operations(app: FastifyInstance) {
  app.get("/v1/attendance-permissions", async (req) => {
    const a = await actor(req);
    const r = (
      await pool.query(
        "SELECT config,version FROM organization_settings WHERE organization_id=$1",
        [a.org],
      )
    ).rows[0];
    return {
      version: r.version,
      canConfigure: a.admin,
      today: a.today,
      days:
        "approvedEditWindow" in r.config
          ? r.config.approvedEditWindow.days
          : (r.config.approvedPolicy?.attendance?.backdateDays ?? null),
    };
  });
  app.put("/v1/attendance-permissions", async (req) => {
    const a = await actor(req);
    admin(a);
    const d = z
      .object({
        days: z.number().int().min(0).max(366).nullable(),
        version: z.number().int().positive(),
        reason: z.string().min(5).max(1000),
      })
      .parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM organization_settings WHERE organization_id=$1 FOR UPDATE",
          [a.org],
        )
      ).rows[0];
      check(r.version === d.version, "Configuration changed; refresh", 409);
      const config = {
        ...r.config,
        approvedEditWindow: {
          days: d.days,
          approvedBy: a.id,
          approvedAt: new Date().toISOString(),
        },
      };
      await db.query(
        "UPDATE organization_settings SET config=$2,version=version+1,updated_by=$3,updated_at=now() WHERE organization_id=$1",
        [a.org, JSON.stringify(config), a.id],
      );
      await audit(
        db,
        a,
        "ATTENDANCE_EDIT_PERMISSION",
        "organization_settings",
        a.org,
        r.config.approvedEditWindow ?? null,
        config.approvedEditWindow,
        d.reason,
      );
      return { ok: true };
    });
  });

  app.post("/v1/users/:id/reset-password", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id);
    const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
    const token = randomBytes(32).toString("hex");
    return transaction(async (db) => {
      const user = (
        await db.query("SELECT * FROM app_users WHERE id=$1 AND active=true", [
          id,
        ])
      ).rows[0];
      check(user, "Active user not found", 404);
      await db.query(
        "UPDATE staff_invitations SET accepted_at=now() WHERE lower(email)=lower($1) AND purpose='RESET' AND accepted_at IS NULL",
        [user.email],
      );
      const r = await db.query(
        "INSERT INTO staff_invitations(organization_id,email,name,token_hash,created_by,expires_at,purpose) VALUES($1,$2,$3,$4,$5,now()+interval '2 hours','RESET') RETURNING id",
        [a.org, user.email, user.display_name, sha(token), a.id],
      );
      await audit(
        db,
        a,
        "PASSWORD_RECOVERY",
        "staff_invitations",
        r.rows[0].id,
        null,
        { userId: id },
        reason,
      );
      return {
        activationUrl: `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/activate#${token}`,
        expiresInHours: 2,
      };
    });
  });

  app.get("/v1/sections/:section/staff", async (req) => {
    const a = await actor(req);
    admin(a);
    const section = uuid.parse((req.params as any).section);
    await scope(pool, a, section);
    return {
      section: (
        await pool.query(
          "SELECT t.*,u.display_name FROM section_staff_assignments t JOIN app_users u ON u.id=t.user_id WHERE t.section_id=$1",
          [section],
        )
      ).rows,
      subjects: (
        await pool.query(
          "SELECT t.*,u.display_name,s.subject_id FROM subject_teacher_assignments t JOIN app_users u ON u.id=t.teacher_user_id JOIN section_subjects s ON s.id=t.section_subject_id WHERE s.section_id=$1",
          [section],
        )
      ).rows,
    };
  });
  app.patch("/v1/staff/:id", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id);
    const d = z
      .object({
        active: z.boolean(),
        endsOn: schoolDate.nullable(),
        reason: z.string().min(5),
      })
      .parse(req.body);
    return transaction(async (db) => {
      const old = (
        await db.query(
          "SELECT * FROM section_staff_assignments WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      check(old, "Assignment not found", 404);
      await scope(db, a, old.section_id);
      await db.query(
        "UPDATE section_staff_assignments SET active=$2,ends_on=$3 WHERE id=$1",
        [id, d.active, d.endsOn],
      );
      await audit(
        db,
        a,
        "STAFF_SCOPE_CHANGE",
        "section_staff_assignments",
        id,
        old,
        d,
        d.reason,
      );
      return { ok: true };
    });
  });
  app.patch("/v1/teaching/:id", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id);
    const d = z
      .object({ endsOn: schoolDate, reason: z.string().min(5) })
      .parse(req.body);
    return transaction(async (db) => {
      const old = (
        await db.query(
          "SELECT t.*,s.section_id FROM subject_teacher_assignments t JOIN section_subjects s ON s.id=t.section_subject_id WHERE t.id=$1 FOR UPDATE OF t",
          [id],
        )
      ).rows[0];
      check(old, "Assignment not found", 404);
      await scope(db, a, old.section_id);
      await db.query(
        "UPDATE subject_teacher_assignments SET ends_on=$2 WHERE id=$1",
        [id, d.endsOn],
      );
      await audit(
        db,
        a,
        "TEACHING_SCOPE_CHANGE",
        "subject_teacher_assignments",
        id,
        old,
        d,
        d.reason,
      );
      return { ok: true };
    });
  });
  app.patch("/v1/enrollments/:id", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id);
    const d = z
      .object({
        rollNumber: z.string().min(1).max(30),
        leftOn: schoolDate.nullable(),
        state: z.enum(["ACTIVE", "TRANSFERRED", "WITHDRAWN", "COMPLETED"]),
        reason: z.string().min(5),
      })
      .parse(req.body);
    return transaction(async (db) => {
      const old = (
        await db.query("SELECT * FROM enrollments WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      check(old, "Enrollment unavailable", 404);
      await scope(db, a, old.section_id);
      await db.query(
        "UPDATE enrollments SET roll_number=$2,left_on=$3,state=$4 WHERE id=$1",
        [id, d.rollNumber, d.leftOn, d.state],
      );
      await audit(
        db,
        a,
        "ENROLLMENT_CHANGE",
        "enrollments",
        id,
        old,
        d,
        d.reason,
      );
      return { ok: true };
    });
  });
  app.post("/v1/imports/:job/rollback", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).job);
    const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
    return transaction(async (db) => {
      const job = (
        await db.query(
          "SELECT * FROM data_import_jobs WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [id, a.org],
        )
      ).rows[0];
      check(
        job?.state === "APPLIED" && job.results_json.created,
        "Applied import with retained created IDs required",
        409,
      );
      for (const r of job.results_json.created) {
        await db.query("DELETE FROM enrollments WHERE id=$1", [r.enrollmentId]);
        await db.query("DELETE FROM students WHERE id=$1", [r.studentId]);
      }
      await db.query(
        "UPDATE data_import_jobs SET state='ROLLED_BACK' WHERE id=$1",
        [id],
      );
      await audit(
        db,
        a,
        "IMPORT_ROLLBACK",
        "data_import_jobs",
        id,
        null,
        { count: job.results_json.created.length },
        reason,
      );
      return { ok: true };
    });
  });

  app.get("/v1/me/history", async (req) => {
    const a = await actor(req);
    return (
      await pool.query(
        "SELECT action,object_type,object_id,reason,event_at FROM audit_events WHERE actor_user_id=$1 ORDER BY event_at DESC LIMIT 100",
        [a.id],
      )
    ).rows;
  });
  app.post("/v1/sections/:section/corrections", async (req) => {
    const a = await actor(req);
    const section = uuid.parse((req.params as any).section);
    await scope(pool, a, section, "attendance");
    const d = z
      .object({ schoolDate, reason: z.string().min(5).max(1000) })
      .parse(req.body);
    return transaction(async (db) => {
      const r = await db.query(
        "INSERT INTO attendance_correction_requests(section_id,school_date,requested_by,reason) VALUES($1,$2,$3,$4) RETURNING id",
        [section, d.schoolDate, a.id, d.reason],
      );
      await audit(
        db,
        a,
        "REQUEST_CORRECTION",
        "attendance_correction_requests",
        r.rows[0].id,
        null,
        d,
      );
      return r.rows[0];
    });
  });
  app.get("/v1/corrections", async (req) => {
    const a = await actor(req);
    admin(a);
    return (
      await pool.query(
        "SELECT c.*,s.name,u.display_name FROM attendance_correction_requests c JOIN sections s ON s.id=c.section_id JOIN app_users u ON u.id=c.requested_by WHERE s.organization_id=$1 ORDER BY c.created_at DESC LIMIT 100",
        [a.org],
      )
    ).rows;
  });
  app.post("/v1/corrections/:id/review", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id);
    const d = z
      .object({ approve: z.boolean(), reason: z.string().min(5).max(1000) })
      .parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM attendance_correction_requests WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      check(r && r.status === "OPEN", "Request is not open", 409);
      await scope(db, a, r.section_id);
      await db.query(
        "UPDATE attendance_correction_requests SET status=$2,reviewed_by=$3,review_reason=$4 WHERE id=$1",
        [id, d.approve ? "APPROVED" : "REJECTED", a.id, d.reason],
      );
      if (d.approve)
        await db.query(
          "UPDATE attendance_sheets SET state='DRAFT',version=version+1 WHERE section_id=$1 AND school_date=$2",
          [r.section_id, r.school_date],
        );
      await audit(
        db,
        a,
        "REVIEW_CORRECTION",
        "attendance_correction_requests",
        id,
        r,
        d,
        d.reason,
      );
      return { ok: true };
    });
  });

  app.post("/v1/invitations", async (req) => {
    const a = await actor(req);
    admin(a);
    const d = z
      .object({ email: z.email(), name: z.string().min(1).max(150) })
      .parse(req.body);
    const token = randomBytes(32).toString("hex");
    return transaction(async (db) => {
      const r = await db.query(
        "INSERT INTO staff_invitations(organization_id,email,name,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours') RETURNING id",
        [a.org, d.email.toLowerCase(), d.name, sha(token), a.id],
      );
      await audit(db, a, "INVITE", "staff_invitations", r.rows[0].id, null, {
        email: d.email,
      });
      return {
        activationUrl: `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/activate#${token}`,
        expiresInHours: 48,
      };
    });
  });
  app.post(
    "/v1/invitations/accept",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const d = z
        .object({
          token: z.string().length(64),
          password: z.string().min(12).max(128),
        })
        .parse(req.body);
      const hashed = await hashPassword(d.password);
      return transaction(async (db) => {
        const invitation = (
          await db.query(
            "SELECT * FROM staff_invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE",
            [sha(d.token)],
          )
        ).rows[0];
        check(invitation, "Invalid or expired invitation", 400);
        if (invitation.purpose === "RESET") {
          const user = (
            await db.query(
              "SELECT * FROM app_users WHERE lower(email)=lower($1) AND active=true",
              [invitation.email],
            )
          ).rows[0];
          check(user, "Account unavailable", 400);
          const result = await db.query(
            'UPDATE account SET password=$2,"updatedAt"=now() WHERE "userId"=$1 AND "providerId"=\'credential\'',
            [user.auth_subject, hashed],
          );
          check(result.rowCount, "Password account unavailable", 400);
          await db.query('DELETE FROM session WHERE "userId"=$1', [
            user.auth_subject,
          ]);
          await db.query(
            "UPDATE staff_invitations SET accepted_at=now() WHERE id=$1",
            [invitation.id],
          );
          return { ok: true };
        }
        const authId = randomUUID(),
          userId = randomUUID();
        await db.query(
          'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
          [authId, invitation.name, invitation.email],
        );
        await db.query(
          'INSERT INTO account(id,"accountId","providerId","userId",password) VALUES($1,$2,\'credential\',$2,$3)',
          [randomUUID(), authId, hashed],
        );
        await db.query(
          "INSERT INTO app_users(id,auth_subject,email,display_name) VALUES($1,$2,$3,$4)",
          [userId, authId, invitation.email, invitation.name],
        );
        await db.query(
          "UPDATE staff_invitations SET accepted_at=now() WHERE id=$1",
          [invitation.id],
        );
        return { ok: true };
      });
    },
  );
  app.post("/v1/sections/:section/import/preview", async (req) => {
    const a = await actor(req);
    admin(a);
    const section = uuid.parse((req.params as any).section);
    await scope(pool, a, section);
    const { csv, columnMapping } = z
      .object({
        csv: z.string().max(500000),
        columnMapping: z
          .object({
            student_number: z.string().min(1),
            full_name: z.string().min(1),
            roll_number: z.string().min(1),
            joined_on: z.string().min(1),
          })
          .optional(),
      })
      .parse(req.body);
    let raw: any[];
    try {
      raw = parse(csv, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        relax_column_count: false,
      });
    } catch {
      check(false, "Malformed CSV");
    }
    check(raw.length <= 500, "Maximum 500 rows per import");
    const seen = new Set<string>(),
      rolls = new Set<string>(),
      errors: any[] = [],
      rows: any[] = [];
    for (const [i, source] of raw.entries()) {
      const r = columnMapping
        ? Object.fromEntries(
            Object.entries(columnMapping).map(([key, column]) => [
              key,
              source[column],
            ]),
          )
        : source;
      const parsed = studentRow.safeParse(r);
      if (!parsed.success) {
        errors.push({ row: i + 2, message: parsed.error.message });
        continue;
      }
      if (seen.has(r.student_number) || rolls.has(r.roll_number)) {
        errors.push({
          row: i + 2,
          message: "Duplicate student number or roll",
        });
        continue;
      }
      seen.add(r.student_number);
      rolls.add(r.roll_number);
      const existing = await pool.query(
        "SELECT 1 FROM students WHERE organization_id=$1 AND student_number=$2",
        [a.org, r.student_number],
      );
      if (existing.rowCount)
        errors.push({
          row: i + 2,
          message:
            "Student number already exists; enroll existing learner separately",
        });
      rows.push(parsed.data);
    }
    return transaction(async (db) => {
      const job = (
        await db.query(
          "INSERT INTO data_import_jobs(organization_id,initiated_by,import_type,state,results_json) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [
            a.org,
            a.id,
            "STUDENTS",
            errors.length ? "PREVIEW" : "VALIDATED",
            JSON.stringify({
              section,
              rows,
              errors,
              columnMapping: columnMapping ?? null,
            }),
          ],
        )
      ).rows[0];
      await audit(db, a, "IMPORT_PREVIEW", "data_import_jobs", job.id, null, {
        rowCount: rows.length,
        errors,
      });
      return {
        jobId: job.id,
        rows,
        errors,
        canApply: !errors.length && rows.length > 0,
      };
    });
  });
  app.post("/v1/imports/:job/apply", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).job);
    return transaction(async (db) => {
      const job = (
        await db.query(
          "SELECT * FROM data_import_jobs WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [id, a.org],
        )
      ).rows[0];
      check(
        job && job.state === "VALIDATED",
        "Import must be validated and unapplied",
        409,
      );
      const { section, rows } = job.results_json;
      const created: { studentId: string; enrollmentId: string }[] = [];
      await scope(db, a, section);
      for (const r of rows) {
        const student = (
          await db.query(
            "INSERT INTO students(organization_id,student_number,full_name) VALUES($1,$2,$3) RETURNING id",
            [a.org, r.student_number, r.full_name],
          )
        ).rows[0];
        const enrollment = (
          await db.query(
            "INSERT INTO enrollments(student_id,section_id,roll_number,joined_on) VALUES($1,$2,$3,$4) RETURNING id",
            [student.id, section, r.roll_number, r.joined_on],
          )
        ).rows[0];
        created.push({ studentId: student.id, enrollmentId: enrollment.id });
      }
      await db.query(
        "UPDATE data_import_jobs SET state='APPLIED',applied_at=now(),results_json=$2 WHERE id=$1",
        [id, JSON.stringify({ ...job.results_json, created })],
      );
      await audit(db, a, "IMPORT_APPLY", "data_import_jobs", id, null, {
        rowCount: rows.length,
      });
      return { ok: true, count: rows.length };
    });
  });
  app.get("/v1/sections/:section/attendance.csv", async (req, reply) => {
    const a = await actor(req);
    const section = uuid.parse((req.params as any).section);
    await scope(pool, a, section, "results");
    const q = z
      .object({ from: schoolDate, through: schoolDate })
      .parse(req.query);
    check(q.from <= q.through, "Invalid date range");
    const rows = (
      await pool.query(
        "SELECT sh.school_date::text,s.student_number,s.full_name,r.status FROM attendance_records r JOIN attendance_sheets sh ON sh.id=r.sheet_id JOIN enrollments e ON e.id=r.enrollment_id JOIN students s ON s.id=e.student_id WHERE sh.section_id=$1 AND sh.school_date BETWEEN $2 AND $3 ORDER BY sh.school_date,e.roll_number",
        [section, q.from, q.through],
      )
    ).rows;
    await audit(pool, a, "EXPORT_ATTENDANCE", "sections", section, null, q);
    return reply
      .type("text/csv; charset=utf-8")
      .send(
        "\uFEFF" +
          [
            "school_date,student_number,full_name,status",
            ...rows.map((r) => Object.values(r).map(csvCell).join(",")),
          ].join("\r\n"),
      );
  });
  app.post("/v1/sections/:section/rollover", async (req) => {
    const a = await actor(req);
    admin(a);
    const source = uuid.parse((req.params as any).section);
    const d = z
      .object({
        targetSection: uuid,
        joinedOn: schoolDate,
        enrollmentIds: z.array(uuid).min(1).max(500),
      })
      .parse(req.body);
    return transaction(async (db) => {
      await scope(db, a, source);
      await scope(db, a, d.targetSection);
      check(source !== d.targetSection, "Choose a new section");
      const created = [];
      for (const id of d.enrollmentIds) {
        const e = (
          await db.query(
            "SELECT * FROM enrollments WHERE id=$1 AND section_id=$2",
            [id, source],
          )
        ).rows[0];
        check(e, "Enrollment not in source section");
        const r = await db.query(
          "INSERT INTO enrollments(student_id,section_id,roll_number,joined_on) VALUES($1,$2,$3,$4) RETURNING id",
          [e.student_id, d.targetSection, e.roll_number, d.joinedOn],
        );
        created.push(r.rows[0].id);
      }
      await audit(db, a, "ROLLOVER", "sections", source, null, d);
      return { enrollmentIds: created };
    });
  });
}
