#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { printf 'Install and start Docker Desktop first.\n' >&2; exit 1; }
docker info >/dev/null 2>&1 || { printf 'Start Docker Desktop and wait for its engine.\n' >&2; exit 1; }
bash scripts/init-institute.sh
compose=(docker compose --project-name "${HIKMAH_INSTITUTE_PROJECT:-hikmah-institute-local}" --env-file .env.institute -f compose.institute.yaml)
case "${1:-start}" in
 start)
  if [[ -n "${HIKMAH_DEMO_BUILD_CA:-}" ]]; then
   docker build --secret "id=proxy_ca,src=$HIKMAH_DEMO_BUILD_CA" --build-arg API_INTERNAL_URL=http://api:3001 -t hikmah-demo:local .
  else
   docker build --build-arg API_INTERNAL_URL=http://api:3001 -t hikmah-demo:local .
  fi
  "${compose[@]}" up -d --wait
  port="${HIKMAH_INSTITUTE_PORT:-$(sed -n 's/^HIKMAH_INSTITUTE_PORT=//p' .env.institute)}"
  printf '\nInstitute ready: http://localhost:%s\nFirst installation: run bash scripts/institute.sh create-admin\nThe demo database was not changed. No seed is run in this mode.\n' "$port"
  ;;
 create-admin)
  read -r -p 'Administrator email: ' BOOTSTRAP_ADMIN_EMAIL
  read -r -s -p 'Private password (12–128 characters): ' BOOTSTRAP_ADMIN_PASSWORD
  printf '\n'
  read -r -s -p 'Confirm password: ' password_confirmation
  printf '\n'
  [[ "$BOOTSTRAP_ADMIN_PASSWORD" == "$password_confirmation" ]] || { printf 'Passwords do not match.\n' >&2; exit 1; }
  export BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
  "${compose[@]}" exec -T -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD api node --import tsx scripts/bootstrap-admin.ts
  unset BOOTSTRAP_ADMIN_PASSWORD password_confirmation BOOTSTRAP_ADMIN_EMAIL
  ;;
 stop) "${compose[@]}" stop ;;
 status) "${compose[@]}" ps ;;
 logs) "${compose[@]}" logs --tail 100 ;;
 *) printf 'Usage: bash scripts/institute.sh [start|create-admin|status|logs|stop]\n' >&2; exit 2 ;;
esac
