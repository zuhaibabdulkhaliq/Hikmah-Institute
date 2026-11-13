# From demo testing to the real institute

Run these commands from the project folder on your Mac, with Docker Desktop running. No host Node or Homebrew is needed. Download the latest source first, preserving your private `.env.demo` and `docker-packages/` files.

## 1. Keep a verified copy of the demo

```sh
bash scripts/data-backup.sh init-key
bash scripts/data-backup.sh backup demo
```

The first command creates `$HOME/.hikmah/backup.key` once and preserves it on later runs. Save a second copy in a password manager or another secure location **separately from the backup files**. Losing the key makes the encrypted backups unrecoverable. Never send it to GitHub or chat.

The second command prints the archive's full path. Copy that path into:

```sh
bash scripts/data-backup.sh verify demo "/full/path/to/hikmah-demo-....hikmah.enc"
```

Wait for `PASS`. Verification restores into a randomly named temporary database, checks migration checksums, record counts and stored publication PDF hashes, then removes that temporary database. It does not change your running database. A wrong key, incomplete file or failed authentication prevents restoration.

Archives use AES-256-GCM authenticated encryption. Backups are stored in the ignored `.data/backups/` directory by default. The helper uses a small Node 24 Docker image; its first use may need an image download. PostgreSQL and the selected installation must be running.

## 2. Start the institute with an empty database

The recommended fresh start is a **separate institute installation**. Your demo remains available until you decide to delete it. You do not need to manually delete students, marks, users or subjects.

```sh
bash scripts/demo.sh stop
bash scripts/institute.sh start
bash scripts/institute.sh create-admin
```

The final command asks for your administrator email, a private password of 12–128 characters and confirmation. Typed passwords are hidden. Save the password in your password manager.

If administrator creation fails, use the latest `scripts/institute.sh` and retry `create-admin`. The updated prompt reports an invalid email or the received password length, without printing the password or a raw stack trace. Passwords must contain 12–128 characters; confirmation must match exactly. Email whitespace is removed, while password spaces and special characters are preserved. The prompt fix works with the existing application image. If setup reports that the institute already exists, sign in with its existing administrator; bootstrap does not replace an existing account or clear the database.

Open **<http://localhost:3002>** and sign in with that administrator. The institute starts with the two programs and nine editable class levels, but **no demo students, subjects, class sections, academic years or sample staff accounts**. Grading policy still requires review and approval before official publication. Demo credentials do not sign in to this installation.

The institute has its own Docker volume, private `.env.institute` configuration, and session cookie prefix. Restarting it runs migrations without running a demo seed:

```sh
bash scripts/institute.sh status
bash scripts/institute.sh stop
bash scripts/institute.sh start
```

Keep `.env.institute` unchanged during routine updates. It contains the database credentials and authentication secret, not a plaintext administrator password. Passwords in the database are salted, one-way hashes. Administrators can reset a staff password through People & access; do not delete the database to repair a sign-in problem.

This loopback-only HTTP installation is for local setup and evaluation. For staff using their own devices, follow [the HTTPS hosting guide](HOSTING.md) and bootstrap an empty production database. Do not expose this development Compose configuration directly to the Internet.

## 3. Enter the institute's real setup

1. Configure institute identity, programs and class levels in Academic setup.
2. Create the academic year, program-specific class sections and subject curricula.
3. Add/import students, enroll them in their sections, and create staff accounts and assignments.
4. Configure weekly academic days, effective dates, holidays and exceptions in Academic calendar. Preview each schedule.
5. Create exam sessions, section attendance windows, paper codes, maxima and the six groups. Review and approve each scheme before marks entry.
6. Review the proposed academic policy with the institute and approve it explicitly. Configure any unresolved choices; an unapproved policy blocks official results.
7. Test a small real workflow with authorized staff, check attendance totals and report/PDF output, and take a backup before full entry.

Use [the academic rules](ACADEMIC_RULES.md), [calendar guide](ACADEMIC_CALENDAR.md) and [CSV marks guide](RESULT_SHEET_CSV.md) for the detailed workflows. Real iPhone/Android, Safari and institute operator acceptance remain release checks.

