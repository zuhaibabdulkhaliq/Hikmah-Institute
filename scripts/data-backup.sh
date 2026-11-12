#!/usr/bin/env bash
# Backup/recovery operations are separate from ordinary staff workflows.
set -euo pipefail
cd "$(dirname "$0")/.."
key_file="${BACKUP_PASSPHRASE_FILE:-$HOME/.hikmah/backup.key}"
if [[ "${1:-}" == init-key ]]; then
 [[ ! -L "$key_file" ]] || { printf 'Refusing a symlink for the backup key.\n' >&2; exit 1; }
 if [[ -f "$key_file" ]]; then printf 'Existing backup key preserved: %s\n' "$key_file"; exit 0; fi
 umask 077
 mkdir -p "$(dirname "$key_file")"
 set -o noclobber
 openssl rand -hex 32 > "$key_file"
 chmod 600 "$key_file"
 printf 'Created private backup key: %s\nKeep another secure copy separately from the backups. Never replace this key during normal updates.\n' "$key_file"
 exit 0
fi
operation="${1:-}"
target="${2:-}"
case "$operation" in backup|verify|recover) ;; *) printf 'Usage: bash scripts/data-backup.sh init-key | backup TARGET | verify TARGET FILE | recover institute|production FILE\nTargets: demo, institute, local, production.\n' >&2; exit 2;; esac
command -v docker >/dev/null || { printf 'Start Docker first.\n' >&2; exit 1; }
[[ -f "$key_file" && -r "$key_file" && ! -L "$key_file" ]] || { printf 'Backup key missing/unreadable. Run init-key once, or set BACKUP_PASSPHRASE_FILE to your existing key.\n' >&2; exit 1; }
key_file="$(cd "$(dirname "$key_file")" && pwd)/$(basename "$key_file")"
case "$target" in
 demo) [[ -f .env.demo ]] || { printf 'Original .env.demo required.\n' >&2; exit 1; }; compose=(docker compose --project-name "${HIKMAH_DEMO_PROJECT:-hikmah-demo}" --env-file .env.demo -f compose.demo.yaml) ;;
 institute) [[ -f .env.institute ]] || { printf 'Original .env.institute required.\n' >&2; exit 1; }; compose=(docker compose --project-name "${HIKMAH_INSTITUTE_PROJECT:-hikmah-institute-local}" --env-file .env.institute -f compose.institute.yaml) ;;
 local) compose=(docker compose -f compose.yaml) ;;
 production) [[ -f .env.production ]] || { printf 'Original .env.production required.\n' >&2; exit 1; }; compose=(docker compose --env-file .env.production -f compose.production.yaml) ;;
 *) printf 'Choose demo, institute, local or production. For managed PostgreSQL use the hosting/backup guide.\n' >&2; exit 2;;
esac
if [[ "$operation" == recover && "$target" != institute && "$target" != production ]]; then
 printf 'Recovery writes a NEW database in institute/production only. Never run a recovered institute through the demo seed. Use verify for demo archives.\n' >&2
 exit 2
fi
crypto=(docker run --rm -i --network none --read-only --mount type=volume,destination=/tmp -v "$PWD/scripts/backup-crypto.ts:/backup/crypto.ts:ro" -v "$key_file:/run/backup-key:ro" "${HIKMAH_BACKUP_NODE_IMAGE:-node:24-bookworm-slim}" node /backup/crypto.ts)
# Extract only the database name; private connection strings stay inside the pipe.
database="$("${compose[@]}" config --format json | "${crypto[@]}" database)"
umask 077
pending=''
scratch=''
scratch_created=false
keep_database=false
cleanup() {
 local status=$?
 [[ -z "$pending" ]] || rm -f "$pending"
 if [[ "$scratch_created" == true && "$keep_database" == false ]]; then
  if ! "${compose[@]}" exec -T db dropdb -U hikmah --if-exists --force "$scratch" >/dev/null; then
   printf 'Could not remove recovery scratch database %s. Remove only that named scratch database after inspection.\n' "$scratch" >&2
  fi
 fi
 return "$status"
}
trap cleanup EXIT
if [[ "$operation" == backup ]]; then
 directory="${HIKMAH_BACKUP_DIRECTORY:-$PWD/.data/backups}"
 mkdir -p "$directory"
 pending="$(mktemp "$directory/.hikmah-pending.XXXXXX")"
 output="$directory/hikmah-$target-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 6).hikmah.enc"
 "${compose[@]}" exec -T db pg_dump -U hikmah -d "$database" --format=custom --no-owner --no-privileges | "${crypto[@]}" encrypt > "$pending"
 mv "$pending" "$output"
 pending=''
 printf 'Encrypted backup complete (AES-256-GCM):\n%s\nVerify it with: bash scripts/data-backup.sh verify %s "%s"\n' "$output" "$target" "$output"
 exit 0
