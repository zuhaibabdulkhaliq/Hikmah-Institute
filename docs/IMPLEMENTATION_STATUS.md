# Implementation and verification record

Date: 6 November 2026. Original authority: `Hikmah_Final_Blueprint/agent/BUILD_THIS_APP.md`, requirements, API contract, both SQL migrations and synthetic examples. Original specification assets were left unchanged.

This is a working implementation of the core academic workflow across the requested stack. **It is not a declaration that every release gate or all 22 acceptance criteria have passed.** Native device E2E, institute sign-off, production operational validation and the implementation differences below remain outstanding.

## Local execution update — 10 November 2026

The Docker-only demo now has dedicated [Apple silicon/M4 instructions](MACOS-APPLE-SILICON.md) and an [older Intel/Ventura guide](MACOS-VENTURA.md). `scripts/demo.sh` provides start, test, status, logs and stop commands; startup applies migrations and seeds synthetic data. Private generated credentials stay in ignored `.env.demo`, and stopping retains the separate demo database volume. The test command rebuilds current source before running checks.

The updated Docker workflow passed lint, root/web/mobile type checks, all 27 database/PDF/domain tests, and the web/API production builds on the managed Linux x86_64 Docker engine. Repeat initialization preserved the private credentials and their file mode was 0600. The Node and PostgreSQL registry manifests both include Linux ARM64 images. Physical M4/macOS execution, native-device E2E and the live-rollout gates below remain unverified or outstanding; no institute policy is approved by this demo setup.

## Milestone record

| Milestone          | Implemented                                                                                                                                                                                                                                                                             | Verification and remaining work                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — foundation     | pnpm workspace, strict TS, PostgreSQL migration runner, Fastify, Better Auth, Next.js and Expo apps, shared packages, synthetic seed                                                                                                                                                    | Fresh disposable databases migrate and seed; real API/web sign-in tested. Native apps bundle; device sign-in remains unrun.                                                                                                                         |
| B — academic setup | Institute, editable years/programs/levels/sections/students/subjects; enrollment; effective staff/teaching assignments; admin grants/revocation; invitations; promotion API; CSV preview/apply/unused rollback                                                                          | CRUD and 9-level/two-section configuration tested; three assigned papers across two sections tested; cross-section denial tested. Rollover and unused-import rollback are also covered by API/database regression tests.                            |
| C — attendance     | Explicit calendars, complete eligible rosters, daily and atomic date-grid drafts, submit/lock/reopen, optimistic concurrency, idempotency, separately approved backdate windows (same-day drafts need no grading-policy approval), correction requests/review, audit/history and export | Incomplete submission, stale saves, failed-batch rollback, repeat retries and authorized Ameer backdating verified. Native interaction requires device verification.                                                                                |
| D — exams/marks    | Three default cycles for each new year; independent section attendance/exam dates; distinct paper codes; maxima, patterns, dates, groups; approval; assigned marks, statuses, submit/review/reopen; controlled scheme revisions with optional compatible mark copies                    | Synthetic 11-paper scheme and duplicate labels verified; scope/max/section guards tested; reviewed max changes preserve earlier records and require reapproval.                                                                                     |
| E — results        | Explicit versioned policy approval, decimal computation, configurable result eligibility/grades/pass rules/attendance/ranking, preflight hash, immutable revision publication, stored class/individual Urdu PDFs, authorized PDF/CSV archive                                            | Complete synthetic publication and correction runs tested against PostgreSQL; old snapshot/PDF stability verified. A3 class/A4 individual PDFs rendered, extracted and visually inspected. Official Urdu/template/policy approval remains external. |
| F — delivery       | CI workflow, container image/Compose deployment files, secure bootstrap, recovery links, encrypted backup/restore drill, test-isolated databases, browser smoke, Expo exports, deployment/runbook and a Maestro starter flow                                                            | Local checks, web smoke, native bundles and encrypted restore executed. CI itself has not run on GitHub. Native device E2E, staging pilot, production privacy/security/restore/load verification and operator training remain release gates.        |

## Executed checks

