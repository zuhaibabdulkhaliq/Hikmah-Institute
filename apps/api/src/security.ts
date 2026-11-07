import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.ts";
import type { FastifyRequest } from "fastify";
import { type DB, pool } from "./db.ts";
export class Problem extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function check(ok: unknown, message: string, code = 422): asserts ok {
  if (!ok) throw new Problem(code, message);
}
export type Actor = {
  id: string;
  org: string;
  name: string;
  admin: boolean;
  authId: string;
  today: string;
  timezone: string;
};
export async function actor(req: FastifyRequest): Promise<Actor> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  check(session, "Sign in required", 401);
  const { rows } = await pool.query(
    `SELECT u.*,r.role FROM app_users u LEFT JOIN organization_roles r ON r.user_id=u.id AND r.is_active=true WHERE u.auth_subject=$1 AND u.active=true`,
    [session.user.id],
  );
  check(rows.length, "Account disabled or not invited", 403);
  const org = await pool.query(
    "SELECT id,timezone,(now() AT TIME ZONE timezone)::date::text AS today FROM organizations ORDER BY created_at LIMIT 1",
  );
  return {
    id: rows[0].id,
    org: org.rows[0].id,
    name: rows[0].display_name,
    admin: rows.some((r) => r.role === "ADMIN"),
    authId: session.user.id,
    today: org.rows[0].today,
    timezone: org.rows[0].timezone,
  };
}
export async function scope(
  db: DB,
  a: Actor,
  section: string,
  kind: "read" | "attendance" | "results" = "read",
) {
  const exists = await db.query(
    `SELECT s.id FROM sections s JOIN academic_years y ON y.id=s.academic_year_id WHERE s.id=$1 AND s.organization_id=$2 AND ($3<>'attendance' OR y.state='ACTIVE')`,
    [section, a.org, kind],
  );
  check(exists.rowCount, "Section unavailable", 404);
  if (a.admin) return;
  const result = await db.query(
    `SELECT 1 FROM section_staff_assignments WHERE section_id=$1 AND user_id=$2 AND active=true AND starts_on<=$4::date AND (ends_on IS NULL OR ends_on>=$4::date) AND ($3<>'results' OR role='CLASS_TEACHER') UNION ALL SELECT 1 FROM subject_teacher_assignments t JOIN section_subjects s ON s.id=t.section_subject_id WHERE s.section_id=$1 AND t.teacher_user_id=$2 AND t.starts_on<=$4::date AND (t.ends_on IS NULL OR t.ends_on>=$4::date) AND $3='read'`,
    [section, a.id, kind, a.today],
  );
  check(result.rowCount, "Section access denied", 403);
}
export function admin(a: Actor) {
  check(a.admin, "Administrator required", 403);
}
export async function audit(
  db: DB,
  a: Actor,
  action: string,
  type: string,
  id: string | null,
  before: unknown,
  after: unknown,
  reason?: string,
) {
  await db.query(
    "INSERT INTO audit_events(organization_id,actor_user_id,action,object_type,object_id,before_data,after_data,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      a.org,
      a.id,
      action,
      type,
      id,
      JSON.stringify(before),
      JSON.stringify(after),
      reason ?? null,
    ],
  );
}
