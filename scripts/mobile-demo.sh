#!/usr/bin/env bash
# Run from a Mac on trusted Wi-Fi. Docker supplies Node, Metro and dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { printf 'Start Docker Desktop first.\n' >&2; exit 1; }
mobile_host_ip="${HIKMAH_MOBILE_HOST_IP:-}"
if [[ -z "$mobile_host_ip" ]] && command -v ipconfig >/dev/null; then
  mobile_host_ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
fi
if ! [[ "$mobile_host_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'Could not find your Wi-Fi IPv4 address. Run HIKMAH_MOBILE_HOST_IP=192.168.1.20 bash scripts/mobile-demo.sh with your actual Mac address.\n' >&2
  exit 1
fi
export HIKMAH_DEMO_BIND=0.0.0.0
bash scripts/demo.sh start
printf '\nPhone server address: http://%s:3000\nScan the Expo QR code below with Expo Go. Keep this Terminal open.\nThis shares the demo on your local network. Use trusted Wi-Fi.\n' "$mobile_host_ip"
compose=(docker compose --project-name "${HIKMAH_DEMO_PROJECT:-hikmah-demo}" --env-file .env.demo -f compose.demo.yaml)
exec "${compose[@]}" run --rm --no-deps -p 8081:8081 \
  -e "REACT_NATIVE_PACKAGER_HOSTNAME=$mobile_host_ip" \
  -e "EXPO_PUBLIC_API_URL=http://$mobile_host_ip:3000" \
  -e EXPO_OFFLINE=1 \
  api node_modules/.bin/pnpm --filter @hikmah/mobile exec expo start --go --lan --port 8081
