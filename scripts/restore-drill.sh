#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${BACKUP_PASSPHRASE_FILE:?Set the protected backup passphrase file}"
: "${1:?Pass the encrypted backup path}"
database="hikmah_restore_$(date -u +%s)_$$"
cleanup() { docker compose exec -T db dropdb -U hikmah --if-exists "$database"; }
trap cleanup EXIT
docker compose exec -T db createdb -U hikmah "$database"
openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$BACKUP_PASSPHRASE_FILE" -in "$1" | docker compose exec -T db pg_restore -U hikmah -d "$database" --exit-on-error
count="$(docker compose exec -T db psql -U hikmah -d "$database" -Atc 'SELECT count(*) FROM schema_migrations')"
test "$count" -ge 5
docker compose exec -T db psql -U hikmah -d "$database" -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS restored_students FROM students'
printf 'PASS: encrypted backup restored into a disposable database; migrations=%s\n' "$count"
