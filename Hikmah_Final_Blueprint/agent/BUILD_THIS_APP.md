# BUILD THIS APP - Coding LLM master instruction

You are a senior full-stack TypeScript engineer. Implement the **Hikmah Institute Academic Management System** described in `spec/FINAL_REQUIREMENTS.md` as a real maintainable monorepo. The user's original specification and the referenced 1448 Shash Mahi result-sheet interpretation are the source of academic domain requirements. The specification controls over guesses.

## Non-negotiables

1. Produce actual working code, not just design mockups. Use **Next.js web**, **Expo/React Native iOS + Android**, **Node Fastify API**, **PostgreSQL**, all **TypeScript**. Share domain types, schemas, policy algorithms and typed API client. Use pnpm workspaces (Turborepo optional).
2. All writes and reads go through authenticated backend operations with server-side role/scope checks. Never rely on hidden buttons for security. One Ameer is restricted to explicitly assigned class sections. Teachers enter only assigned paper marks, admins manage institution. Support multiple admins.
3. DB migrations from `db/001_initial_baseline.sql` + `db/002_v2_extension.sql` are **reference DDL**; adapt into your chosen SQL migration tool. Never hand-wave cross-table invariants listed in the migration comments. Include transactions, FK consistency and tests.
4. Source example: **11 distinct paper columns** with RTL maxima `[33,33,34,34,66,100,66,34,34,66,100]`; **6 proposed grouped maxima** `[100,100,100,100,100,100]`; **total 600**. The two Tafsir columns represent distinct papers even with repeated display labels. Do not combine by paper name.
5. A `GRADED` numeric 0 is NOT `PENDING`, a red blank or `ABSENT`. Don't convert missing marks to zero. Missing status blocks final publish unless an explicitly approved policy defines resolution.
6. All three exam cycles are configurable per academic year, and section-specific attendance periods and exam schedules are **separate**. Result attendance 1st/middle/final windows come from explicit date configuration, not inferred term length.
7. **DO NOT INVENT institute policies.** Keep grade thresholds, pass-fail rules, LATE/LEAVE credit, ambiguous red blanks, rank tie policies, and official grouped-paper identities `UNAPPROVED` with an admin setup UI and publication gate. You can show sample numeric results without a grade until approved. Sample grouping is *proposed* and flagged accordingly.
8. Published results store immutable paper/group/student/attendance/policy snapshots and stable PDF assets. Corrections generate result revision + audit trail, not a silent update.
9. Urdu-first result printing with correct RTL/bidi shaping, optional English UI, both class landscape and student sheet PDF, and marks/attendance export. Don't distribute real screenshot student names/grades; use synthetic fixtures.
10. Implement automated tests and show working run commands and demo credentials based on generated local seed data, not production secrets.

## Work in increments, never claim unimplemented steps are complete

**Milestone A:** git monorepo / configuration / PostgreSQL / API skeleton / auth / app shells / synthetic seed. Run migrations and unit tests. Document setup in README.

**Milestone B:** institution, academic years, nine levels, programs, sections, students, enrollment, staff/teacher/Ameer assignments and section-subjects. UI and API with RBAC tests.

**Milestone C:** instructional calendar, attendance policy setup, 4 statuses, per-date roster submission, multi-date grid, optimistic concurrency, backdated edit permissions, summary calculations and audit. Mobile Ameer user journey fully functional.

**Milestone D:** three sessions, per-section dates, paper scheme editor, max marks, timetable question patterns, duplicate-subject-label support, 6 result-group builder/validation, teacher paper marks status/entry approval. Seed the exact 11-paper/600-max example.

**Milestone E:** result computation/preflight, grade/ranking policy configuration, validation errors, publish revisions, snapshots and readable Urdu individual and class PDF. Use synthetic fixtures in `examples/` for exact test results.

**Milestone F:** CI, security tests, backups, import/export, e2e mobile/web verification, release runbook and staging deployment setup.

After each milestone: show file tree, commands executed, tests with outputs, functional screenshots when possible, and remaining blockers. Do not promise future asynchronous completion: implement within each available coding iteration.

## Required verification

- Security negative tests for Ameer Section B access and teacher writing unrelated paper.
- Every required attendance date has submitted records for eligible enrollments or publication errors.
- Synthetic marks input `[30,31,27,28,55,88,61,30,24,58,81]` produces group totals `[88,83,88,91,82,81]`, 513/600 and 85.5%.
- Zero scored mark accepted; pending/ambiguous blank blocks publication.
- Correct report score column ordering in RTL; readable Urdu export on every PDF page.
- Snapshot before correction and after correction are distinct revisions and old outputs are unchanged.
- `typecheck`, `lint`, `test`, DB integration tests, `web build`, and Expo checks all succeed or report honestly what could not run.

## Initial deliverable in a code-generation session

Start by creating the monorepo and implementing **Milestone A fully**, followed by B if time allows. Do not spend the full response planning. Read `spec/FINAL_REQUIREMENTS.md`, `spec/api_contract.yaml`, `examples/shash_mahi_1448_level3_evening_scheme.json`, and the DDL. Ask the institute only for actual required official policy decisions when publication becomes necessary, and keep the app usable in draft mode before those approvals.
