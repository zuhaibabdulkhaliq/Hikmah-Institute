#!/usr/bin/env bash
# Run from a Mac on trusted Wi-Fi. Docker supplies Node, Metro and dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { printf 'Start Docker Desktop first.\n' >&2; exit 1; }
action="${1:-start}"
case "$action" in start|login|logout|whoami) ;; *) printf 'Usage: bash scripts/mobile-demo.sh [start|login|whoami|logout]\n' >&2; exit 2;; esac
compose=(docker compose --project-name "${HIKMAH_DEMO_PROJECT:-hikmah-demo}" --env-file .env.demo -f compose.demo.yaml)
expo_home="${HIKMAH_EXPO_HOME_VOLUME:-hikmah-mobile-expo-home}"
if [[ "$action" != start ]]; then
  [[ -f .env.demo ]] || { printf 'Run bash scripts/demo.sh start once before signing in to Expo.\n' >&2; exit 1; }
  docker image inspect hikmah-demo:local >/dev/null 2>&1 || { printf 'Start Docker Desktop and run bash scripts/demo.sh start once to build the image.\n' >&2; exit 1; }
  expo_args=("$action")
  # Browser login redirects cannot reliably reach a browser from inside Docker.
  if [[ "$action" == login ]]; then
    printf 'Sign in with your Expo account, not your Hikmah account. Passwords are prompted privately.\n'
    expo_args+=(--no-browser)
  fi
  exec "${compose[@]}" run --rm --no-deps -v "$expo_home:/home/node" -e EXPO_OFFLINE=0 \
    api node_modules/.bin/pnpm --filter @hikmah/mobile exec expo "${expo_args[@]}"
fi
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
mobile_api_port="${HIKMAH_DEMO_PORT:-$(sed -n 's/^HIKMAH_DEMO_PORT=//p' .env.demo)}"
printf '\nPhone server address: http://%s:%s\nScan the Expo QR code below with Expo Go. Keep this Terminal open.\nThis shares the demo on your local network. Use trusted Wi-Fi.\niPhone: sign in to Expo Go and run bash scripts/mobile-demo.sh login once using the same Expo account.\n' "$mobile_host_ip" "$mobile_api_port"
exec "${compose[@]}" run --rm --no-deps -p 8081:8081 \
  -v "$expo_home:/home/node" \
  -e "REACT_NATIVE_PACKAGER_HOSTNAME=$mobile_host_ip" \
  -e "EXPO_PUBLIC_API_URL=http://$mobile_host_ip:$mobile_api_port" \
  -e EXPO_OFFLINE=0 \
  api node_modules/.bin/pnpm --filter @hikmah/mobile exec expo start --go --lan --port 8081
