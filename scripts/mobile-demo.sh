#!/usr/bin/env bash
# Docker supplies Node and Metro. Use only a trusted local network for HTTP tests.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { printf 'Start Docker Desktop first.\n' >&2; exit 1; }
action="${1:-start}"
case "$action" in start|demo|institute|login|logout|whoami) ;; *) printf 'Usage: bash scripts/mobile-demo.sh [demo|institute|login|whoami|logout]\n' >&2; exit 2;; esac
expo_home="${HIKMAH_EXPO_HOME_VOLUME:-hikmah-mobile-expo-home}"
interactive=(-i)
if [[ -t 0 && -t 1 ]]; then interactive=(-it); fi
if [[ "$action" == login || "$action" == logout || "$action" == whoami ]]; then
  docker image inspect hikmah-demo:local >/dev/null 2>&1 || { printf 'Run bash scripts/institute.sh start or bash scripts/demo.sh start once to build the image.\n' >&2; exit 1; }
  expo_args=("$action")
  if [[ "$action" == login ]]; then
    printf 'Sign in privately with the same Expo account used in Expo Go.\n'
    expo_args+=(--no-browser)
  fi
  exec docker run --rm "${interactive[@]}" -v "$expo_home:/home/node" -e EXPO_OFFLINE=0 \
    hikmah-demo:local node_modules/.bin/pnpm --filter @hikmah/mobile exec expo "${expo_args[@]}"
fi
mobile_host_ip="${HIKMAH_MOBILE_HOST_IP:-}"
if [[ -z "$mobile_host_ip" ]] && command -v ipconfig >/dev/null; then
  mobile_host_ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
fi
if ! [[ "$mobile_host_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'Find your Mac Wi-Fi IPv4 address in System Settings, then run HIKMAH_MOBILE_HOST_IP=your-ip bash scripts/mobile-demo.sh %s\n' "$action" >&2
  exit 1
fi
if [[ "$action" == institute ]]; then
  export HIKMAH_INSTITUTE_BIND=0.0.0.0
  bash scripts/institute.sh start
  mobile_api_port="${HIKMAH_INSTITUTE_PORT:-$(sed -n 's/^HIKMAH_INSTITUTE_PORT=//p' .env.institute)}"
  printf '\nUsing the INSTITUTE database. Sign in with your private institute account.\n'
else
  export HIKMAH_DEMO_BIND=0.0.0.0
  bash scripts/demo.sh start
  mobile_api_port="${HIKMAH_DEMO_PORT:-$(sed -n 's/^HIKMAH_DEMO_PORT=//p' .env.demo)}"
  printf '\nUsing the DEMO database. Sign in with your demo account.\n'
fi
printf 'Phone server address: http://%s:%s\nScan the fresh Expo Go QR below. Keep this Terminal open.\nUse trusted Wi-Fi. Sign Expo Go and CLI into the same Expo account (mobile-demo.sh login).\n' "$mobile_host_ip" "$mobile_api_port"
# Metro needs no database credentials. Only the public API address is injected.
exec docker run --rm "${interactive[@]}" -p 8081:8081 -v "$expo_home:/home/node" \
  -e "REACT_NATIVE_PACKAGER_HOSTNAME=$mobile_host_ip" \
  -e "EXPO_PUBLIC_API_URL=http://$mobile_host_ip:$mobile_api_port" \
  -e NODE_ENV=development -e EXPO_OFFLINE=0 \
  hikmah-demo:local node_modules/.bin/pnpm --filter @hikmah/mobile exec expo start --go --lan --port 8081
