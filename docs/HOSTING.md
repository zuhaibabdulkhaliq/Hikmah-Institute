# Hosting Hikmah Institute

## Recommended installation

Use **one institute-owned app server running Docker**, **managed PostgreSQL 17+ with automatic backups and point-in-time recovery**, and **one HTTPS hostname** for the website and native API. For example, a reputable VPS provider plus a managed PostgreSQL service such as Neon or another provider supporting private database roles and verified TLS. Choose the region and retention with the institute. No provider account is provisioned by this repository.

This keeps database maintenance/backups with a managed provider while preserving the existing Next.js/Fastify/Python PDF deployment. Start with roughly 2 vCPUs, 4 GB RAM and 40 GB disk for staging; measure actual class sizes and concurrent PDF publication before choosing live capacity. These are starting resources, not a load guarantee. Assign someone responsibility for updates, monitoring and recovery. A completely managed container platform can run the same web/API image if it supports long-running processes, private service networking and sufficient memory; many short-lived function platforms are unsuitable for this Python PDF workflow.

Use separate staging/production databases, secrets and hostnames. Production must start with the bootstrap administrator, not synthetic seed/demo identities.

## 1. Prepare the accounts and domain

- Own a domain/subdomain, for example `school.your-domain.org`.
- Create a Linux app server (Ubuntu 24.04 LTS is a suitable choice), install Docker Engine and the Compose plugin using Docker's official instructions, and use SSH keys for administration.
- Set the DNS A record to the server's IPv4 address. Only create an AAAA record if IPv6 is configured and reachable.
- Allow HTTPS 443 and HTTP 80 for Caddy's certificate issuance/redirect. Restrict SSH to administrators. Do not publish ports 3000, 3001 or 5432.
- Create a managed database named `hikmah`. Use a migration/owner account and a distinct restricted `hikmah_app` account. Configure provider network restrictions if supported. Enable automatic backups/PITR and retain an independent recovery path.

The supplied [compose.hosted.yaml](../compose.hosted.yaml) exposes only Caddy's 80/443 ports. The API and web services communicate privately; PostgreSQL is external. [compose.production.yaml](../compose.production.yaml) remains available for a self-managed database, but requires its own offsite backups and HTTPS ingress.

## 2. Install source and private configuration

On the app server, clone your institute repository and enter its folder. Review the version to deploy; do not copy your Mac's `.env.demo`, demo volume, `.data` or test reports.

```sh
git clone https://github.com/zuhaibabdulkhaliq/Hikmah-Institute.git
cd Hikmah-Institute
cp deploy/production.env.example .env.production
chmod 600 .env.production
openssl rand -hex 32
```

The last command generates the **Better Auth secret**, not a login password. Store it privately and paste it into `.env.production` using your editor. Replace every example value:

- `SITE_HOST`: hostname only, without `https://` or a path.
- `PUBLIC_ORIGIN`: the matching `https://hostname`.
- `BETTER_AUTH_SECRET`: the generated random value, at least 32 characters.
- `DATABASE_URL`: the restricted app user's PostgreSQL connection.
- `MIGRATION_DATABASE_URL`: the migration owner's connection to the same database.

Use `sslmode=verify-full` and provider-supported trusted CA configuration for both database connections. URL-encode special characters in database passwords. Never use `rejectUnauthorized:false`, public demo passwords, or example secrets. Neither database URL is a mobile `EXPO_PUBLIC_*` setting.

If you already have the two local Noto `.deb` archives, put them in `docker-packages` before building to avoid downloading them again. Otherwise the image installs the needed fonts. No host Node, Python or font package is required.

## 3. Build, migrate and grant the app role

```sh
docker build --build-arg API_INTERNAL_URL=http://api:3001 -t hikmah-app:local .
docker compose --env-file .env.production -f compose.hosted.yaml config --quiet
docker compose --env-file .env.production -f compose.hosted.yaml run --rm migrate
```

In your managed database's SQL console, connected as the migration owner, run [deploy/application-role.sql](../deploy/application-role.sql). Create the private `hikmah_app` login through your provider first. Adjust the database/role name if different. The app role receives ordinary table access, not table ownership/DDL, CREATEDB or SUPERUSER. It cannot modify migration tracking; existing audit/immutability triggers remain enforced. Reapply grants after upgrades that introduce tables.

