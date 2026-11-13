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
  IFS= read -r -p 'Administrator email: ' administrator_email
  IFS= read -r -s -p 'Private password (12–128 characters): ' administrator_password
  printf '\n'
  IFS= read -r -s -p 'Confirm password: ' password_confirmation
  printf '\n'
  [[ "$administrator_password" == "$password_confirmation" ]] || { printf 'Passwords do not match.\n' >&2; exit 1; }
  # Send credentials on stdin, never in arguments or Docker environment options.
  # This wrapper works with the existing image; no image rebuild is needed.
  bootstrap_script='
import { z } from "zod";
try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 8192) throw new Error("Input is too long. Use an email and a password of 12–128 characters.");
    chunks.push(chunk);
  }
  const lines = Buffer.concat(chunks).toString("utf8").split("\n");
  if (lines.length !== 3 || lines[2] !== "")
    throw new Error("Setup input was incomplete. Run create-admin again and enter each field once.");
  const email = lines[0].trim().toLowerCase(), password = lines[1];
  if (!z.email().safeParse(email).success)
    throw new Error("Administrator email is invalid. Enter a complete email address without spaces inside it.");
  if (password.length < 12 || password.length > 128)
    throw new Error(`Password length is ${password.length}; it must be 12–128 characters. The password was not displayed or saved.`);
  process.env.BOOTSTRAP_ADMIN_EMAIL = email;
  process.env.BOOTSTRAP_ADMIN_PASSWORD = password;
  await import("./scripts/bootstrap-admin.ts");
} catch (error) {
  console.error("Administrator setup failed: " + error.message);
  process.exitCode = 1;
} finally {
  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
}
'
  printf '%s\n%s\n' "$administrator_email" "$administrator_password" | \
    "${compose[@]}" exec -T api node --import tsx --input-type=module -e "$bootstrap_script"
  unset administrator_password password_confirmation administrator_email bootstrap_script
  ;;
 stop) "${compose[@]}" stop ;;
 status) "${compose[@]}" ps ;;
 logs) "${compose[@]}" logs --tail 100 ;;
 *) printf 'Usage: bash scripts/institute.sh [start|create-admin|status|logs|stop]\n' >&2; exit 2 ;;
esac
