#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { printf 'Docker is not installed. See the Docker-only local demo section in README.md.\n' >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null 2>&1 || { printf 'Start Docker Desktop, wait for its engine, then run this command again.\n' >&2; exit 1; }
compose=(docker compose --project-name "${HIKMAH_DEMO_PROJECT:-hikmah-demo}" --env-file .env.demo -f compose.demo.yaml)
init() { bash scripts/init-demo.sh; }
build() {
  if [[ -n "${HIKMAH_DEMO_BUILD_CA:-}" ]]; then
    docker build --secret "id=proxy_ca,src=$HIKMAH_DEMO_BUILD_CA" --build-arg API_INTERNAL_URL=http://api:3001 -t hikmah-demo:local .
  else
    docker build --build-arg API_INTERNAL_URL=http://api:3001 -t hikmah-demo:local .
  fi
}
case "${1:-start}" in
  start)
    init
    build
    "${compose[@]}" up -d --wait
    demo_port="${HIKMAH_DEMO_PORT:-$(sed -n 's/^HIKMAH_DEMO_PORT=//p' .env.demo)}"
    printf '\nDemo ready: http://localhost:%s\n' "$demo_port"
    printf 'Sign in as admin@hikmah.example; read HIKMAH_DEMO_PASSWORD in .env.demo.\n'
    ;;
  test)
    init
    build
    "${compose[@]}" up -d --wait db
    "${compose[@]}" run --rm --no-deps -e NODE_ENV=production api node_modules/.bin/pnpm check
    ;;
  stop)
    init
    "${compose[@]}" stop
    ;;
  status)
    init
    "${compose[@]}" ps
    ;;
  logs)
    init
    "${compose[@]}" logs --tail 100
    ;;
  *) printf 'Usage: bash scripts/demo.sh [start|test|stop|status|logs]\n' >&2; exit 2 ;;
esac