For TLS services using a provider-specific root certificate, mount that private deployment configuration into the API/migration containers and use pg's supported `sslrootcert` connection option. Use the provider's current connection instructions; do not disable verification to suppress a certificate error.

## 4. Start HTTPS and create the first administrator

```sh
docker compose --env-file .env.production -f compose.hosted.yaml up -d --wait
docker compose --env-file .env.production -f compose.hosted.yaml ps
```

Caddy obtains and renews a certificate for `SITE_HOST` when DNS and ports are correct. Its configuration is in [deploy/Caddyfile](../deploy/Caddyfile). Certificate state persists in named volumes. Do not remove these volumes during upgrades.

Create a **private initial administrator password**, 12–128 characters, using a password manager. Enter it through prompts rather than a command stored in shell history:

```sh
read -r -p 'Administrator email: ' BOOTSTRAP_ADMIN_EMAIL
read -r -s -p 'Private initial password: ' BOOTSTRAP_ADMIN_PASSWORD
printf '\n'
export BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
docker compose --env-file .env.production -f compose.hosted.yaml exec -T \
  -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD api \
  node --import tsx scripts/bootstrap-admin.ts
unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
```

Bootstrap only works on an empty institute database. It creates the two programs and nine class levels but no synthetic students or shared public accounts. Additional administrators/staff are created through the portal. Passwords are salted scrypt hashes. No production login password is hard-coded or published by this guide.

Open your HTTPS address and sign in. Under **Academic setup → Institute details**, set the actual English/Urdu/official names. Complete the real year, sections, students, calendars, curricula, staff assignments and policy approval using [the operator guide](INSTITUTE_RELEASE.md). Official grade bands and other unresolved settings need institute review before publication.

## 5. Connect phones

Use the **same public HTTPS origin**, for example `https://school.your-domain.org`, in the native app's **Server address** field. Each phone remembers it. Production/preview apps require HTTPS. Follow [mobile testing and distribution](MOBILE_TESTING.md) for Expo Go, development, Android APK, iPhone ad hoc/TestFlight and store-signing steps.

The mobile app stores only its session token and preferences in OS secure storage; it does not save login passwords. Changing servers discards the previous server's session. Browser sessions use secure HTTP-only cookies in production. Native bearer requests omit cookies, and account/role/password changes invalidate access server-side.

## 6. Verify before institute use

On a separate staging database, run the full test suite and native exports. Then use real iPhone/Android devices and the actual HTTPS site to complete the [device checklist](MOBILE_TESTING.md#device-acceptance-checklist). Pilot one class through attendance, CSV marks, submission/review, publication, PDF download and a correction revision. Verify English/Urdu layout, keyboard-only navigation, assignments and revoked access. Review the institute's actual multi-page Urdu PDF.

Restore a managed backup/PITR recovery into a **separate staging database**, never over the live database for a drill. Verify migration history, student/enrollment/attendance/marks counts and archived PDF hashes. Record the operator, duration, recovery point, evidence and remaining issues. Keep keys and backup access independent of the app server. PDFs are stored privately in PostgreSQL, so database backups include published documents.

Database backup settings are provider-specific; enabling an example compose file does not enable a provider's backups. Agree retention and a recovery target with the institute. Configure uptime alerts, disk/memory/database monitoring and notification ownership. No live provider configuration, restore acceptance, device signing or app-store submission is performed automatically by the source repository.

## 7. Updates and rollback

1. Back up and record the currently running Git commit/image. Keep `.env.production`, the managed database and Caddy volumes.
2. Validate the new version in staging first, including migrations and a restore drill.
3. Fetch the approved release, rebuild `hikmah-app:local`, run `migrate`, apply grants for new tables, then run `up -d --wait`.
4. Confirm health/sign-in, the current policy version, class roster and an archived PDF. Passwords are preserved; seed is never run in production.
5. An older image may be used only when its schema remains compatible. Database changes are not automatically reversed. Use a reviewed roll-forward or an approved restore/recovery plan for incompatible changes.

Never use `docker compose down -v` as an update or login fix. Do not expose the synthetic demo or its fixed password as the institute's production system.
