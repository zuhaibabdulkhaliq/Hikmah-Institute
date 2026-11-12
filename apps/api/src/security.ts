import { createHash } from "node:crypto";
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
const sessions = new WeakMap<
  FastifyRequest,
  ReturnType<typeof auth.api.getSession>
>();
export function requestSession(req: FastifyRequest) {
  let session = sessions.get(req);
  if (!session) {
    session = auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    sessions.set(req, session);
  }
  return session;
}
export async function actor(req: FastifyRequest): Promise<Actor> {
  const session = await requestSession(req);
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
  kind:
    | "read"
    | "attendance"
    | "attendanceRead"
    | "results"
    | "manage" = "read",
) {
  const exists = await db.query(
    `SELECT s.id FROM sections s JOIN academic_years y ON y.id=s.academic_year_id WHERE s.id=$1 AND s.organization_id=$2 AND ($3<>'attendance' OR y.state='ACTIVE') AND ($3<>'manage' OR y.state IN ('PLANNED','ACTIVE'))`,
    [section, a.org, kind],
  );
  check(exists.rowCount, "Section unavailable", 404);
  if (a.admin) return;
  const result = await db.query(
    `SELECT 1 FROM section_staff_assignments WHERE section_id=$1 AND user_id=$2 AND active=true AND starts_on<=$4::date AND (ends_on IS NULL OR ends_on>=$4::date) AND ($3 NOT IN ('results','manage') OR role IN ('CLASS_TEACHER','MUSHRIF')) UNION ALL SELECT 1 FROM subject_teacher_assignments t JOIN section_subjects s ON s.id=t.section_subject_id WHERE s.section_id=$1 AND t.teacher_user_id=$2 AND t.starts_on<=$4::date AND (t.ends_on IS NULL OR t.ends_on>=$4::date) AND $3='read'`,
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

export async function manage(db: DB, a: Actor, section: string) {
  return scope(db, a, section, "manage");
}
export async function capabilities(db: DB, a: Actor) {
  const sectionRows = (
    await db.query(
      `SELECT t.section_id,t.role FROM section_staff_assignments t JOIN sections s ON s.id=t.section_id WHERE s.organization_id=$3 AND t.user_id=$1 AND t.active AND t.starts_on<=$2::date AND (t.ends_on IS NULL OR t.ends_on>=$2::date)`,
      [a.id, a.today, a.org],
    )
  ).rows;
  const teaching = (
    await db.query(
      `SELECT s.section_id,s.id AS offering_id FROM subject_teacher_assignments t JOIN section_subjects s ON s.id=t.section_subject_id JOIN sections c ON c.id=s.section_id WHERE c.organization_id=$3 AND t.teacher_user_id=$1 AND t.starts_on<=$2::date AND (t.ends_on IS NULL OR t.ends_on>=$2::date)`,
      [a.id, a.today, a.org],
    )
  ).rows;
  const permissionKey = JSON.stringify({
    admin: a.admin,
    classes: sectionRows.map((r) => [r.section_id, r.role]).sort(),
    offerings: teaching.map((r) => r.offering_id).sort(),
  });
  return {
    accessVersion: createHash("sha256").update(permissionKey).digest("hex"),
    managedSections: [
      ...new Set(
        sectionRows
          .filter((r) => ["MUSHRIF", "CLASS_TEACHER"].includes(r.role))
          .map((r) => r.section_id),
      ),
    ] as string[],
    attendanceSections: [
      ...new Set(sectionRows.map((r) => r.section_id)),
    ] as string[],
    teachingSections: [
      ...new Set(teaching.map((r) => r.section_id)),
    ] as string[],
  };
}
