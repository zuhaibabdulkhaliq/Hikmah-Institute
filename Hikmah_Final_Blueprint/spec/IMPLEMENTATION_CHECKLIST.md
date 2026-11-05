# Engineering implementation checklist

Mark every item with PR/commit and automated test link. Nothing is accepted merely because a UI screenshot looks correct.

## 0. Framework and infrastructure
- [ ] pnpm monorepo, strict TypeScript, formatting/linting, CI
- [ ] Next.js React admin app, Expo Router React Native app, Node Fastify API
- [ ] PostgreSQL clean migrations 001 + 002 with rollback plan, test DB
- [ ] Independent development/staging/production environment variables
- [ ] Auth provider token verification, secure sessions, admin MFA option
- [ ] Deterministic seed data, shared domain schemas, typed API client
- [ ] Audit, error codes, healthcheck and logging without student details

## 1. Academy setup
- [ ] Institute identity, timezone, logo, Urdu display fields
- [ ] Nine initial levels, other levels configurable
- [ ] Programs, academic years, multiple sections, year roster rollover
- [ ] Student CSV import/export, duplicates/roll validations
- [ ] Teacher/Ameer assignment with effective dates, multiple admins
- [ ] Subject and section offering catalog, multi-teacher support
- [ ] Negative RBAC tests and organization scoping tests

## 2. Attendance
- [ ] Section calendar with holidays/instructional dates
- [ ] Status enum P/A/L/LEAVE and UNMARKED validation
- [ ] Policy editor requiring approval for credits/denominators
- [ ] Single date and bulk multi-day attendance, completeness and submit
- [ ] Date window and old/locked sheet edit authorization, correction reason
- [ ] Participation joins/withdrawal effective dates
- [ ] Attendance summaries and coverage/preflight errors
- [ ] Mobile Ameer flow and assigned-class-only read/write tests

## 3. Exams
- [ ] Three default year cycles; custom cycle safe later
- [ ] Per-section attendance windows, exam schedules and deadlines
- [ ] Subject versus assessment paper distinction, duplicate labels supported
- [ ] Oral/written/practical paper types and question pattern string
- [ ] Editable paper maxima, exactly six default result groups, target max
- [ ] 33+33+34, 34+66, 100, 66+34, 34+66, 100 proposed fixture
- [ ] Scheme version approval and immutable approved snapshot
- [ ] Assigned subject teacher marks entry; typed status and mark range checks
- [ ] Explicit GRADED(0) versus PENDING/UNKNOWN_LEGACY_BLANK behavior
- [ ] Marks review/submission/edit reason/history

## 4. Results
- [ ] Server calculation with decimal arithmetic, deterministic tests
- [ ] Attendance per configured session period; no implied timetable cutoff
- [ ] Grade policy, pass rules and approved ranking tie policy forms
- [ ] Preflight stops on unresolved/ambiguous marks and missing attendance
- [ ] Versioned published snapshots (paper-level, group-level, student-level)
- [ ] Individual PDF and Urdu RTL class landscape PDF
- [ ] Class sorting, top-N displayed positions configurable
- [ ] PDF/CSV sensitive export authorization and audit
- [ ] Published source correction -> new result revision; old unchanged

## 5. Testing, operations and handover
- [ ] Unit results/attendance; DB migration integrity; API authorization
- [ ] Web E2E flows and Android/iOS screen checks
- [ ] Realistic class size and bulk attendance concurrency load checks
- [ ] Backup + tested restore, incident/audit/export procedures
- [ ] Private student-data handling approval and production roles
- [ ] Exact Urdu sample visual sign-off from institute; no real data in public repo
- [ ] A full runbook with `install`, `migrate`, `seed`, `dev`, `test`, `build`
