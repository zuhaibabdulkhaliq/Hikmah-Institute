# Hikmah Institute Academic Management

A TypeScript workspace with a Next.js staff portal, an Expo Android/iOS app, a Fastify API, PostgreSQL migrations, and shared domain algorithms. The original build specification is preserved in `Hikmah_Final_Blueprint/`.

The implementation includes academic configuration, scoped staff assignments, synthetic enrollment, daily/grid attendance, teacher paper marks, explicit academic policy approval, result preflight, immutable publication revisions, Urdu PDF exports, staff invitation/activation, CSV import and encrypted backup tools. See [the delivery record](docs/IMPLEMENTATION_STATUS.md) for verification and limitations. This is **not yet approved for real student rollout**.

## Docker-only local demo

For Apple silicon Macs (M1/M2/M3/M4, including M4 Pro), follow [the Mac execution guide](docs/MACOS-APPLE-SILICON.md). Homebrew and a host Node installation are not required for the web/API/database demo.

For an Intel MacBook Pro 2017 on Ventura 13.7.8, follow [the Ventura guide](docs/MACOS-VENTURA.md) for Docker compatibility first. With a working compatible Docker engine, Node.js, Python, fonts and PostgreSQL can all run in containers:

```sh
bash scripts/demo.sh start
# Open http://localhost:3000 and read HIKMAH_DEMO_PASSWORD in .env.demo.
bash scripts/demo.sh test
bash scripts/demo.sh stop
```

This uses a separate synthetic demo database, retains data when stopped, and keeps private generated credentials outside Git and image layers. An unsupported older Docker Desktop is a local-demo workaround, not a production recommendation. Current supported macOS/Linux machines can use the same container workflow with a maintained Docker release.

## Local setup

Prerequisites: Node 24, pnpm **10.28.2**, Docker Compose, Python 3.12+, Pango libraries and Noto Arabic/Urdu fonts. On Debian/Ubuntu install `python3-venv libpango-1.0-0 libpangoft2-1.0-0 fonts-noto-core fonts-noto-extra`. Use the existing checkout; there is no need for another Git worktree.

```sh
corepack prepare pnpm@10.28.2 --activate
pnpm install --frozen-lockfile
node --import tsx scripts/init-local.ts
python3 -m venv .data/pdf-venv
.data/pdf-venv/bin/pip install weasyprint==66.0
# Set PDF_PYTHON to the absolute path of .data/pdf-venv/bin/python in .env.
docker compose up -d --wait db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The web portal runs on port 3000 and the API on 3001. `.env` contains a randomly generated `DEMO_PASSWORD`; read it locally and use it with any of these **synthetic local-only accounts**:

| Email                    | Access                                       |
| ------------------------ | -------------------------------------------- |
| `admin@hikmah.example`   | Administrator                                |
| `admin2@hikmah.example`  | Second administrator                         |
| `teacher@hikmah.example` | Class teacher of A; paper teacher of P01–P03 |
| `ameer@hikmah.example`   | Attendance in Section A only                 |

The seed refuses production mode, is repeatable, and creates 9 editable levels, 2 sections, 20 synthetic learners, 3 cycles, 11 papers and 6 proposed groups. The first two learners reproduce the supplied numeric fixtures. The other 18 have no marks. No grade thresholds, attendance credits, backdate permissions or ranking policies are approved automatically. There is no shared hardcoded password.

The prepared cloud instance already has dependencies, PostgreSQL and a PDF Python environment at `/workspace/.hikmah-tools/venv/bin/python`. Its existing `.env` points there. No environment configuration was republished by this coding task. If the shell's pnpm launcher points to a different release, use `/workspace/.toolchain/node_modules/.bin/pnpm` in this cloud instance.

## Run and verify

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
EXPO_OFFLINE=1 pnpm --filter @hikmah/mobile exec expo install --check
EXPO_OFFLINE=1 pnpm --filter @hikmah/mobile exec expo export --platform ios --platform android
# With API and web running:
CHROMIUM_PATH=/usr/bin/chromium pnpm exec tsx scripts/browser-smoke.ts
```

`pnpm test` creates a randomly named disposable PostgreSQL database, applies every migration, seeds synthetic data, runs the tests and drops only that database. The local database role therefore needs CREATEDB for this command. The tests use explicitly named **TEST ONLY** policy rules; these do not approve the development database's policies. Database/PDF integration is required; the test command does not silently skip unavailable services.

Native JavaScript bundles are not native device E2E tests. See the device verification checklist before rollout. CI is in `.github/workflows/ci.yml`.

## Workflow

1. Configure institute identity, programs, year dates, levels, sections, learners and teaching assignments in Academic setup.
2. Add instructional dates. Enter and submit a complete daily or multi-date attendance grid. Assigned staff can save today before grading policies are approved. Historical edit windows must first be explicitly approved under Historical edit permissions; administrator corrections require a reason.
3. Configure papers and groups under Exams & schemes. Codes identify papers independently of display labels. Approve the scheme to open marks entry. Paper maxima cannot be overwritten after approval. Use “Create a reviewed scheme revision” to preserve old papers and publications, optionally copy compatible marks, and require fresh submission/approval.
4. Teachers save and submit assigned papers. An administrator reviews and approves them. Unresolved marks remain distinct from numeric zero.
5. Under Policies, enter institute-approved credits, grade ranges, missing-mark resolutions, pass rules, result eligibility (active at window end or any enrollment in the window) and ranking choices. Saving a draft removes active approval until reviewed. No policy numbers are inferred from the sample.
6. Configure explicit section attendance windows, separately from exam dates. Acknowledge intentional overlaps. Validate results and resolve all blockers before publishing.
7. Publication stores names, paper/group definitions, policy, attendance source evidence, marks and stable individual/class PDF bytes. Corrections create a new revision with a reason and leave old downloads unchanged.

For JSON scheme/policy editors, validation messages describe missing or inconsistent fields. Grade bands cover 0–100; use 101 as the final exclusive upper bound. Competition/dense ranking, top-N display and passing-only eligibility are explicit options. Category labels and pass status are distinct: overall and per-paper minimums both apply, including an absent paper explicitly resolved to zero. Reports preserve the category and show pass/fail status separately. ABSENT can BLOCK or resolve to ZERO, EXEMPT can BLOCK or be EXCLUDEd; pending, withheld and unknown legacy blanks always block official publication.

## Mobile

```sh
# Set this non-secret address in apps/mobile/.env.local for your LAN or HTTPS API:
# EXPO_PUBLIC_API_URL=https://your-authorized-api-host
pnpm dev:mobile
```

Use a real API address reachable from the phone; its localhost is not the development host. For LAN development either set `HOST=0.0.0.0` for the API and use the computer's LAN address/port 3001, or use the web proxy's LAN address/port 3000. Use the HTTPS public web origin for deployed mobile clients. Expo uses SecureStore for session tokens. Ameer navigation has attendance, history and correction requests; assigned teachers also have paper entry and authorized reports. Report files are shared through the platform sheet and removed from app cache afterward. Offline writes are not queued. Use a development build or Expo-compatible device runtime for the selected SDK.

## Operations

- [Deployment and recovery](docs/DEPLOYMENT.md)
- [Implementation and acceptance record](docs/IMPLEMENTATION_STATUS.md)
- [Architecture and API notes](docs/ARCHITECTURE.md)
