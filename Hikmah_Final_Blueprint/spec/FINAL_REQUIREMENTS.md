---
title: Hikmah Institute - Academic Management System
subtitle: Final implementation blueprint v2.0 | Web + Android + iOS
version: '2.0'
date: '2026-11-05'
status: Implementation-ready conditional specification
---

# Hikmah Institute | Academic Management System

**Final product, data, calculation, permissions, and implementation specification - v2.0 (05 November 2026)**

**Scope.** One private academic-management system for the institute's nine configurable class levels, multiple sections, multiple teachers and administrators, class Ameers, attendance, annual exam cycles, marks, results, and Urdu-friendly printable exports. Web and Android/iOS apps use the same backend and database. This is a technical blueprint, **not completed application code**.

**Document authority.** This version replaces the v1 blueprint. It incorporates (1) the institute's described workflow, (2) the supplied Darul Hikmah Shash Mahi examination schedule, and (3) the newly supplied **1448 Shash Mahi, level `ثالثہ (شام)` class result sheet**. Personal names and marks from the supplied photograph are deliberately not copied into developer fixtures. The screenshot is source evidence, not permission to distribute student data.

**Important boundary:** the actual report screenshot proves column counts/maxima and format but does **not** prove the exact grade threshold table, attendance credit policy, meaning of red blank cells, whether every class has the same grouping, or all official Wifaq examination rules. These are configurable with approval gates. No developer or coding LLM may invent them and call them official.

## 1. Executive decision and system goals

**Required outcome:** staff can configure an academic year, enroll learners, attach teachers and an Ameer to each section, record daily or multiple past dates of attendance, prepare three default exam sessions (Seh Mahi, Shash Mahi, Mock), enter exam-paper marks, calculate school-approved composite result groups, review/publish result sets, and export one-student and whole-section PDFs with snapshots that do not change when later data changes.

**Primary success measures:** zero cross-class privilege leakage; correct 600-mark example without rounding errors; no silently missing marks; period-specific attendance; exact reconstruction of published results; successful right-to-left Urdu PDF output; both mobile platforms and web work from the same API; no code changes required to add levels, sections, staff, paper maxima or cycles.

**Out of first release:** tuition billing, hostel, transport, payroll, online admissions, parent accounts, LMS, biometric attendance, attendance by QR/GPS, official Wifaq submission APIs, push notifications, and full offline conflict-resolution. These may be separate phases.

## 2. Verified source analysis and strict distinctions

### 2.1 New Shash Mahi marks sheet: observed structure

