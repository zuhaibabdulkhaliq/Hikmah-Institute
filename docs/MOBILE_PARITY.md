# Native mobile redesign and web workflow parity

The Expo/React Native app uses native screens and controls; it does not embed the website. Web and mobile share the eleven workspace routes and role rules in `packages/api-client/src/workspace.ts`, and use the same authenticated API, database constraints and approval gates. A phone app exposes only the features allowed for its signed-in staff member.

## Navigation and layout

Phones have a floating glass bottom bar for Overview, Attendance and Marks where permitted, plus More. More opens a searchable full-workspace sheet. Wide tablets use a scrollable sidebar. The header opens the menu or My account. Cards, inputs, pickers and actions use rounded blue/white surfaces; iOS and supported modern Android versions use native blur, with accessible opaque fallbacks. Urdu changes reading direction and labels. Native session tokens remain in OS SecureStore. The browser preview keeps its token in memory only and is a test surface, not a replacement production website.

## Workflow coverage

Reviewed browser-preview screenshots: [English phone](images/mobile/phone-english.png), [Urdu phone](images/mobile/phone-urdu.png) and [tablet sidebar](images/mobile/tablet.png). These contain only synthetic review data.

| Web workflow                                          | Native location and behavior                                                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in, account activation and recovery              | Server selection, sign-in, private invitation/recovery link, password confirmation, remembered native server and secure session                                                                       |
| Overview                                              | Role-specific actions, class search, previous-year filter, empty-institute setup action                                                                                                               |
| Institute details                                     | Academic setup → Institute details; English/Urdu/official names and timezone                                                                                                                          |
| Programs, years, levels, sections, students, subjects | Academic setup → Academic records; create/edit forms, searchable records and status changes                                                                                                           |
| Enrollments and promotion                             | Academic setup → Class membership; enroll existing students, correct enrollment history, promote selected learners while preserving earlier years                                                     |
| Class and subject assignments                         | Academic setup; staff/Ameer assignments and reasons, subject offerings, subject teachers and end-date/scope changes                                                                                   |
| Student CSV import                                    | Academic setup; system file picker or pasted CSV, source-column mapping, validation, explicit review/apply and rollback                                                                               |
| Academic calendar                                     | Independent weekly schedules, batch class selection, year/program/level filters, saved-schedule copying, holidays/extra days, date-range restoration, preview hashes and recorded-date acknowledgment |
| Daily and multiple-day attendance                     | Attendance; Present/Absent/Half/Leave, remarks, mark-all action, optimistic draft/save/submit/reopen, 31-day grid with explicit confirmation, academic-day filtering, CSV exports                     |
| Attendance totals and permissions                     | Attendance totals by year/session/previous session; Policies contains separately approved historical edit permissions                                                                                 |
| Curricula and exam sessions                           | Exams & schemes; class subjects, annual curriculum, session initialization and additional exam sessions                                                                                               |
| Papers, six groups, schedules and windows             | Native paper/group forms, scheme approval, reviewed revisions with compatible marks, per-paper dates, independent section attendance/exam windows and overlap acknowledgment                          |
| Marks and assigned-paper CSV                          | Marks entry; searchable contextual paper picker, all mark states, explicit zero/blank distinction, exam leave/on-time flags, reasons, save/submit/approve/reopen, CSV preview/apply                   |
| Class CSV marks and session matrix                    | Results & reports; downloadable blank template with optional flags, native file picker, row/cell errors, proposed changes, overwrite acknowledgment and atomic apply                                  |
| Results and publication                               | Working/published sheet selection, individual marks cards, session PDF/CSV, preflight blockers, explicit admin publication confirmation, immutable revision archive and individual/class downloads    |
| Student and class performance                         | Current/earlier years, sessions, attendance counts, combined marks, position eligibility, student/class PDF and class CSV sharing                                                                     |
| Policies                                              | Native grade-band, eligibility, missing-mark, rounding, attendance and rank controls; draft and explicit approval; server still blocks unresolved official policies                                   |
| People & access                                       | Create accounts, direct password changes, private invitations/recovery, explicit access-change confirmation, grant/revoke admin and disable/activate                                                  |
| Corrections and audit                                 | Admin review of attendance correction requests and read-only audit details; each staff member can see their own activity                                                                              |
| My account and sign-out                               | Password change with current-password verification; all-device revocation, language selection, private server display and sign-out                                                                    |