## 4. Protect live data

For the local institute installation:

```sh
bash scripts/data-backup.sh backup institute
bash scripts/data-backup.sh verify institute "/full/path/to/hikmah-institute-....hikmah.enc"
```

For the self-hosted production Compose installation, use `backup production` / `verify production` instead. For the original developer database, use `local`. Choose the target explicitly: a demo backup is not a backup of institute data. If you use a custom Compose project name, export the same `HIKMAH_DEMO_PROJECT` or `HIKMAH_INSTITUTE_PROJECT` for backup commands. `BACKUP_PASSPHRASE_FILE` can select an existing secure key and `HIKMAH_BACKUP_DIRECTORY` can select the archive directory.

A practical starting routine is:

- Create an encrypted backup every day and before upgrades, bulk imports or major corrections. During exam entry, use hourly backups or managed PostgreSQL point-in-time recovery, based on how much work the institute can afford to lose.
- Copy completed encrypted archives to restricted off-site storage. Keep another offline copy. A backup only on the same Mac does not protect against loss of that Mac.
- As an initial retention proposal, keep 30 daily and 12 monthly copies, subject to the institute's retention and privacy requirements. These scripts never silently delete old backups.
- Test a restore at least monthly and after changing hosting or backup configuration. Record the date, counts and outcome. A successful file copy alone is not a recovery test.
- Securely back up `.env.institute` / production configuration separately, along with the backup key and the application version used. Neither a source ZIP nor GitHub contains your database or private configuration. A marks CSV does not include the complete academic history.
- Enable FileVault and a strong Mac login, keep macOS/Docker updated, restrict staff access, and use unique private staff passwords. On hosted systems use HTTPS, private database networking, monitored disk space and managed database backups. Never publish database ports, passwords, keys or student backups.

These commands are manual: they do not create an automatic schedule or off-site copy. For hosting, enable the provider's scheduled backups/PITR and independent encrypted exports. Assign a named operator to review backup success and rehearse recovery. See [HOSTING.md](HOSTING.md).

## 5. Recover after an issue

Pause staff entry during final recovery and switching to avoid losing newer work. First preserve a backup of the current database if it is readable. Then:

```sh
bash scripts/data-backup.sh recover institute "/full/path/to/known-good.hikmah.enc"
```

This creates and verifies a **new database**, leaves the current running database unchanged, revokes restored sessions and expires unused account-recovery links. It prints a new database name and the exact configuration change. Review the restored counts. Open `.env.institute` privately, change only `HIKMAH_INSTITUTE_DATABASE` to that printed name, then run:

```sh
bash scripts/institute.sh start
```

Sign in again and check students, latest attendance, marks and reports. Keep the previous database until the institute accepts the recovered data; do not delete it during recovery. A restored backup contains data only through its capture time. Newer work requires reconciliation or a more recent recovery point. The `verify` command never switches databases; `recover` prepares a candidate and also leaves switching to the operator.

For self-hosted production, `recover production` likewise creates a separate database. After review, update the database component of the private `DATABASE_URL`, preserve the remaining credentials, and restart the production services. For managed PostgreSQL, use the provider's recovery into a new database/branch, validate it, then update the application connection securely. The helper rejects a production API connected to an external database rather than accidentally backing up a different local database.

Older `scripts/backup.sh` and `scripts/restore-drill.sh` remain for legacy development-only AES-CBC archives. New `.hikmah.enc` files use `data-backup.sh`; do not mix those formats or commands.

## Optional: delete only the old synthetic demo later

You can simply leave the demo stopped. If you deliberately want to erase it after verifying its backup and accepting the new institute setup, this command removes the **default demo project's** containers and database volume:

```sh
docker compose --project-name hikmah-demo --env-file .env.demo -f compose.demo.yaml down --volumes
```

This deletion is irreversible without a backup. It does not target the separate `hikmah-institute-local` project. Use it only for the old synthetic demo, with the original demo project name; never use volume deletion as an upgrade, logout or password-recovery step. No data is erased by the normal institute setup commands above.
