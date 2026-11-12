#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
config=.env.demo
if [[ -L "$config" ]]; then
  printf 'Refusing a symlink at %s.\n' "$config" >&2
  exit 1
fi
if [[ -f "$config" ]]; then
  printf 'Existing %s preserved.\n' "$config"
  exit 0
fi
command -v openssl >/dev/null || { printf 'OpenSSL is required to generate local credentials.\n' >&2; exit 1; }
umask 077
demo_database_password="$(openssl rand -hex 24)"
demo_auth_secret="$(openssl rand -hex 32)"
demo_login_password="${HIKMAH_INITIAL_DEMO_PASSWORD:-HikmahDemo2026!}"
[[ ${#demo_login_password} -ge 12 && ${#demo_login_password} -le 128 && "$demo_login_password" != *$'\n'* && "$demo_login_password" != *$'\r'* && "$demo_login_password" != *'$'* && "$demo_login_password" != *'#'* && "$demo_login_password" != [[:space:]]* && "$demo_login_password" != *[[:space:]] ]] || { printf 'Choose a 12–128 character demo password without line breaks, dollar signs or hash marks.\n' >&2; exit 1; }
set -o noclobber
{
  printf '# Private local demo configuration. Do not commit or share.\n'
  printf 'HIKMAH_DEMO_DB_PASSWORD=%s\n' "$demo_database_password"
  printf 'HIKMAH_DEMO_AUTH_SECRET=%s\n' "$demo_auth_secret"
  printf 'HIKMAH_DEMO_PASSWORD=%s\n' "$demo_login_password"
  printf 'HIKMAH_DEMO_PORT=3000\n'
} > "$config"
printf 'Created %s with private random database/auth secrets and a stable local demo password.\n' "$config"
printf 'Read HIKMAH_DEMO_PASSWORD in this file to sign in.\n'
