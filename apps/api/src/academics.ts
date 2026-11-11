import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { pool, transaction } from "./db.ts";
import {
  actor,
  admin,
  audit,
  check,
  scope,
  capabilities,
  manage,
} from "./security.ts";
import { uuid, schoolDate } from "../../../packages/domain/src/index.ts";
const text = z.string().min(1).max(200);
export const resources = {
  "academic-years": {
    table: "academic_years",
    schema: z.object({
      label: text,
      hijri_label: text.optional(),
      start_date: schoolDate,
      end_date: schoolDate,
      state: z
        .enum(["PLANNED", "ACTIVE", "CLOSED", "ARCHIVED"])
        .default("PLANNED"),
    }),
  },
  programs: {
    table: "programs",
    schema: z.object({
      name: text,
      code: text,
      active: z.boolean().default(true),
    }),
  },
  levels: {
    table: "levels",
    schema: z.object({
      ordinal: z.number().int().min(1).max(99),
      name_en: text,
      name_ur: text.optional(),
      active: z.boolean().default(true),
    }),
  },
  sections: {
    table: "sections",
    schema: z.object({
      academic_year_id: uuid,
      program_id: uuid,
      level_id: uuid,
      code: text,
      name: text,
      active: z.boolean().default(true),
    }),
  },
  students: {
    table: "students",
    schema: z.object({
      student_number: text,
      full_name: text,
      full_name_ur: text.optional(),
      guardian_contact: text.optional(),
      active: z.boolean().default(true),
    }),
  },
  subjects: {
    table: "subjects",
    schema: z.object({
      code: text,
      name_en: text,
      name_ur: text.optional(),
      active: z.boolean().default(true),
    }),
  },
} as const;
export function academics(app: FastifyInstance) {
  for (const [route, { table, schema }] of Object.entries(resources)) {
    app.get(`/v1/${route}`, async (req) => {
      const a = await actor(req);
      if (route === "sections") {
        const all = await pool.query(
          "SELECT s.*,y.label AS year_label,y.state AS year_state,l.name_en AS level_name,p.name AS program_name FROM sections s JOIN academic_years y ON y.id=s.academic_year_id JOIN levels l ON l.id=s.level_id JOIN programs p ON p.id=s.program_id WHERE s.organization_id=$1 ORDER BY y.start_date DESC,l.ordinal,s.code",
          [a.org],
        );
        const visible = [];
        for (const row of all.rows) {
          try {
            await scope(pool, a, row.id);
            visible.push(row);
          } catch {
            /* omit inaccessible sections */
          }
        }
        return visible;
      }
      admin(a);
      return (
        await pool.query(
          `SELECT * FROM ${table} WHERE organization_id=$1 ORDER BY id LIMIT 500`,
          [a.org],
        )
      ).rows;
    });
    app.post(`/v1/${route}`, async (req, reply) => {
      const a = await actor(req);
      admin(a);
      const data = schema.parse(req.body);
      return transaction(async (db) => {
        const keys = Object.keys(data);
        const result = await db.query(
          `INSERT INTO ${table}(organization_id,${keys.join(",")}) VALUES($1,${keys.map((_, i) => `$${i + 2}`).join(",")}) RETURNING *`,
          [a.org, ...Object.values(data)],
        );
        if (route === "academic-years") {
          for (const [order, code] of [
            "SEH_MAHI",
            "SHASH_MAHI",
            "MOCK",
          ].entries())
            await db.query(
              "INSERT INTO exam_cycles(academic_year_id,code,title,sort_order,attendance_from,attendance_through) VALUES($1,$2,$2,$3,$4,$4)",
              [result.rows[0].id, code, order, result.rows[0].start_date],
            );
        }
        await audit(db, a, "CREATE", table, result.rows[0].id, null, data);
        reply.code(201);
        return result.rows[0];
      });
    });
    app.patch(`/v1/${route}/:id`, async (req) => {
      const a = await actor(req);
      admin(a);
      const id = uuid.parse((req.params as any).id);
      const data = schema.partial().parse(req.body);
      check(Object.keys(data).length, "No fields supplied");
      return transaction(async (db) => {
        const old = await db.query(
          `SELECT * FROM ${table} WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
          [id, a.org],
        );
        check(old.rowCount, "Not found", 404);
        const result = await db.query(
          `UPDATE ${table} SET ${Object.keys(data)
            .map((k, i) => `${k}=$${i + 3}`)
            .join(",")} WHERE id=$1 AND organization_id=$2 RETURNING *`,
          [id, a.org, ...Object.values(data)],
        );
        await audit(db, a, "UPDATE", table, id, old.rows[0], result.rows[0]);
        return result.rows[0];
      });
    });
  }
  app.get("/v1/me", async (req) => {
    const a = await actor(req);
    return {
      userId: a.id,
      name: a.name,
      roles: a.admin ? ["ADMIN"] : [],
      today: a.today,
      timezone: a.timezone,
      ...(await capabilities(pool, a)),
      sectionAssignments: (
        await pool.query(
          `SELECT section_id AS "sectionId",role FROM section_staff_assignments WHERE user_id=$1 AND active AND starts_on<=$2::date AND (ends_on IS NULL OR ends_on>=$2::date)`,
          [a.id, a.today],
        )
      ).rows,
    };
  });
  app.get("/v1/institute", async (req) => {
    const a = await actor(req);
    return (
      await pool.query("SELECT * FROM organizations WHERE id=$1", [a.org])
    ).rows[0];
  });
  app.patch("/v1/institute", async (req) => {
    const a = await actor(req);
    admin(a);
    const data = z
      .object({
        name: text,
        name_ur: text,
        official_display_name: text,
        timezone: z.string().refine((x) => {
          try {
            Intl.DateTimeFormat("en", { timeZone: x });
            return true;
          } catch {
            return false;
          }
        }),
      })
      .parse(req.body);
    return transaction(async (db) => {
      await db.query(
        "UPDATE organizations SET name=$2,name_ur=$3,official_display_name=$4,timezone=$5 WHERE id=$1",
        [a.org, ...Object.values(data)],
      );
      await audit(db, a, "UPDATE", "organizations", a.org, null, data);
      return data;
    });
  });
  app.get("/v1/sections/:id/enrollments", async (req) => {
    const a = await actor(req),
      { id } = req.params as any;
    await scope(pool, a, uuid.parse(id));
    return (
      await pool.query(
        "SELECT e.*,s.student_number,s.full_name,s.full_name_ur FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.section_id=$1 ORDER BY e.roll_number",
        [id],
      )
    ).rows;
  });
  app.post("/v1/sections/:id/enrollments", async (req) => {
    const a = await actor(req);
    admin(a);
    const { id } = req.params as any;
    await scope(pool, a, uuid.parse(id));
    const d = z
      .object({
        student_id: uuid,
        roll_number: text,
        joined_on: schoolDate,
        left_on: schoolDate.nullable().default(null),
      })
      .parse(req.body);
    return transaction(async (db) => {
      const r = await db.query(
        "INSERT INTO enrollments(section_id,student_id,roll_number,joined_on,left_on) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [id, ...Object.values(d)],
      );
      await audit(db, a, "ENROLL", "enrollments", r.rows[0].id, null, d);
      return r.rows[0];
    });
  });
  app.post("/v1/sections/:id/staff", async (req) => {
    const a = await actor(req);
    admin(a);
    const { id } = req.params as any;
    await scope(pool, a, uuid.parse(id));
    const d = z
      .object({
        user_id: uuid,
        role: z.enum([
          "MUSHRIF",
          "CLASS_TEACHER",
          "AMEER",
          "ATTENDANCE_ASSISTANT",
        ]),
        starts_on: schoolDate,
        ends_on: schoolDate.nullable().default(null),
        ameerOverrideReason: z.string().min(5).optional(),
      })
      .parse(req.body);
    return transaction(async (db) => {
      if (d.role === "AMEER") {
        const enrolled = await db.query(
          "SELECT 1 FROM students s JOIN enrollments e ON e.student_id=s.id WHERE s.linked_user_id=$1 AND e.section_id=$2 AND e.state='ACTIVE'",
          [d.user_id, id],
        );
        check(
          enrolled.rowCount || d.ameerOverrideReason,
          "Ameer needs linked enrollment or recorded override reason",
        );
      }
      const r = await db.query(
        "INSERT INTO section_staff_assignments(section_id,user_id,role,starts_on,ends_on) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [id, d.user_id, d.role, d.starts_on, d.ends_on],
      );
      await audit(
        db,
        a,
        "ASSIGN",
        "section_staff_assignments",
        r.rows[0].id,
        null,
        d,
        d.ameerOverrideReason,
      );
      return r.rows[0];
    });
  });
  app.get("/v1/sections/:id/subjects", async (req) => {
    const a = await actor(req),
      { id } = req.params as any;
    await scope(pool, a, uuid.parse(id));
    const c = await capabilities(pool, a);
    if (!a.admin) {
      check(
        c.managedSections.includes(id) || c.teachingSections.includes(id),
        "Subject access denied",
        403,
      );
    }
    return (
      await pool.query(
        "SELECT o.*,s.code,s.name_en,s.name_ur FROM section_subjects o JOIN subjects s ON s.id=o.subject_id WHERE o.section_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM subject_teacher_assignments t WHERE t.section_subject_id=o.id AND t.teacher_user_id=$3 AND t.starts_on<=$4::date AND (t.ends_on IS NULL OR t.ends_on>=$4::date))) ORDER BY o.display_order",
        [id, a.admin || c.managedSections.includes(id), a.id, a.today],
      )
    ).rows;
  });
  app.post("/v1/sections/:id/subjects", async (req) => {
    const a = await actor(req);
    const { id } = req.params as any;
    await manage(pool, a, uuid.parse(id));
    const d = z
      .object({ subject_id: uuid, display_order: z.number().int().default(0) })
      .parse(req.body);
    return transaction(async (db) => {
      const r = await db.query(
        "INSERT INTO section_subjects(section_id,subject_id,display_order) VALUES($1,$2,$3) RETURNING *",
        [id, d.subject_id, d.display_order],
      );
      await audit(db, a, "CREATE", "section_subjects", r.rows[0].id, null, d);
      return r.rows[0];
    });
  });
  app.post("/v1/offerings/:id/teachers", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id);
    const d = z
      .object({
        teacher_user_id: uuid,
        starts_on: schoolDate,
        ends_on: schoolDate.nullable().default(null),
      })
      .parse(req.body);
    return transaction(async (db) => {
      const offering = await db.query(
        "SELECT section_id FROM section_subjects WHERE id=$1",
        [id],
      );
      check(offering.rowCount, "Offering not found", 404);
      await scope(db, a, offering.rows[0].section_id);
      const r = await db.query(
        "INSERT INTO subject_teacher_assignments(section_subject_id,teacher_user_id,starts_on,ends_on) VALUES($1,$2,$3,$4) RETURNING *",
        [id, ...Object.values(d)],
      );
      await audit(
        db,
        a,
        "ASSIGN",
        "subject_teacher_assignments",
        r.rows[0].id,
        null,
        d,
      );
      return r.rows[0];
    });
  });
  app.get("/v1/users", async (req) => {
    const a = await actor(req);
    admin(a);
    return (
      await pool.query(
        "SELECT u.id,u.email,u.display_name,u.active,array_remove(array_agg(r.role),NULL) AS roles FROM app_users u LEFT JOIN organization_roles r ON r.user_id=u.id AND r.is_active GROUP BY u.id ORDER BY u.display_name",
      )
    ).rows;
  });
  app.patch("/v1/users/:id", async (req) => {
    const a = await actor(req);
    admin(a);
    const id = uuid.parse((req.params as any).id);
    const d = z
      .object({ active: z.boolean(), admin: z.boolean() })
      .parse(req.body);
    return transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(29)");
      const count = await db.query(
        "SELECT count(*) FROM organization_roles r JOIN app_users u ON u.id=r.user_id WHERE r.role='ADMIN' AND r.is_active AND u.active",
      );
      const old = await db.query(
        "SELECT * FROM app_users WHERE id=$1 FOR UPDATE",
        [id],
      );
      check(old.rowCount, "User not found", 404);
      const isAdmin = await db.query(
        "SELECT 1 FROM organization_roles WHERE user_id=$1 AND role='ADMIN' AND is_active",
        [id],
      );
      check(
        !(
          isAdmin.rowCount &&
          Number(count.rows[0].count) <= 1 &&
          (!d.active || !d.admin)
        ),
        "Cannot remove last active admin",
      );
      await db.query("UPDATE app_users SET active=$2 WHERE id=$1", [
        id,
        d.active,
      ]);
      await db.query(
        "INSERT INTO organization_roles(organization_id,user_id,role,is_active) VALUES($1,$2,'ADMIN',$3) ON CONFLICT(organization_id,user_id,role) DO UPDATE SET is_active=$3",
        [a.org, id, d.admin],
      );
      await db.query('DELETE FROM session WHERE "userId"=$1', [
        old.rows[0].auth_subject,
      ]);
      await audit(
        db,
        a,
        "ACCESS_CHANGE",
        "app_users",
        id,
        { active: old.rows[0].active },
        d,
      );
      return { ok: true };
    });
  });
  app.get("/v1/audit", async (req) => {
    const a = await actor(req);
    admin(a);
    return (
      await pool.query(
        "SELECT * FROM audit_events WHERE organization_id=$1 ORDER BY event_at DESC LIMIT 200",
        [a.org],
      )
    ).rows;
  });
}
