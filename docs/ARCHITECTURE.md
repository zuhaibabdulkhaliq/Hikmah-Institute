# Architecture and API

## Workspace

- `apps/web`: Next.js App Router staff portal. All sensitive data loads from the authenticated API. Same-origin rewrites keep the Better Auth cookie HttpOnly; cookie writes require an exact trusted Origin.
- `apps/mobile`: Expo Router/React Native. SecureStore holds the bearer session token. Ameer views exclude marks/results; this is also enforced by the API. Report share files are deleted after use. Offline writes are not fabricated.
- `apps/api/src`: Fastify modules for identity, academics, attendance, exams/policies, scheme revisions, result publication and operations.
- `packages/domain`: shared Zod inputs, exact decimal score/attendance computation, grade/rank policies and CSV escaping.
- `packages/api-client`: shared fetch wrapper, typed response primitives and errors.
- `db/migrations`: checksum-tracked baseline/v2 SQL plus auth, workflow, integrity, invitation, revision and recovery migrations. Original specification files remain unchanged.
- `scripts`: migration, seed, bootstrap, test isolation, PDF rendering, browser smoke, backup/restore.

## Integrity and permissions

Better Auth owns password hashing and session handling; application accounts are mapped through `auth_subject`. Public signup is disabled. Every request reloads active application-user and current role/assignment state using the institute timezone. Ameer section checks, subject-paper checks, effective assignment dates, active academic years for attendance, and admin-only publication are enforced server-side.

Writes use SERIALIZABLE transactions. Serialization failures, deadlocks and optimistic-version conflicts return 409 instead of silently overwriting records. Attendance draft replacement uses `If-Match`; a never-created sheet is version 0. This intentionally extends the source contract's existing-sheet minimum of 1. Marks use per-enrollment `version:0` for a new mark. Bulk attendance/publication require an `Idempotency-Key` and reject reusing a key for a different payload.

PostgreSQL checks and triggers enforce same-section marks, numeric 0..max, attendance enrollment dates, academic/organization links, overlapping enrollment prevention, immutable published snapshot rows/documents and append-only audits. The authenticated API enforces workflow and complete submission. DB credentials are server-only. A production application role should not be a DDL owner.

## Policies

All policy defaults are unapproved. Complete approval requires four attendance credit pairs, explicit backdating, zero-denominator behavior, contiguous grade bands, pass requirements, missing-status resolutions, explicit result eligibility, ranking and rounding. Saving a draft withdraws active approval. Approvals create versioned normalized attendance/grade/ranking records as well as an immutable policy document in each publication.

`ACTIVE_AT_WINDOW_END` includes learners enrolled on the window's inclusive end date. `ANY_ENROLLED_IN_WINDOW` includes enrollments overlapping the explicit inclusive window. Neither is selected automatically. Attendance numerator/denominator always use eligible enrollment dates and explicitly counting instructional days. Unsubmitted instructional dates remain errors, not absences.

A scheme revision creates new paper/group records, locks the former papers, supersedes the old approval and requires new approval. Optional marks copying is transactional and fails if a score exceeds a revised maximum. New marks still require submission and review. Old publication snapshots and documents remain byte-for-byte stable.

## API surface

All routes below require authentication and server scope checks except health, Better Auth login flows and token-authorized invitation/recovery acceptance. The original OpenAPI file remains the source contract. `GET /v1/openapi.json` generates the actual registered route surface and input JSON schemas from shared Zod models. Cross-table/domain refinements remain enforced by service code; generic response envelopes are documented rather than claiming generated response-type guarantees. Endpoint implementation is in the named modules; API integration tests exercise the critical contracts.

