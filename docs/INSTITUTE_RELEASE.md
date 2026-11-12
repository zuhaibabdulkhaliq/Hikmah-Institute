# Institute release: web, phones and accounts

This guide is for the institute operator. The companion [hosting guide](HOSTING.md) covers a real HTTPS installation and backups. [Phone testing](MOBILE_TESTING.md) covers both platforms from a Mac with Docker.

For your transition from testing to real student entry, follow [data safety and a fresh institute setup](DATA_SAFETY_AND_FRESH_START.md). It includes explicit demo/institute backup targets, restore verification, a separate empty local installation, and recovery without overwriting the running database.

## Everyday use

Use **English / اردو** on the sign-in screen or in the web header, and at the top of the mobile app. The choice is remembered on that browser/phone and can be changed without signing out. Urdu uses a right-to-left layout; dates, emails, passwords and numeric inputs retain usable formatting. Language changes do not modify names, paper codes, saved records, CSV templates or approved academic policy. Official result PDFs keep the institute's Urdu layout.

- **Admin:** academic setup/calendar, institute-wide students/attendance/exams/results, staff accounts, roles, password resets and audit history.
- **Mushrif:** assigned class calendars, attendance, all class papers/marks, results and student history. Subject assignments can be added separately.
- **Subject teacher:** only assigned papers and marks.
- **Ameer:** attendance for the assigned section, including its attendance totals; no marks/results/account administration.

The native app provides daily/grid attendance, assigned-paper marks, exam leave/timing, scoped results/performance, history/correction requests and password changes. Full institute setup, calendar administration, bulk class CSV import, policy approval and user administration are web workflows. The website is also responsive on phones/tablets. The native app is a focused staff companion, not a duplicate of every administrative web page.

## Stable local demo accounts

**Fresh local demos use `HikmahDemo2026!` for all six accounts below.** The password stays the same across starts, stops and rebuilds. Changing it through the app is respected; the seed never restores the default.

| Email                    | Access in the synthetic demo                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `admin@hikmah.example`   | Full institution administrator                                                                                              |
| `admin2@hikmah.example`  | Second institution administrator                                                                                            |
| `mushrif@hikmah.example` | Mushrif of synthetic section A; all its papers, attendance and results                                                      |
| `subject@hikmah.example` | Section A papers P01–P03 only                                                                                               |
| `ameer@hikmah.example`   | Section A attendance only                                                                                                   |
| `teacher@hikmah.example` | Legacy teacher demo; retained assignments on upgraded volumes; use the explicit Mushrif/subject accounts for demonstrations |

An **existing** `.env.demo` and existing passwords are preserved. If you want those six synthetic accounts to adopt the documented constant password, run this explicitly in your existing demo folder:

```sh
bash scripts/use-fixed-demo-password.sh
```

It changes only the six identifiable synthetic accounts, revokes their sessions and updates the local login value in `.env.demo`. It preserves academic data, other staff accounts, database passwords and the auth secret. It refuses production or an institute that is not the synthetic demo. Do not run it after using demo accounts for real institute work. For an existing custom password, use that password rather than running this setup again.

**The public demo password must never be used on a live institute server.** Production starts empty using a private administrator password, and staff receive private initial passwords or single-use invitations. Do not copy the demo database into production.

## Password management

Passwords are stored using Better Auth's **salted scrypt hash**, never plaintext or reversible encryption. Administrators can set a new password but cannot retrieve the old password. Staff initial passwords are entered once and then discarded by the form. The private local demo environment file contains the demo login setting; it is not the database password store and must stay outside Git.

- Any signed-in user: **My account → Change my password** on web, or **Change my password** on mobile. Enter the current password, the new password (12–128 characters), and confirmation. All devices are signed out after success; sign in with the new password.
- Admin: **People & access → Change a staff password directly**. Select the active account, enter a private new password and a reason. All that user's sessions are revoked immediately. Send the replacement privately.
- For user-chosen passwords, create a private invitation/recovery link instead. Verify identity before delivering it. Invitation links expire in 48 hours; recovery links expire in two hours. They are single use.

The audit records the account, actor, reason and session revocation—not password text or password hashes. Passwords do not expire or rotate on routine startup. Never email or post a shared staff password list.

## Recommended operator sequence

1. Test the synthetic demo with each of the four main roles in both languages.
2. Complete [the iPhone/Android checklist](MOBILE_TESTING.md) on real devices. Bundle export does not replace device acceptance.
3. Provision the separate production installation described in [hosting](HOSTING.md), with HTTPS and managed database backups.
4. Bootstrap a private administrator, enter institute identity under **Academic setup → Institute details**, create the real academic year/programs/classes, import students, assign staff and configure calendars.
5. Enter the class curriculum and six groups, initialize each exam session, configure its attendance window and approve its paper scheme.
6. Review and approve official eligibility, grade bands, rounding and remaining academic settings. The system retains the agreed 40% overall pass and attendance/ranking rules; it does not invent unspecified grade bands.
7. Pilot one class: attendance, CSV entry, review, PDF, correction and a backup restore. Review the real Urdu output with the institute before official publication.
8. Train staff, designate a backup/recovery owner, then expand to other classes.

Keep production separate from the published GitHub source and synthetic test fixtures. GitHub publication is software delivery, not official student-result publication or live hosting.