fi
archive="${3:?Pass the encrypted backup file path}"
[[ -f "$archive" && -r "$archive" ]] || { printf 'Backup file is missing or unreadable.\n' >&2; exit 1; }
if [[ "$operation" == recover ]]; then prefix=hikmah_recovery; else prefix=hikmah_verify; fi
scratch="${prefix}_$(openssl rand -hex 12)"
"${compose[@]}" exec -T db createdb -U hikmah "$scratch"
scratch_created=true
printf 'Restoring to a NEW database only: %s\n' "$scratch"
"${crypto[@]}" decrypt < "$archive" | "${compose[@]}" exec -T db pg_restore -U hikmah -d "$scratch" --exit-on-error --no-owner --no-privileges
"${compose[@]}" exec -T db psql -X -qAt -U hikmah -d "$scratch" -v ON_ERROR_STOP=1 < scripts/verify-restored.sql
# Verify every recorded migration against this checkout; older archives are allowed.
migration_rows="$("${compose[@]}" exec -T db psql -X -qAt -F '|' -U hikmah -d "$scratch" -v ON_ERROR_STOP=1 -c 'SELECT name,checksum FROM schema_migrations ORDER BY name')"
[[ -n "$migration_rows" ]] || { printf 'Migration history missing.\n' >&2; exit 1; }
while IFS='|' read -r migration checksum; do
 [[ "$migration" =~ ^[0-9]{3}_[a-zA-Z0-9_]+\.sql$ && -f "db/migrations/$migration" ]] || { printf 'Use the matching/newer application version to restore this archive.\n' >&2; exit 1; }
 actual="$(shasum -a 256 "db/migrations/$migration" | awk '{print $1}')"
 [[ "$actual" == "$checksum" ]] || { printf 'Migration checksum differs: %s. Restore with the matching trusted source.\n' "$migration" >&2; exit 1; }
done <<< "$migration_rows"
if [[ "$operation" == verify ]]; then
 printf 'PASS: authenticated archive, restored schema/data and published PDF hashes verified. Your running database was unchanged.\n'
else
 # Do not revive previously issued sessions or unused password-recovery links.
 "${compose[@]}" exec -T db psql -X -q -U hikmah -d "$scratch" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DELETE FROM session;
UPDATE staff_invitations SET expires_at=LEAST(expires_at,now());
INSERT INTO audit_events(organization_id,action,object_type,after_data,reason)
 SELECT id,'DATABASE_RECOVERY','organizations','{"sessionsRevoked":true,"unusedLinksExpired":true}'::jsonb,'Operator recovered an authenticated backup into a separate database' FROM organizations;
COMMIT;
SQL
 keep_database=true
 printf 'Recovery is ready in database: %s\nOriginal running database: %s (unchanged).\n' "$scratch" "$database"
 if [[ "$target" == institute ]]; then
  printf 'Review the counts above. To switch later, set HIKMAH_INSTITUTE_DATABASE=%s in .env.institute and run bash scripts/institute.sh start. Keep the old database until acceptance.\n' "$scratch"
 else
  printf 'Review the recovery first, then update the database component of the private DATABASE_URL and restart the production services. Keep the old database until acceptance.\n'
 fi
fi
