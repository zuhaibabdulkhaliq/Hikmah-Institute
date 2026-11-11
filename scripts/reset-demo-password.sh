#!/usr/bin/env bash
# Local synthetic demo recovery; no image rebuild or host Node installation.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env.demo && ! -L .env.demo ]] || { printf 'Run this from your existing demo checkout with its original .env.demo.\n' >&2; exit 1; }
compose=(docker compose --project-name "${HIKMAH_DEMO_PROJECT:-hikmah-demo}" --env-file .env.demo -f compose.demo.yaml)
"${compose[@]}" run --rm --no-deps -T api node --input-type=module <<'NODE'
import pg from 'pg';
import { createHash } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';

const password = process.env.DEMO_PASSWORD;
if (process.env.NODE_ENV === 'production' || !password || password.length < 12 || password.length > 128) {
  console.error('Recovery requires the local demo and a HIKMAH_DEMO_PASSWORD of 12–128 characters.');
  process.exit(1);
}
const id = (key) => {
  const h = createHash('sha256').update('hikmah-demo:' + key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let db;
try {
  db = await pool.connect();
  await db.query('BEGIN');
  const { rows } = await db.query(`
    SELECT u.auth_subject FROM app_users u
    JOIN organization_roles r ON r.user_id=u.id
    JOIN organizations o ON o.id=r.organization_id
    JOIN "user" a ON a.id=u.auth_subject
    WHERE u.id=$1 AND u.email='admin@hikmah.example' AND u.active
      AND a.email='admin@hikmah.example' AND r.role='ADMIN' AND r.is_active
      AND o.id=$2 AND o.name='Hikmah Institute — synthetic demo'
    FOR UPDATE OF u
  `, [id('admin'), id('org')]);
  if (rows.length !== 1) throw new Error('Active synthetic demo administrator not found; no changes made.');
  const result = await db.query(`
    UPDATE account SET password=$2,"updatedAt"=now()
    WHERE "userId"=$1 AND "providerId"='credential'
  `, [rows[0].auth_subject, await hashPassword(password)]);
  if (result.rowCount !== 1) throw new Error('Expected exactly one demo password account; no changes made.');
  await db.query('DELETE FROM session WHERE "userId"=$1', [rows[0].auth_subject]);
  await db.query(`
    INSERT INTO audit_events(organization_id,action,object_type,object_id,after_data,reason)
    VALUES($1,'LOCAL_DEMO_PASSWORD_RECOVERY','app_users',$2,$3,$4)
  `, [id('org'), id('admin'), JSON.stringify({ sessionsRevoked: true }), 'Local Docker operator restored demo administrator access from .env.demo']);
  await db.query('COMMIT');
  console.log('Demo administrator password reset. Academic data and other accounts were preserved.');
  console.log('Sign in as admin@hikmah.example using HIKMAH_DEMO_PASSWORD from .env.demo.');
} catch (error) {
  if (db) await db.query('ROLLBACK');
  console.error('Demo password recovery failed:', error.message);
  process.exitCode = 1;
} finally {
  db?.release();
  await pool.end();
}
NODE
