#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
config=.env.institute
[[ ! -L "$config" ]] || { printf 'Refusing a symlink at %s.\n' "$config" >&2; exit 1; }
if [[ -f "$config" ]]; then printf 'Existing %s preserved.\n' "$config"; exit 0; fi
command -v openssl >/dev/null || { printf 'OpenSSL is required.\n' >&2; exit 1; }
umask 077
set -o noclobber
{
 printf '# Private institute configuration. Preserve this file; never commit it.\n'
 printf 'HIKMAH_INSTITUTE_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)"
 printf 'HIKMAH_INSTITUTE_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)"
 printf 'HIKMAH_INSTITUTE_DATABASE=hikmah\n'
 printf 'HIKMAH_INSTITUTE_PORT=3002\n'
} > "$config"
printf 'Created %s. No demo accounts or academic data are included.\n' "$config"