| Routes                                                                                                                                            | Behavior                                                                                | Module                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| `GET /health`, `/api/auth/*`                                                                                                                      | DB readiness, maintained auth sessions                                                  | server/auth            |
| `GET /v1/me`, `/v1/institute`; `PATCH /v1/institute`                                                                                              | Identity and institute settings                                                         | academics              |
| `GET/POST /v1/{academic-years,programs,levels,sections,students,subjects}`; `PATCH .../:id`                                                       | Allowlisted, validated academic records                                                 | academics              |
| `GET/POST /v1/sections/:id/enrollments`; `PATCH /v1/enrollments/:id`                                                                              | Enroll, withdraw/transfer state, history                                                | academics/operations   |
| `POST /v1/sections/:id/staff`, `/v1/offerings/:id/teachers`; `GET /v1/sections/:section/staff`                                                    | Effective-dated staff and teaching                                                      | academics/operations   |
| `PATCH /v1/staff/:id`, `/v1/teaching/:id`                                                                                                         | Revoke/end assignments with reason                                                      | operations             |
| `GET/PUT /v1/sections/:id/calendar`                                                                                                               | Explicit instructional dates, read pagination at 100                                    | attendance             |
| `GET/PUT /v1/sections/:id/attendance/:date`; `POST .../submit`, `.../reopen`                                                                      | Roster, draft/version, complete submission, audited reopening                           | attendance             |
| `POST /v1/sections/:id/attendance/bulk`                                                                                                           | Atomic multiple-day saves, idempotency                                                  | attendance             |
| `POST /v1/sections/:section/corrections`, `GET /v1/corrections`, `POST /v1/corrections/:id/review`                                                | Staff correction request; admin review                                                  | operations             |
| `GET/POST /v1/exam-cycles`                                                                                                                        | Default/configurable cycles                                                             | exams                  |
| `GET/PUT /v1/exam-cycles/:cycle/sections/:section/scheme`; `POST .../approve`, `.../revise`                                                       | Paper/group config, approvals, controlled revisions                                     | exams/scheme-revisions |
| `PUT /v1/exam-cycles/:cycle/sections/:section/window`                                                                                             | Attendance and exam windows; overlap acknowledgment                                     | exams                  |
| `GET /v1/assessments`; `GET .../:id/marks`; `POST .../:id/marks/import/preview`; `PUT .../:id/marks/bulk`; `POST .../:id/{submit,approve,reopen}` | Scoped mark entry/review                                                                | exams                  |
| `GET/PUT /v1/attendance-permissions`                                                                                                              | Independent historical edit approval/revocation; same-day drafts need no grade approval | operations             |
| `GET/PUT /v1/policies`                                                                                                                            | Draft/approved institute policy; version check                                          | exams                  |
| `POST /v1/results/:cycle/:section/{validate,publish}`                                                                                             | Preflight hash; transactional immutable revisions/PDFs                                  | results                |
| `GET /v1/results`; `GET .../:run/sectionsheet.pdf`, `.../:run/students/:enrollment.pdf`, `.../:run/export.csv`                                    | Scoped publication archive/downloads                                                    | results                |
| `GET /v1/users`; `PATCH /v1/users/:id`                                                                                                            | Active staff/admin grants/revocation; last-admin protection                             | academics              |
| `POST /v1/invitations`, `POST /v1/invitations/accept`, `POST /v1/users/:id/reset-password`                                                        | Private single-use invitations/recovery; no automatic email sending                     | operations             |
| `POST /v1/sections/:section/import/preview`, `POST /v1/imports/:job/{apply,rollback}`                                                             | Mapped-header UTF-8 CSV; all-or-nothing apply; unused-record rollback                   | operations             |
| `POST /v1/sections/:section/rollover`                                                                                                             | Selected new enrollments, historical sources retained                                   | operations             |
| `GET /v1/sections/:section/attendance.csv`                                                                                                        | Scoped, escaped attendance export                                                       | operations             |
| `GET /v1/audit`, `/v1/me/history`                                                                                                                 | Admin audit or actor's own action history                                               | academics/operations   |

Errors use 400 invalid inputs, 401 no session, 403 insufficient scope, 404 unavailable records, 409 stale/conflicting writes and 422 domain violations. Boundaries reject unknown identifiers or invalid fields before DB writes. SQL identifiers come only from fixed allowlists; values are parameterized.

## Deliberate operational choices

Published PDF bytes live in PostgreSQL rather than an external object bucket, so they share transactional publication and backup guarantees. WeasyPrint uses local Noto Arabic fonts and escaped, snapshot-only HTML. Numeric runs are isolated as LTR inside the RTL table. PDFs contain revision identifiers and never consult mutable names at download time.

CSV imports accept canonical headers or explicit source-column mapping. Unused import-created rows can be rolled back; foreign keys reject rollback after downstream attendance/marks/publication use, atomically. No official scaling transform, NO_TIES ranking, parent portal or offline sync is silently approximated; currently supported policy options are explicit in the schema/UI.
