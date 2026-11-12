#!/usr/bin/env bash
# Explicit local-demo-only password setup. Never runs during ordinary startup.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env.demo && ! -L .env.demo ]] || { printf 'Keep your existing .env.demo in this folder first.\n' >&2; exit 1; }
compose=(docker compose --project-name "${HIKMAH_DEMO_PROJECT:-hikmah-demo}" --env-file .env.demo -f compose.demo.yaml)
"${compose[@]}" run --rm --no-deps -T api node --input-type=module <<'NODE'
import pg from 'pg';
import { createHash } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
if(process.env.NODE_ENV==='production') throw new Error('Fixed passwords are for the local synthetic demo only.');
const password='HikmahDemo2026!';
const id=key=>{const h=createHash('sha256').update('hikmah-demo:'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const db=await pool.connect();
try {
 await db.query('BEGIN');
 const org=await db.query("SELECT id FROM organizations WHERE id=$1 AND name='Hikmah Institute — synthetic demo'",[id('org')]);
 if(org.rowCount!==1) throw new Error('Synthetic demo institute not found. No account passwords were changed.');
 let changed=0;
 for(const role of ['admin','admin2','teacher','mushrif','subject','ameer']){
  const user=(await db.query('SELECT auth_subject FROM app_users WHERE id=$1 AND email=$2 FOR UPDATE',[id(role),`${role}@hikmah.example`])).rows[0];
  if(!user) continue;
  const result=await db.query(`UPDATE account SET password=$2,"updatedAt"=now() WHERE "userId"=$1 AND "providerId"='credential'`,[user.auth_subject,await hashPassword(password)]);
  if(result.rowCount!==1) throw new Error('Expected one demo password account; rolled back.');
  await db.query('DELETE FROM session WHERE "userId"=$1',[user.auth_subject]);
  await db.query(`INSERT INTO audit_events(organization_id,action,object_type,object_id,after_data,reason) VALUES($1,'FIXED_DEMO_PASSWORD_SETUP','app_users',$2,$3,$4)`,[id('org'),id(role),JSON.stringify({sessionsRevoked:true}),'Local operator explicitly installed the documented demo password']);
  changed++;
 }
 if(!changed) throw new Error('No demo accounts found.');
 await db.query('COMMIT');
 console.log(`Updated ${changed} synthetic demo accounts. Academic data and other staff accounts were preserved.`);
} catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();await pool.end();}
NODE
umask 077
config_temp="$(mktemp .env.demo.tmp.XXXXXX)"
trap 'rm -f "$config_temp"' EXIT
awk 'BEGIN {found=0} /^HIKMAH_DEMO_PASSWORD=/ {print "HIKMAH_DEMO_PASSWORD=HikmahDemo2026!"; found=1; next} {print} END {if(!found) print "HIKMAH_DEMO_PASSWORD=HikmahDemo2026!"}' .env.demo > "$config_temp"
chmod 600 "$config_temp"
mv "$config_temp" .env.demo
printf 'Local demo password: HikmahDemo2026!\nUse admin@hikmah.example, mushrif@hikmah.example, subject@hikmah.example or ameer@hikmah.example.\n'