- `pnpm typecheck`: root/API/shared, Next.js and Expo TypeScript.
- `pnpm lint`: ESLint across new source.
- `pnpm test`: **27 passing tests, 0 failures, 0 skipped** in a disposable real PostgreSQL database. Tests contain many assertions and cover multiple acceptance IDs; 27 is not a claim that all 22 release acceptance tests are complete.
- `pnpm build`: Next.js production output and bundled Fastify API.
- Native SDK dependency validation using the bundled Expo compatibility map, plus separate iOS/Android JavaScript/Hermes exports. Offline SDK validation is labeled by Expo as less authoritative than its online service; bundling and typechecking were also run.
- Real headless Chromium login, dashboard, 20-learner attendance display, 513/600 raw result preview, policy editor and sign-out. Screenshots are under `.data/screenshots/` (ignored).
- Synthetic class/individual PDFs are under `.data/reports/` (ignored). Numeric `513 / 600` order is asserted from PDF text; class headings have two distinct Tafsir columns. A report rendering issue found during inspection was fixed with LTR numeric isolation and a numeric font.
- Production dependency audit: **0 reported vulnerabilities** after updating the locked maintained framework releases and compatible transitive fixes. This is registry evidence, not a full security certification.
- Docker deployment image built with proxy CA verification preserved. Production deployment itself has not been performed.
- Encrypted PostgreSQL dump restored into a disposable database and verified. The dump includes immutable published PDF storage; the local development seed itself remains unapproved and unpublished.

Use the checked-in commands to reproduce results; `/tmp` logs are transient and are not a substitute for CI artifacts.

## Acceptance mapping

| ID  | Evidence / status                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R01 | API tests edit all nine levels and create two sections in one level; each new year receives three cycles.                                                                                                                                                                      |
| R02 | Teacher sees exactly three assigned paper grids across two sections; unrelated-paper writes rejected.                                                                                                                                                                          |
| R03 | Section B Ameer read/write rejected; authorized backdated 20-person draft and full attendance flows tested. Native taps unrun.                                                                                                                                                 |
| R04 | Incomplete roster submission rejected with 422.                                                                                                                                                                                                                                |
| R05 | Policy-credit/zero-denominator calculations tested; effective enrollment eligibility and calendar filtering implemented. Inclusive join/leave boundaries and noninstructional-day rejection are verified; institution-specific transfer exceptions remain policy decisions.    |
| R06 | Overlapping windows reject save until explicitly acknowledged.                                                                                                                                                                                                                 |
| R07 | Eleven maxima total 600, six complete groups and distinct duplicate labels verified.                                                                                                                                                                                           |
| R08 | Both supplied numerical fixtures match exact group totals, totals and percentages.                                                                                                                                                                                             |
| R09 | Explicit GRADED zero accepted; pending/unknown blanks remain distinct.                                                                                                                                                                                                         |
| R10 | Unresolved mark states block preflight; only explicitly approved ABSENT/EXEMPT behavior resolves them.                                                                                                                                                                         |
| R11 | Negative, excess precision, paper maxima and cross-section enrollment rejection tested.                                                                                                                                                                                        |
| R12 | Unapproved policies prevent official publication while raw total preview remains available.                                                                                                                                                                                    |
| R13 | Direct approved maximum mutation rejected; reviewed revision creates new paper/group IDs, copies only valid scores and preserves old PDFs.                                                                                                                                     |
| R14 | Competition/dense ties and configured top-N tested.                                                                                                                                                                                                                            |
| R15 | A3 class and A4 individual reports generated and inspected; official institute visual sign-off pending.                                                                                                                                                                        |
| R16 | Source name correction and reviewed scheme change leave earlier snapshots/PDF bytes unchanged; new published result supersedes old state atomically.                                                                                                                           |
| R17 | Admin grants/revokes another admin; Ameer cannot escalate through hidden endpoints; last-admin protection implemented.                                                                                                                                                         |
| R18 | Invalid/duplicate/formula-style import values rejected; CSV quote/Urdu/formula escaping tested.                                                                                                                                                                                |
| R19 | 120 calendar dates paginate 100/20; 100 persisted 100-person sheets (10,000 records) loaded in 524 ms in a local serial API run. Production concurrency/SLA testing remains outstanding.                                                                                       |
| R20 | Web smoke and native JS exports passed. Actual iOS/Android login/attendance/marks/download E2E **not run**: this Linux environment has no attached native device, adb/emulator or Xcode simulator.                                                                             |
| R21 | Unsubmitted counting dates block coverage; missing records never become automatic absence.                                                                                                                                                                                     |
| R22 | Disabled accounts/expired assignments lose access without new login; role changes and password recovery revoke existing sessions. Clients clear data on invalid-session responses and recheck foreground/focus sessions; physical-device cache/session QA remains outstanding. |

