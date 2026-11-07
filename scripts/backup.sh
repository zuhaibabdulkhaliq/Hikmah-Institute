#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${BACKUP_PASSPHRASE_FILE:?Set a protected file containing the backup encryption passphrase}"
test -r "$BACKUP_PASSPHRASE_FILE"
umask 077
mkdir -p .data/backups
output=".data/backups/hikmah-$(date -u +%Y%m%dT%H%M%SZ).dump.enc"
docker compose exec -T db pg_dump -U hikmah -Fc hikmah | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:$BACKUP_PASSPHRASE_FILE" -out "$output"
printf '%s\n' "$output"