- Header includes institute name (`حکمہ انسٹیٹیوٹ کراچی` as visually rendered), 1448 examination year, Shash Mahi, and class `ثالثہ (شام)`.
- Right-to-left main columns: serial/roll number; student name; attendance percent; **11 assessed paper columns**; total; academic percent; category/grade (`تقدیر`); class position (`پوزیشن`).
- The assessed paper maximums, **in display order from right to left**, are `33, 33, 34, 34, 66, 100, 66, 34, 34, 66, 100`, totaling **600**.
- Two adjacent paper columns are both labeled `تفسیر`; they must remain distinct assessment IDs even if mapped to the same underlying subject.
- Other column labels read, from right to left: `حدیث`, `مبادی الاصول`, `اصول الشاشی`, `کافیہ`, `قدوری بیوع`, `قدوری جنایات`, `انشاء`, `نفحۃ العرب`, `شرح تہذیب`. Urdu spelling and canonical mappings should be confirmed during real data entry.
- Suggested **six 100-mark composite groups**, based on adjacent maxima: `(33+33+34)`, `(34+66)`, `(100)`, `(66+34)`, `(34+66)`, `(100)`. They are consistent with the user's description, **but the official grouping labels/identity are not printed in the sheet**. Approval required before production publication.
- Percent uses 1 decimal place in the example; e.g., `504 / 600 * 100 = 84.0%` (mathematical confirmation of displayed total, without recording any individual's identity).
- Only the highest positions are visibly numbered; do not assume every passing student must receive a displayed rank. Ranking and top-N display are configurable.
- Some cells show numeric zero on white, whereas other cells are red and blank; **a blank red cell cannot be safely treated as the same semantic state as an entered zero**. Attendance exists even for rows with no published marks.
- Some grades visible on the sample are `ممتاز`, `جید جدا`, `مقبول`, `راسب`; this sample is **insufficient to infer exact grade-band thresholds or subject-wise failure rules**.

### 2.2 Examination timetable: what it supports

- Supplied one-page Darul Hikmah Evening Program Shash Mahi timetable lists September 14, 16, 19, 21, 23, 24 for different levels/program groups. These are **examples from that historical examination**, not hardcoded recurring dates.
- Patterns like `2-1=33`, `3-2=66`, `2-1=34`, `4-3×33=100` describe question-selection/paper structure; they are **not formulas for reconstructing official maximum marks**. In particular `3×33` equals 99 mathematically, whereas the paper can officially be declared worth 100.
- Timetable footnotes describe some oral assessments. Assessment type is configurable (written, oral, practical, other), as is a descriptive instructions field.
- Exams may occur on different days for each section and subject; there must be a per-paper schedule.

### 2.3 Source-to-implementation rules

1. A **Subject** is a catalog item; a **Section Subject** is its offering to a specific class/year; an **Assessment Paper** is one separately scored column in one exam session. Never merge papers just because the Urdu heading repeats.
2. **Exam Question Pattern** is text; **Declared Max Marks** is a numeric field; **Composite Result Group** aggregates paper marks; **Total Result** aggregates groups. Store all four independently.
3. **Attendance percent** is an independent academic measurement. It is not averaged into 600 paper marks unless a future explicit policy requires that.
4. A **published result** is an immutable, versioned academic record. Corrections produce a new revision with authorized reason; do not mutate old PDFs or database snapshots.

## 3. Terminology and academic hierarchy

`Institute -> Program -> Academic Year -> Level -> Section -> Enrollment`, plus cross-cutting `User`, `Staff Assignment`, `Subject Catalog`, `Section Subject`, `Exam Session`, `Paper Assessment`, `Mark`, `Attendance`, and `Result Publication`.

- **Institute:** one organization initially, extensible to another campus/branch. Store official Urdu and English name, logos, contact, timezone (default `Asia/Karachi`), result footer/signatures and preferred languages.
- **Program:** `شام` (evening), morning, etc.; editable. Distinct class groups for each program.
- **Academic Year:** label (e.g. `1448`), optional Hijri label, exact Gregorian ISO start/end dates, timezone, PLANNED/ACTIVE/CLOSED/ARCHIVED. A Hijri year label is **never** mechanically converted to Gregorian boundaries.
- **Level:** nine created initially, identifiers and order stable, names editable. Unlimited future levels permitted unless admin policy blocks creation.
- **Section:** combination of program, academic year, level, section code; e.g. Third Level, Evening, Section A. Every year creates a new section instance.
- **Student:** stable internal UUID and institutional student number; separate from yearly roll number. Unicode Urdu/English names, optional guardian contact (privacy-controlled), active flag.
- **Enrollment:** one section/year membership period with joined/left dates, roll number, state; transfer and historical section movement preserved.
- **Class Teacher:** manages authorized section roster and supervises results; many teachers may be associated with a section if allowed.
- **Subject Teacher:** one person can teach many section-subjects; multiple co-teachers can be supported.
- **Ameer:** authorized member assigned to one or more **explicit** sections; default one section. Can enter attendance, not exams, rosters or marks; ideally linked to a student enrollment in that section (admin override possible, logged).

## 4. Roles, permission checks and account lifecycle

**Base RBAC plus resource scope plus time-bound assignments, not a client-side UI toggle.** A user may hold multiple roles simultaneously. Server permissions are evaluated from auth identity + organization + section + subject offering + effective date + record workflow state.

| Operation | Admin | Class teacher | Subject teacher | Ameer |
|---|---|---|---|---|
| Create/archive academic year, section, subject, exam scheme | All | No | No | No |
| Invite/administer accounts and grant admins | All (prefer super-admin approval for new admins) | No | No | No |
| Add/edit/deactivate students | All | Own section, subject to policy | No | No |
| View section roster | All | Assigned | Assigned section minimal roster | Own section minimal roster |
| Mark attendance, single date or date grid | All | Own section | No by default | Explicit assigned section |
| Correct locked/old attendance | Override with reason | Own section within configured window or approval | No | Only configured window; otherwise request correction |
| Configure paper maxima, result groups, exam dates | All | View; optionally propose | View assignments | No |
| Enter marks | All | Own section if enabled | Own paper only | Never |
| Approve paper marks | All | Own section if policy allows | Submit own marks, cannot self-approve if dual control enabled | No |
| Preview unpublished results | All | Own section | Own subject data only by default | Never |
| Publish/unpublish by new revision | All | Only if explicitly delegated | No | No |
| View/export published class results | All | Own section | Assigned section if permitted | No |
| View/export individual published result | All | Own section | Assigned students if permitted | No |
| View security/audit | All (auditor optional) | Changes in own scope where allowed | Changes in own scope where allowed | Own entries where allowed |

**Login:** invitation-based email/phone + password or OTP, with account activation/disable, forgotten password, admin revocation, rate-limiting, secure token storage. Use a maintained auth provider or a vetted auth framework; no hand-rolled crypto. Support multiple admins. Student public/parent portal **not included** in MVP. No automatic broad access if a teacher is reassigned.

**Mandatory negative tests:** Ameer assigned Section A cannot read or write Section B by changing URL/JSON ID; subject teacher cannot write another teacher's marks; withdrawn staff loses active access; expired academic year role does not leak; direct calls to hidden endpoints are rejected with 403/404 and audited when appropriate.

## 5. Academic year setup, rollover and records

**Wizard:** Create year -> select 9 level catalog -> create sections/programs -> assign staff and Ameer -> enroll students/import CSV -> configure term attendance calendars -> configure default three exam sessions -> clone/adapt subject offerings and paper schemes -> open attendance/marks.

- Archive, do not delete historical years. A class name update must not mutate last year's printed result.
- Promotion copies eligible students into new enrollments and optionally copies subject templates; roll numbers may change. Transfers are effective-dated and have change audit trails.
- Prevent two overlapping active enrollments in conflicting sections of the same program/year unless an admin explicitly uses an override policy.
- Students can join late, leave mid-session or transfer. Attendance denominator must count only eligible enrolled instructional days.
- CSV import has preview, duplicate detection, column matching, validation errors, rollback and import audit. Excel export optional; CSV must support UTF-8 Urdu.

## 6. Attendance module - daily and multi-date

**Status enum:** `PRESENT`, `ABSENT`, `LATE`, `LEAVE`. These are distinct from `UNMARKED`; missing record must never silently become ABSENT.

**Web workflow:** choose year, program, level, section, date -> show enrolled roster -> mark all present option -> edit exceptions -> save draft -> submit -> lock (optional) -> view percentage dashboard. **Bulk workflow:** choose allowed date range and grid of students × dates; fill entire class or selected records, inspect conflicts, batch-submit transactionally. **Mobile:** fast single-day attendance, previous/next date, save/submit, clear locked-state message, section picker only if assignments permit.

**Calendar:** per-section calendar dates and flags: instructional or noninstructional, counts_for_attendance, holiday label, optionally session count per day. If institute has one roll-call daily, one row = one attendance opportunity. A future multi-period extension must not be implied without confirmation.

**Default governance baseline (adjustable):** an Ameer may edit assigned-section drafts for the current date and a short authorized backdate window, but not future dates, closed periods, or locked historical results. The **size of that window needs approval**; initial config should say `UNCONFIGURED`, not silently use 7 or 14. Teachers/admin may reopen within recorded workflow with reason, with downstream published-result revision handling.

**Draft/submitted/locked:** no partial submission; a submitted section-day must have exactly one status for each eligible student, not twice. Locks can be admin and result-publish locks. `row_version`/optimistic concurrency avoids another teacher overwriting edits. Every changed mark/status has actor, timestamp, before/after and correction reason.

**Attendance numerator/denominator:** policy is **organization/year configurable**; admin must approve the weight and denominator effect of each status. Example *illustrative only*: P=1/1, A=0/1, L=1/1, LEAVE=0/0 (excluded). Alternative policies are possible; this example **must not be labeled official**. Formula for any student:

`attendance_percent = 100 * sum(attendance_earned_credit) / sum(attendance_possible_credit)`

- Filter to configured session attendance start/end, section's counting days, dates inside the student's enrollment, and submitted/locked attendance (not drafts).
- If any required counted date lacks submitted attendance, report a *coverage error* and prevent publication unless an admin executes an audited documented exception (do not silently exclude absent data).
- If denominator = 0, display `N/A` and block or allow publication according to an explicitly configured policy; **never display 0% as though zero attendance were observed**.
- Round for display as approved (sample shows 1 decimal). Keep decimal precision internally.

## 7. Three exam sessions and attendance windows

**Initial default cycles:** `SEH_MAHI`, `SHASH_MAHI`, `MOCK`. Custom sessions permitted later. Dates are editable by academic year and, if needed, section. Each session records exam schedule, mark-entry deadline, result expected date, attendance date window, grading policy snapshot, and status.

**Proposed non-overlapping attendance schedule** (subject to admin approval): first cycle from start of academic year to its first cutoff; second from the day after first cutoff to second cutoff; mock from day after second cutoff to final cutoff. Store those exact dates **explicitly**; use the examination timetable separately. Noninstructional days do not affect denominator. Warning if attendance windows overlap or have unintended gaps; may be approved intentionally.

**Core relation:** Year has multiple exam cycles; Cycle has section-specific setting; each section has multiple papers per cycle; each paper has one or more schedule entries, marks, max, optional pass criterion and question pattern. A paper is linked to a section-subject and to **exactly one** result group (unless policy supports ungraded informational assessments).

**Schedule editing:** set paper date/time, location, examiner, paper instructions, oral/written type, mark entry window and published timetable. Changes after entries exist require reviewed scheme revision; changes after publication create a new result revision, never rewrite past data.

## 8. Subject catalog, paper maxima and six 100-mark group scheme

**Source example for level `ثالثہ (شام)`, Shash Mahi, Hijri label 1448:**

| Order (RTL) | Paper label | Max marks | Proposed group | Note |
|---:|---|---:|---|---|
| 1 | تفسیر | 33 | G1 | first Tafsir paper (unique ID) |
| 2 | تفسیر | 33 | G1 | second Tafsir paper (unique ID) |
| 3 | حدیث | 34 | G1 | G1 = 100 |
| 4 | مبادی الاصول | 34 | G2 |  |
| 5 | اصول الشاشی | 66 | G2 | G2 = 100 |
| 6 | کافیہ | 100 | G3 | G3 = 100 |
| 7 | قدوری بیوع | 66 | G4 |  |
| 8 | قدوری جنایات | 34 | G4 | G4 = 100 |
| 9 | انشاء | 34 | G5 |  |
| 10 | نفحۃ العرب | 66 | G5 | G5 = 100 |
| 11 | شرح تہذیب | 100 | G6 | G6 = 100 |
| **Total** | **11 paper columns** | **600** | **6 groups** | **Configuration exemplar, not authoritative grouping approval** |

**Group rules:** `group.max = 100` by default and `sum(component.contribution_max) == group.max` at approval time. For sample config contributions equal paper maxima; no scaling. If a future school scheme wishes 20 or 40 or 60 point papers, configure any positive maxima, including decimals if needed, and combine accordingly. Reject a group with max total 99/101 at publication unless it has an approved normalization policy and a documented transform. Final total is sum of approved groups, not always 600 for other classes. Group and paper order is explicitly configured.

**Other variants:** same subject may appear multiple times (e.g., two Tafsir papers); a teacher may teach multiple subjects; two teachers may co-teach; different exam cycles may have different paper offerings and group mapping. Printed six groups can differ from visible 11 paper columns: track both. Keep a versioned **exam scheme** so editing an upcoming cycle cannot silently alter published scheme.

**Question design fields:** `question_pattern` (text), `paper_instructions` (text), `assessment_type` (WRITTEN/ORAL/PRACTICAL/OTHER), `declared_max_marks` (decimal), `pass_marks` (nullable), `display_label_ur`, `display_label_en` and separate `display_order`.

## 9. Marks entry and approval workflow

1. Admin configures and **approves** paper/max/group scheme before official marks entry. A teacher sees only assigned papers, students enrolled on the date/rule, and current cycle.
2. `PENDING` (not entered), `GRADED` (including numeric **0**), `ABSENT`, `EXEMPT`, `WITHHELD`, and optionally `NOT_APPLICABLE` are distinct statuses. Only `GRADED` stores numeric awarded marks. Every other status stores a NULL raw mark (unless legacy import metadata is preserved separately).
3. Server rejects marks below 0 or exceeding max; numeric precision must match configured scale; fail if paper/section enrollment mismatch; require reason on post-submission change.
4. Teacher bulk entry grid supports keyboard navigation, save draft, submit, totals, completion counts and import from CSV. Teachers cannot alter maxima.
5. Class teacher/assigned reviewer approves papers if enabled; admin resolves conflicts. Admin may enter or correct marks with audit reason.
6. Before publication, no `PENDING`/`WITHHELD` may remain unless an approved policy explicitly permits them. `ABSENT` may contribute zero only if policy expressly says so. `EXEMPT` requires an approved denominator/normalization rule; otherwise block publication.
7. **The sheet's red blank cells are unresolved.** Never silently convert an unentered paper to zero. In a legacy import, map these to `UNKNOWN_LEGACY_BLANK`, require review, and allow resolution to `ABSENT`, `GRADED(0)` or other recognized status with reason.
8. Every marks-edit creates a chronological audit event. Optimistic concurrency plus row locks prevent lost updates. If a published result needs correction, generate a new result run revision; old results stay retrievable by admin.

## 10. Result calculation engine - normative algorithm

**Calculations run only on the server from stored approved policy/scheme.** The web and native clients render returned values; they never independently decide final grades/ranks.

**Preflight:** validate exam cycle and section are same year; six configured groups (or approved section-specific count); all required papers mapped exactly once; each group sums to its target; enrollment eligibility; every required mark resolved; attendance coverage; dates correct; grade/attendance/ranking policy configured; only qualified reviewer can publish.

**For each student:**

1. For each assessment, determine effective points: GRADED => awarded; ABSENT => 0 **only if policy**; EXEMPT => policy-specific exclusion/reweight; PENDING/WITHHELD => error by default.
2. For each group, `group_awarded = sum(effective_paper_points)` without scaling when paper_maxima sum to 100. `group_possible = group.target_max` (100 in source example).
3. `total_awarded = sum(group_awarded)`; `total_possible = sum(group_possible)`; `academic_percentage_exact = 100 * total_awarded / total_possible`; `academic_percentage_display = approved rounded number of decimals (sample 1)`.
4. `attendance_percentage` is computed independently from approved attendance window and attendance policy, with a coverage check.
5. `subject_pass` and `overall_pass` use **configured rules**, not guessed Wifaq cutoffs. `grade` is selected by approved precedence/grade bands plus any subject-fail override policy.
6. **Ranking:** evaluate the cohort defined by section/cycle and eligibility filters. Sort by **unrounded academic total** descending (or approved rule); apply an explicit tied-position policy (`competition`, `dense` etc.). Attendance as tiebreaker must not be assumed. Display only configured positions if top-3-style sheet is desired.
7. Snapshot all used paper marks/statuses, source scheme name/max, result groups, totals, grade, attendance counts/date window, grade policy version, rank, student/section/teacher labels, timestamps and revisions into immutable JSON/database rows.
8. Generate result PDF from the frozen snapshot, not by querying mutable master records at download time.

**Formula test (synthetic, non-identifying):** 11 earned marks in RTL order `[30,31,27,28,55,88,61,30,24,58,81]`; groups are `[88,83,88,91,82,81]`; total `513/600`; academic percent `85.5%`. A separate synthetic `P=18, L=2, A=2, LEAVE=1` example yields an attendance percentage **only after a particular approved attendance policy is selected**.

**Rounding:** Use decimal/fixed-point, not JS binary floating-point to determine academic status. Round at display layer only, after ranking and grade selection, with an explicitly chosen rounding mode. A `504/600` result displays `84.0%` at one decimal.

## 11. Grade bands, failure criteria, rank and data correctness

- Admin defines independent versioned policy per institute/year/program/level/cycle if desired: percentage brackets (`label_ur`, `label_en`, min inclusive, max exclusive, order), pass status, optional paper/group minimums, exception policy, and positions to show.
- Visible labels from sample (`ممتاز`, `جید جدا`, `مقبول`, `راسب`) are **suggestions for seed labels only**, never numeric cutoffs. More grades may exist; use institution-approved bands.
- A zero-mark entered explicitly (`GRADED, value=0`) is a valid score; missing mark (`PENDING`) is not.
- A paper max change after mark entry requires controlled migration or new version. Prevent invalid students with awarded > max.
- **Do not trust the row's red background** as definitive proof of absence or no-show. Treat it as a rendering clue requiring manual classification.
- Published results must include a human-readable result revision and optional `supersedes_revision` reference.

## 12. Printable reports, Urdu layout and exports

**Report types:** (1) individual report card for a selected student/cycle/year, (2) whole-section landscape marks sheet matching the visual structure of the supplied example, (3) optional section summary (statistics by grade/attendance), (4) attendance register/date-range export, (5) marks grid/CSV.

**Whole-class result sheet:** top institute title + academic year/session + level/program/section; right-to-left columns serial/roll, student name, attendance %, each individual paper label/max, total/max, academic %, grade, position. The **source sheet shows 11 paper columns and total 600** for one section/cycle; layouts must automatically adapt to other counts/maxima. Urdu headers and numbers must not overlap. Highlight missing/exempt values using accessible status labels and configurable colors; color alone must not encode an exam outcome.

**Individual report:** institute branding, student ID and name, program/level/section/roll, cycle/year, each of six group values and optional paper breakdown, total, percentage, grade, attendance percentage, result revision/date, signature positions; avoid inventing mandatory Wifaq fields without approval.

**Export rules:** authorized users only; PDF is server-generated from snapshot; landscape A3 or wider if 11+ columns; compact pagination/column-repeat; legible Noto Arabic font, proper RTL text shaping and bidirectional numbers; support Urdu first and English where configured. Each PDF has publication revision, generated time, identity/roll and optional verification code. Names and results are sensitive student records; do not place live sample data in public repos or coding LLM prompts.

**CSV exports:** UTF-8 with BOM if required by spreadsheet consumers; safe escaping of formula-like input (`=`, `+`, `-`, `@`), controlled headers, audit of export action.

## 13. Web portal user experience and screens

**Navigation:** Dashboard; Academic Years; Programs and Levels; Sections; Students; Teachers/Users; Staff & Ameer Assignments; Subjects & Teaching; Attendance; Exams/Timetables; Marks; Result Schemes; Results Review & Publish; Reports & Exports; Audit; Settings.

- Dashboard: current year, number of active sections/students, today attendance completion, missing rolls, upcoming exams, papers pending marks, result publication alerts.
- Section detail: year/program/level, roster, active/previous Ameers, class teacher assignments, subject offerings, attendance calendar, three exam cycles, result history.
- Student profile: name, student number, section history, school attendance summaries, each published exam result with print button; no unauthorized cross-section search.
- Attendance grid: roster left or right depending locale; dates across columns; multi-edit paste/select; filtered status counts, incomplete sheet alerts; require confirm for overwriting multiple dates.
- Exam scheme builder: drag/reorder paper columns, choose subject and paper label, paper max, teacher, exam date, question pattern, group assignment; instant `G1..G6` sum validation and an RTL preview.
- Marks entry: matrix student × assigned paper, mark state selector, max shown, autosave drafts only, lock/submit action, missing indicators, responsive fallback.
- Publish workflow: Review sections and totals -> preflight warnings/errors -> reviewer approval -> publish version -> regenerate one/class PDFs -> access controls and archive.
- Settings: institute names/logo/timezone; attendance policy; date/edit windows; grade/rank rules; signed-off exam schemes and document templates.

## 14. Mobile app screens (Android + iOS)

**Ameer-first workflow:** Sign in -> assigned class cards -> today roster -> tap status P/A/L/Leave -> quick whole-class present -> save/submit -> calendar/date picker -> historical batch grid (simplified) -> personal entry history and correction request. Ameer has **no marks screen**.

**Teacher workflow:** assigned sections and teaching subjects, attendance (class teacher), marks entry for own papers (subject teacher), teacher review queue, class published results if authorized. **Admin** may use web first; native admin overview optional for MVP.

**Mobile specifics:** tap targets >=44px, offline indicator rather than fabricated sync, local data protection, searchable Urdu roster, RTL support, session expiration/revocation, loading/error/empty states, retries with request idempotency keys. Expo web is possible, but a separate Next.js admin portal is preferred because of complex grids/print views. Reuse domain, validation and network libraries across all apps; don't promise 100% UI reuse.

## 15. Technical architecture and technology decisions

**Recommended monorepo:** `pnpm + Turborepo` (or pnpm workspaces). `apps/web` = Next.js + React + TypeScript; `apps/mobile` = Expo + React Native + Expo Router + TypeScript; `apps/api` = Node + Fastify (or NestJS if team prefers) + TypeScript; `packages/domain` = common types, Zod validation and deterministic result/attendance algorithms; `packages/api-client` = typed fetch/React Query adapters; `packages/ui-tokens` = theme/token library, not a forced universal component system; `packages/config` = lint/TS tooling; `db/migrations` = PostgreSQL SQL.

**Data:** PostgreSQL (UUID PKs, FK constraints, unique scopes, transactions, indexed joins, effective dates). Migration tooling may use Drizzle or Prisma compatible with selected stable version; retain SQL invariants and database-level constraints. `NUMERIC`/decimal for marks. Store UTC timestamps, local school dates (`DATE`) and institute timezone separately.

**Auth:** secure managed identity (e.g. Supabase Auth or another audited provider) behind API JWT validation, not directly exposing service credentials to mobile/web. Database policies and API scope checks defense-in-depth. Tokens stored using platform-secure storage on phones, secure HttpOnly session cookie on web. Access only via server authenticated API for records-changing endpoints.

**Infra:** HTTPS reverse proxy; API container; managed PostgreSQL; private object storage for published PDF snapshots; automated encrypted backups and recovery test; separate development/staging/production environments; sanitized logs; secrets in server environment. No need for Redis/jobs until workload justifies; PDF export may use a queue when real class sizes require it.

**Code quality:** strict TS, schema validation at each external boundary, generated OpenAPI, unit/integration/E2E tests, CI lint/test/typecheck/migration check, lockfile, no arbitrary `latest` dependency in production. Developers should consult current maintained official framework docs at implementation time.

```text
hikmah/
  apps/web/       Next.js admin portal and authorized teacher web views
  apps/mobile/    Expo/React Native Ameer and teacher app
  apps/api/       Fastify typed REST API, auth, RBAC, PDF renderer, audit
  packages/domain/       calculations, policies, TS types, Zod schemas
  packages/api-client/   typed API client, query keys, typed errors
  packages/ui-tokens/    styles, colors, RTL/bidi helpers
  db/migrations/         reviewed SQL migrations
  db/seeds/              synthetic fixture generator
  tests/                 contract + RBAC + calculation + E2E tests
  docs/                  this specification, diagrams and ADRs
  .github/workflows/     CI checks
```

## 16. Core relational database design (normative data model)

**All main relationships use UUID PKs and explicit FKs.** Production migration must verify organization/year/section consistency, effective date eligibility, and immutable publications, including via constraint triggers or validated service transactions. Source `db/001_initial_baseline.sql` is historical v1; **use `db/002_v2_extension.sql` after it** to implement all confirmed v2 additions. For a new clean deployment apply 001 then 002 in order.

| Domain | Main tables | Cardinality / invariant |
|---|---|---|
| Organization | `organizations`, `organization_settings`, `programs`, `levels`, `academic_years`, `sections` | 1 institute has years/levels/programs; each section belongs to one of each |
| Identities | `app_users`, `organization_roles`, `section_staff_assignments` | multiple admins/teachers; assignments time-bounded |
| Students | `students`, `enrollments` | student has one-to-many year/section enrollments |
| Teaching | `subjects`, `section_subjects`, `subject_teacher_assignments` | many papers may refer to same subject offering |
| Attendance | `section_calendar_days`, `attendance_sheets`, `attendance_records`, `attendance_policies`, `attendance_status_rules` | one sheet per section/date; one record per eligible enrolment |
| Examinations | `exam_cycles`, `exam_section_settings`, `exam_assessments`, `exam_schedule_entries`, `exam_scheme_approvals` | three default cycles per year; per section cutoff/scheme |
| Mark sheets | `marks`, `result_groups`, `result_group_components`, `mark_change_requests` | one mark state per paper/student; papers map to report groups |
| Grade rules | `grade_scales`, `grade_bands`, `ranking_policies` | versions and named, approved scales |
| Publication | `result_runs`, `result_snapshots`, `result_snapshot_groups`, `result_snapshot_papers`, `document_exports` | immutable snapshots and revisioned result PDFs |
| Operations | `audit_events`, `data_import_jobs`, `file_assets` | immutable change trace and private files |

**SQL numeric maxima & constraints:** awarded 0..max (cross-table guard); 1 mark row per assessment/enrollment; one paper maps to a max of one group; on scheme approval groups validate exactly 100 or configured target, all required papers covered; `period_start <= period_end`; max number of score digits bounded; no live hard delete of referenced student/staff data; published snapshots cannot be UPDATE/DELETE except explicit retention-policy admin archival without alteration.

**DB and service separation:** SQL schema defines *storage* and basic constraints. `packages/domain` defines the authoritative calculations, but API verifies permissions/workflow in transactions; a calculation library alone cannot enforce auth. The SQL starter explicitly lists cross-table invariants to implement with tests/triggers, not magic `CHECK` constraints.

## 17. ER diagram explanations

Diagram A: Organization/year/level/section, student enrollment, people assignments and teaching. Diagram B: Calendar, attendance sheets, eligible enrollment, attendance policy and session-specific window. Diagram C: Exam cycle/section, assessment paper, group components, marks, grade/rank rules, immutable result run and PDF export. See `diagrams/` PNG/SVG/Mermaid files in developer ZIP.

**Identity model:** Users are not students automatically; student identities can be linked to a user account if desired. An Ameer is a user with section assignment, not a globally privileged role. **Teaching model:** one subject catalog row can have multiple subject offerings across years/sections; an exam paper is a separate assessed entity.

## 18. Server API contract - versioned REST

All endpoints require auth except health/login flows. Examples below are suggested stable `api/v1` route design; the included `api_contract.yaml` gives request/response shapes. All write routes validate `requestId` or `Idempotency-Key` for bulk attendance and publication as needed.

| Method/route | Purpose | Guard |
|---|---|---|
| `GET /v1/me` | roles, scoped assignments, profile | logged in |
| `GET/POST /v1/academic-years` | list/create | read/admin |
| `GET/POST /v1/sections` | class section search/create | scoped/admin |
| `GET/POST /v1/sections/:id/enrollments` | list and enroll | assigned/admin |
| `POST /v1/sections/:id/staff` | assign teacher or Ameer | admin |
| `GET /v1/sections/:id/calendar` | eligible dates | scoped |
| `GET/PUT /v1/sections/:id/attendance/:date` | read, edit draft | scoped, date window |
| `POST /v1/sections/:id/attendance/bulk` | multi-date upsert | scoped, date window, atomic |
| `POST /v1/sections/:id/attendance/:date/submit` | ensure completeness | scoped |
| `POST /v1/sections/:id/attendance/:date/reopen` | authorized correction | teacher/admin and reason |
| `GET/POST /v1/exam-cycles` | configure cycles | read/admin |
| `GET/PUT /v1/exam-cycles/:cycle/sections/:section/scheme` | scheme/group config | admin, draft only |
| `POST /v1/exam-cycles/:cycle/sections/:section/scheme/approve` | lock scheme | admin |
| `GET /v1/assessments/:id/marks` | assigned mark grid | teacher/admin |
| `PUT /v1/assessments/:id/marks/bulk` | mark entries, state | assigned teacher/admin |
| `POST /v1/assessments/:id/submit` | submit marks | assigned teacher/admin |
| `POST /v1/results/:cycle/:section/validate` | return errors/warnings and preview | teacher/admin |
| `POST /v1/results/:cycle/:section/publish` | immutable snapshot revision | admin or delegated |
| `GET /v1/results/:run/sectionsheet.pdf` | snapshot-derived class PDF | authorized |
| `GET /v1/results/:run/students/:enrollment.pdf` | snapshot-derived individual PDF | authorized |
| `GET /v1/audit` | filter audit | admin |

**Response semantics:** `400` invalid input, `401` unauthenticated, `403` denied, `404` scoped resource not found, `409` conflict/version mismatch, `422` domain rule violation with `field_errors` and `blocking_errors`. Pagination, sort and filters standardized. Error messages bilingual where possible. Never leak another student's existence in error details.

## 19. Security, privacy and governance

- Treat students' names, marks, attendance and grades as sensitive education records. Restrict exports, short-lived download URLs, audit who downloaded a whole-class sheet, no public indexing.
- Do not upload unredacted real class results to public GitHub or external coding models. Developer fixtures in this package are synthetic; uploaded original evidence was used only for column/schema interpretation.
- HTTPS/TLS, secure sessions, MFA for admins where feasible, least privilege, password/OTP rate limits, CSRF protection on cookie flows, SQL parameterization, validation, output escaping, dependency scanning.
- Prevent `tenant_id`/`section_id` spoofing. Derive organization scope server-side, cross-check foreign keys, and optionally use DB row-level security where supported.
- Logs exclude tokens, passwords, complete student mark payloads by default; audits record actions with controlled before/after access.
- Encrypted backups; tested restoration; retention/deletion/privacy policies agreed with institute, no arbitrary retention duration presented as legally required.
- No passwords or auth secrets bundled with developer files; seed data entirely fabricated.
- Multiple admins can exist; privilege grants and revocations auditable. New admin invitation should require at least one existing admin; avoid last-admin lockout.

## 20. Operational lifecycle and error recovery

**Monthly routine:** review unsubmitted dates and orphan marks; run backup restoration drill; confirm staff assignment validity. **Exam routine:** approve scheme -> publish schedule -> lock paper maxima -> open marks -> verify marks -> validate attendance windows -> preview -> approve -> publish -> snapshot exports. **Correction:** reopen relevant source record under authorization -> record reason -> revise/revalidate affected result -> publish new revision -> retain old view for auditors, show latest by default.

**Bulk failure rules:** transactions must either apply entire batch or return row-level errors with no partial committed state unless an explicit partial-mode is requested and approved. Duplicate mobile requests use idempotency keys. Display record version and ask user to refresh on concurrency conflicts. Strict time-zone date resolution on the server.

## 21. Report preview and source fidelity

**Landscape class marks sheet layout**, per supplied sample, RTL: `No. | Student | Attendance % | 11 paper score columns with per-paper maxima | Total / 600 | Academic % | Grade | Position`. Actual RTL render places `No.` at far right and ranking at far left. Heading should show institute, Shash Mahi 1448, class `ثالثہ (شام)` with approved exact name. The real institute logo/address/footer are configurable, not guessed. Mark blanks carry visible statuses, not color alone.

**Sample without identifying personal data:**

| Student (synthetic) | Paper 1..11 raw scores (RTL) | Group totals | Total | % |
|---|---|---|---:|---:|
| Student A | 30,31,27,28,55,88,61,30,24,58,81 | 88,83,88,91,82,81 | 513/600 | 85.5 |
| Student B | 16,22,19,24,38,49,40,20,16,31,64 | 57,62,49,60,47,64 | 339/600 | 56.5 |

Attendance, grade and position are left as `POLICY_REQUIRED` until institute chooses official rules. These are intentionally **not** copies of real pupil records.

## 22. Validation and acceptance tests (must pass before rollout)

**Acceptance test ID -> expected outcome:**

- `R01`: configure nine level names and at least two sections in one level without code edits; success.
- `R02`: a teacher assigned three subjects across two sections sees those paper grids only; no wider access.
- `R03`: Ameer can mark 20 classmates today and a permitted backdate; Section B API responds 403/404.
- `R04`: submitted attendance missing one eligible student fails with a clear error; no silent ABSENT.
- `R05`: day outside enrollment or noninstructional day excluded from denominator; results correct.
- `R06`: overlapping attendance windows produce warning; approval requires explicit acknowledgment or correction.
- `R07`: 11 source example paper maxima sum to 600; groups show exactly six 100s; duplicate `تفسیر` label remains two separate papers.
- `R08`: synthetic scores `[30,31,27,28,55,88,61,30,24,58,81]` produce 513, 85.5%, and `[88,83,88,91,82,81]` groups.
- `R09`: explicit `GRADED(0)` is accepted and distinguishable from `PENDING` or legacy red blank.
- `R10`: missing `PENDING`, `WITHHELD`, unapproved EXEMPT, unapproved absence resolution prevent publication.
- `R11`: decimal mark above max or below zero rejected; mismatched enrollment/section rejected.
- `R12`: grade rule is not inferred from labels; unconfigured policy blocks grade publication, though preview of raw totals may be allowed.
- `R13`: changing paper max after approved scheme rejected unless controlled revision path.
- `R14`: ranking ties follow configured policy; display top-three only if selected.
- `R15`: print individual A4 report and landscape full-class Urdu PDF with stable RTL ordering and readable all columns.
- `R16`: after publication, editing student name or marks does not alter old PDF/snapshot; new publication revision created.
- `R17`: one admin may assign another admin; Ameer cannot grant privileges even via API.
- `R18`: CSV with duplicate student ID or formula injection safely rejected/escaped and reports row errors.
- `R19`: 100 consecutive day attendance sheet loads with pagination and performant query indexes for realistic class sizes.
- `R20`: iOS+Android+web login, attendance, teacher marks and result downloads pass E2E with audit history.
- `R21`: unsubmitted date is treated as an error in attendance coverage, never a counted absence or an automatic exclusion.
- `R22`: admin loses session/role access immediately on revocation, with sensitive cache invalidated.

## 23. Prioritized implementation roadmap

**Phase 0 - Foundation:** repository/CI, auth, DB migrations, synthetic data, error handling, audit, test runner. Exit: seeded instructor/admin/Ameer sign in on web/mobile, RBAC negative tests pass.

**Phase 1 - Academic setup:** years, nine levels, sections, students, enrollment, staff and subjects. Exit: import students into two sections, assign class teachers and subject teachers, year rollover works.

**Phase 2 - Attendance:** calendar, daily and multi-day attendance, submission/lock/reopen, policy and coverage reports. Exit: Ameer cannot access other sections, old date rules correct, summary calculation tests pass.

**Phase 3 - Exam paper schemes and marks:** three sessions, per-section cutoff, schedules, 11-paper/600 fixture, six groups, entry status, teacher approval. Exit: complete synthetic Shash Mahi class with custom paper max and duplicate label behavior.

**Phase 4 - Published results:** preflight, grade/rank policy UI, snapshot, revision, Urdu landscape/individual PDF, downloadable exports. Exit: 22 acceptance tests, historic snapshot freeze and sample visual sign-off.

**Phase 5 - Deployment and training:** staging pilot using sanitized data, staff walkthrough, backups, monitoring, documented admin runbook, production roll-out. **Real student data only after access/privacy approvals.**

**Defer:** offline-first sync, parent portal, notifications, SMS, fees and Wifaq external integration unless required for the real launch.

## 24. Approval decisions the institute must make

**These do not block building the core framework, but they block claiming a correct official result sheet.** They are represented as explicit configurable policies with `UNAPPROVED` defaults and UI warnings.

| Priority | Decision | Unapproved default |
|---|---|---|
| **BLOCKER** | Exact group identities for 11 paper columns and whether all six groups are always 100 | proposed mapping in sample, requires approval |
| **BLOCKER** | Official grades, percentages and pass/fail threshold including paper-level fail rules | no final grades until policy approved |
| **BLOCKER** | LATE/LEAVE attendance numerator and denominator contribution | no official attendance percent until policy approved |
| **BLOCKER** | Meaning of red blank mark cells; statuses for no-show/exempt and their effect on total | import unknown, hold publication |
| **BLOCKER** | Actual attendance start/end dates per cycle/section and date inclusivity | require configured dates |
| **HIGH** | Who approves/reopens marks and who can publish (admin only or teacher delegation) | admin-only publication; teachers submit |
| **HIGH** | Which rank positions appear; tie behavior; eligible students | grade-policy approval required |
| **HIGH** | Which exact nine level names/programs and official institute name/spelling/logo | admin enters before deployment |
| **HIGH** | Whether Ameer can edit old dates and for how many days | recent-window unconfigured until approved |
| **HIGH** | Report signatures/stamp/footer and bilingual Urdu/English preferences | basic Urdu-compatible draft preview |
| **MEDIUM** | How transfers, late joiners, withdrawals affect report eligibility | enrollment-effective date; approval needed for edge cases |
| **MEDIUM** | Per-paper oral versus written types and question-pattern text | each assessment editable |
| **MEDIUM** | Whether admin wants class overview on mobile or web-only | web admin first |
| **MEDIUM** | Attendance counted per day or multiple daily sessions | one daily roll call until approved |

## 25. Nonfunctional requirements and release checklist

**Availability:** app usable during normal institute hours, including peak attendance submission and examination result publishing. **Responsiveness:** quick per-class date loads on moderate mobile networks; server paginates large tables. **Accessibility:** sufficient contrast, focus labels, RTL/bidi support, readable Urdu font, color not exclusive meaning. **Data integrity:** transactional writes, referential integrity, schema migration tests, immutable reports and audit. **Portability:** builds for Android and iOS, separate admin web URL, single backend.

**Release gate checklist:** authenticated/scope-secure; all 22 tests pass; real institute approval of data model and policy tables; Urdu PDF visually verified; backup/restore performed; student-data handling approved; production secrets not checked into source control; named admin operator trained; deployment runbook delivered.

## 26. Deliverables for the coding LLM

Read these files together in this order:

1. `agent/BUILD_THIS_APP.md` - exact coding instructions, iteration order and stop conditions.
2. `spec/FINAL_REQUIREMENTS.md` (this document) - authoritative specification and policy caveats.
3. `spec/IMPLEMENTATION_CHECKLIST.md` - ordered engineering tasks and exit criteria.
4. `db/001_initial_baseline.sql` + `db/002_v2_extension.sql` - reference DDL. Run in sequence after validating with installed PostgreSQL; adapt into migration runner.
5. `diagrams/*.mmd` and rendered images - relational topology and calculation pipeline.
6. `spec/api_contract.yaml` - stable endpoint/response examples.
7. `examples/*.json` and CSV - synthetic paper layouts and deterministic test fixtures.

**Instructions to coding LLM:** do not implement unofficial grade bands from the screenshot, do not assume all sections have 600 total, do not conflate `PENDING` and `0`, do not omit server-side authorization, and do not claim features are complete without passing tests and sharing working code/build commands.

## 27. References and provenance

- User requirements received 05 Nov 2026: nine levels, sections, Ameer attendance P/A/L/LEAVE, staff/admin scopes, annual Seh Mahi/Shash Mahi/Mocks, editable subject and marks split, six composite divisions, printable results and attendance windows.
- Supplied Shash Mahi timetable (one page, Evening Program; September schedule). Used to confirm per-paper examination scheduling, mixed paper maxima and oral exam notation.
- Supplied 1448 Shash Mahi `ثالثہ (شام)` class result screenshot. Used to confirm 11 paper columns, 600 maximum, attendance/grade/position layout, duplicate subject headings and red-blank ambiguity; **identifiable learner records excluded from bundled examples**.
- Current engineering documentation for technology evaluation: https://docs.expo.dev/router/introduction/ ; https://nextjs.org/docs/app/getting-started ; https://www.prisma.io/docs/orm/fundamentals/transactions (these are framework references, not sources of institute grading policy).

**End of authoritative blueprint v2.0.**