## Implementation differences and follow-up

- Scheme/policy configuration has guided input controls, paper ordering, group membership and instant maximum checks; advanced JSON remains optional. Drag-and-drop is not implemented; explicit reorder buttons provide the ordering workflow.
- Imports accept canonical headers or an explicit source-column mapping selected before preview. Unused imported records may be rolled back; downstream FKs prevent destructive rollback after academic use.
- Class teachers can read class results; subject-only teachers receive no blanket result access. Configurable delegated publication/dual-control reviewer roles have not been implemented; publication and mark review are admin-only.
- Password recovery is administrator-assisted with private, expiring, single-use links. Automated email delivery and optional MFA require integration/configuration before adopting those operating procedures.
- The original OpenAPI reference is preserved, and the actual route surface is documented in `ARCHITECTURE.md`. The runtime `/v1/openapi.json` now expands registered routes and Zod inputs. Response envelopes are generic; a generated response-typed SDK remains a follow-up to the shared typed fetch client.
- Published assets use transactional private PostgreSQL storage rather than an external object bucket. Offsite backup retention, monitoring, private object-store migration at scale and production least-privilege role provisioning remain deployment work.
- Mobile history/correction requests, daily/recent multi-date attendance, mark states and report sharing are implemented and bundled. Physical-device behavior, accessibility/RTL on both operating systems, session-expiry UX and application-store signing remain unverified.

## Before live students

The institute must enter/approve its official identity, group identities, policy numbers, attendance windows, report eligibility, grade/pass rules, missing-status semantics, ranking and final template/signatures. Do not substitute the synthetic test-only rules. Run the remaining native, edge-case, concurrent load and staging/security/recovery checks, agree on private password recovery, and train an operator. No external deployment, environment publication or official student result publication was performed by this task.

## Deliverable tree

```text
apps/
  api/src/          auth, scopes, academic records, attendance, policies,
                    marks/CSV, revisions, immutable results, live OpenAPI
  web/app/         staff portal, guided configuration, account activation
  mobile/app/      Expo attendance, marks, history, correction and report flows
packages/
  domain/src/      schemas and exact decimal policies/calculations
  api-client/src/  shared client, models and session errors
  ui-tokens/src/   shared theme values
 db/migrations/    001–009: reference schema, auth, guards and workflows
scripts/           install initialization, migrations, synthetic seed,
                    bootstrap, isolated tests, PDF, browser, backup/restore
 tests/            domain, permission and PostgreSQL integration checks
 docs/             architecture, implementation evidence and deployment
Dockerfile         verified application image
compose*.yaml      local database and production service topology
.github/workflows/ CI definition (not yet executed on GitHub)
.maestro/          native attendance starter flow (not executed on a device)
```

Representative final command outcomes:

```text
pnpm test
  tests 27 | pass 27 | fail 0 | skipped 0
pnpm typecheck
  API/shared + Next.js + Expo: passed
pnpm lint
  passed
pnpm build
  Next.js optimized build + Fastify ESM bundle: passed
Expo export
  ios bundle + android bundle: passed
pnpm audit --prod
  info 0 | low 0 | moderate 0 | high 0 | critical 0
Deployment runtime
  PostgreSQL-backed /health: HTTP 200 {"status":"ok"}
```