No result is automatically published by this UI. A successful CSV upload changes working marks only. A local backup/export does not set up a provider, HTTPS, automatic backups or app-store signing.

## Verification record

Managed-environment verification on 16 November 2026 used a separate synthetic `hikmah-mobile-review` installation; no retained demo or institute records were edited. The checkboxes distinguish code/browser/bundle evidence from institute device and deployment acceptance.

- [x] Root/web/mobile TypeScript and lint.
- [x] PostgreSQL/domain/PDF/API regression suite, including shared native/web role navigation and invalid date cases.
- [x] Expo SDK compatibility, native iOS/Android bundles and browser preview.
- [x] Every native route at phone/tablet widths, Urdu direction, accessible menus and no horizontal page overflow.
- [x] Real native-form workflows against a separate synthetic review database: setup, calendar, marks, CSV, results, staff and account boundaries.
- [x] Rebuilt Docker image, healthy isolated full stack, persistent Expo-home launcher and separate institute phone target.
- [ ] Operator iPhone/Android tests, including secure storage, keyboard, native blur, document picking and sharing.
- [ ] Institute policy/PDF acceptance, HTTPS staging, production backup recovery, workload checks and signed distribution.

Managed Linux browser-preview/bundle checks do not certify physical-device OS behavior. The final operator/device and deployment gates must be completed on the institute's chosen devices and infrastructure.

## Reproducible evidence

- `pnpm check`: lint, API/shared/web/mobile types, all 12 migrations in a disposable database, **67 tests passed, 0 failed, 0 skipped**, and production Next.js/Fastify builds. Added coverage includes the shared eleven-route role matrix, calendar/Urdu numeric input, more than 500 student records, old-server paging failure, CORS PUT/PATCH and safe field-specific validation feedback.
- `scripts/mobile-browser-smoke.ts`: all eleven React Native routes at **320, 390, 430, 768, 1024 and 1440px**, English/Urdu navigation and screenshots, without page overflow, runtime errors or native text-node warnings.
- `scripts/mobile-workflow-smoke.ts`: native setup/student/enrollment, calendar preview/apply, attendance draft/submit, curriculum/windows/scheme approval, explicit zero marks, submit/reopen, real CSV file chooser/preview/apply, synthetic preflight/publication and a downloaded valid PDF. Other paper approvals are fixture preparation through the authenticated API; this is not a claim that every individual button has an automated tap test.
- `scripts/mobile-access-smoke.ts`: native staff creation, clearing password fields, Ameer/teacher/Mushrif navigation, owner password confirmation/change, administrator reset, revoked sessions and private invitation activation.
- `scripts/mobile-recovery-smoke.ts`: slow metadata produces a visible timeout, the saved session retries without another password, and unsaved navigation supports keep/discard without persisting the discarded form.
- The actual `mobile-demo.sh institute` launcher rebuilt and started an isolated institute stack, printed its independent server port and started Docker Metro. Proxy health and Metro status passed. The institute remained empty (zero students, subjects and years; one private administrator). A fresh isolated Expo home correctly reported Not logged in; no real Expo credentials were used. The cloud network used Expo's fallback DevTools after a download warning. Signed-in Expo Go manifests and physical phones remain operator checks. The retained demo stayed at 103 students, 11 subjects, 103 enrollments and 814 marks.
- The production web regression also passed on the rebuilt synthetic stack: all eleven portal routes at six widths, login, attendance, raw results/PDF, policies, keyboard navigation, activation and Ameer/Mushrif/subject-teacher boundaries.
- Expo's bundled SDK compatibility map reports dependencies up to date; offline validation is less authoritative than Expo's online service. Both iOS and Android Hermes exports succeed. Production dependency audit reports no known vulnerabilities.

The write-based mobile workflow and access scripts require `SMOKE_DISPOSABLE=1`. Set `MOBILE_PREVIEW_URL`, `MOBILE_API_URL` and a private `DEMO_PASSWORD` for a **disposable synthetic instance**. Never target the institute database. Start the React Native browser preview separately with `EXPO_PUBLIC_API_URL` pointing to that test API; allow that exact preview origin in its API CORS configuration. The browser scripts require Chromium/Playwright. Do not force offline Expo mode in the phone launcher; cloud-only offline preview/export is separate from signed-in Expo Go manifests.
