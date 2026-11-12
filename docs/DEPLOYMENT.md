# Deployment and recovery

For the recommended managed PostgreSQL + Caddy HTTPS setup, follow [Hosting](HOSTING.md). The release/account and phone guides are [Institute release](INSTITUTE_RELEASE.md) and [Mobile testing](MOBILE_TESTING.md).

## Build and staging

Use separate databases, secrets, domains and backup storage for development, staging and production. Do not seed demo identities in production.

```sh
docker build -t hikmah-app:local .
# In the managed cloud, keep proxy trust enabled:
# docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t hikmah-app:local .
```

The Dockerfile accepts an optional build-only public CA mount for the managed proxy. It does not copy the CA or credentials into image layers. Builds retain TLS verification. Network allowlists must cover your image/package sources.

Set `POSTGRES_PASSWORD`, URL-encoded `DATABASE_URL` pointing to service `db`, `BETTER_AUTH_SECRET` (32+ cryptographically random characters), and `PUBLIC_ORIGIN` (HTTPS staff origin) through a secret manager or a protected deployment environment file. `.env.example` describes local variables; never deploy its local password. Set provider PostgreSQL TLS using pg's supported SSL settings and trusted CA; do not disable verification.

Next.js rewrites are computed during build. Set `API_INTERNAL_URL=http://api:3001` **at image build time** for Compose deployment; the Dockerfile defaults this build setting. For a different internal API hostname, supply the corresponding build argument. The API is accessible only through the web reverse proxy; no database or API container ports are published.

```sh
docker compose -f compose.production.yaml up -d --wait
# First administrator on an EMPTY production database (values securely injected):
docker compose -f compose.production.yaml exec \
  -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD api \
  node --import tsx scripts/bootstrap-admin.ts
```

Bootstrap aborts if an institute already exists. Additional staff use single-use private invitations in People & access; admins may grant another admin. Deliver activation links privately. The current version returns invitation links to the creating admin rather than sending email; password recovery uses a separate two-hour private link issued by an administrator after verifying identity. Automated email delivery and optional admin MFA are not connected. Account disablement and admin-role changes revoke sessions and protect the final active administrator.

Put an HTTPS reverse proxy in front of port 3000. Forward the original Origin and Host headers; cookie-authenticated writes require the configured origin. Terminate TLS on a trusted ingress, redirect HTTP to HTTPS, and configure HSTS there. Do not enable TRUST_PROXY unless the API can only receive traffic from your trusted proxy. Native clients use the same HTTPS host and bearer authentication. Invite/reset tokens and auth cookies must never be logged.

The same image can run web and API. It currently contains build tooling; slim immutable runtime images and registry signing can be introduced after deployment verification. Run migrations with the deployment role; use a restricted application database role in production and keep backups under separate credentials. Serialized migrations track checksums and refuse changed historical files. Roll forward with a reviewed migration; restore a verified backup for catastrophic schema recovery.

## Backup and restore

For the local Compose database, place an encryption passphrase in a protected file outside Git and preserve it separately from backup ciphertext:

```sh
BACKUP_PASSPHRASE_FILE=/secure/path/backup-key bash scripts/backup.sh
BACKUP_PASSPHRASE_FILE=/secure/path/backup-key bash scripts/restore-drill.sh \
  .data/backups/hikmah-TIMESTAMP.dump.enc
```

The drill decrypts into a randomly named disposable database, restores with errors fatal, verifies migrations/student rows, then drops only the disposable database. The backup uses pg_dump custom format and AES-256-CBC with PBKDF2. Use managed authenticated/encrypted object storage and access-controlled key storage for production backup transport/retention. These scripts target `compose.yaml`; adapt service/connection selectors for managed production PostgreSQL and test the adapted restore before rollout. Do not treat a local backup as an operational offsite retention plan.

Published PDFs are stored as immutable database bytea assets with SHA-256 hashes, so they are included in database backups and are authorized on each download. At larger scale, migrate these assets to a private immutable object store; do not expose public student file URLs.

## Required release verification

- Run the entire check suite, native exports and vulnerability audit against the locked dependencies.
- Execute login, attendance, mark entry, correction, result download and revocation on an actual Android device and an iOS device/simulator. JavaScript export alone does not meet this gate.
- Institute reviews actual paginated Urdu PDFs and approves official identity, grade/pass rules, attendance credits, rank rules, windows, group identities, eligibility and signatures.
- Restore a staging backup using production-equivalent keys/storage; record operator, date, database counts and recovery timings.
- Agree on the private recovery-link delivery process and configure optional admin MFA; review least-privilege database roles, monitoring, backup retention and privacy policies with the institute.
- Load-test actual class sizes and concurrent publishing before live exam traffic. CI's 120-calendar-day pagination check is not a production load test.
