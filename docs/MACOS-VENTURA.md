# Intel MacBook Pro 2017, macOS Ventura 13.7.8

Use the Docker-only **synthetic local demo** on this machine. Node.js, pnpm, Python, Pango, fonts and PostgreSQL run inside Linux containers. You do not need to install those tools or Homebrew on the Mac.

## Install a Ventura-compatible Docker Desktop

Docker's release notes identify **4.48.0** as the last release whose installer accepts macOS 13. Docker Desktop 4.49.0 raised the minimum to macOS 14. The Mac must use the **Intel / amd64** installer.

- [Archived official Docker Desktop 4.48.0 Intel installer](https://desktop.docker.com/mac/main/amd64/207573/Docker.dmg)
- [Vendor checksums](https://desktop.docker.com/mac/main/amd64/207573/checksums.txt)
- [Original Docker release notes with installer build 207573](https://github.com/docker/docs/blob/ff4ce755fd1c9301ecfa199bc8751ebcec3a3d78/content/manuals/desktop/release-notes.md#4480)
- [Current Docker release notes](https://docs.docker.com/desktop/release-notes/#4480)

This old Docker release is unsupported. Use it only for a local synthetic demo; deploy real student records to a maintained, reviewed environment. The archived binary's current download availability was not verified from this environment. If Docker no longer serves it, do not substitute an unverified third-party installer or bypass macOS signature/security checks; use a supported Linux/server environment instead.

Open the downloaded DMG, drag Docker to Applications, and launch Docker normally. Wait for the engine to be running. On an 8 GB Mac, allocating approximately 4 GB to Docker may help the build. Kubernetes is not required.

Confirm in Terminal:

```sh
docker --version
docker compose version
```

## Download and start

Download the repository from GitHub using **Code → Download ZIP**, then extract it. This avoids needing Git or Xcode command-line tools on the Mac. Alternatively, clone it if Git is already installed.

Open Terminal in the extracted folder. For a ZIP extracted directly in Downloads:

```sh
cd ~/Downloads/Hikmah-Institute-master
bash scripts/demo.sh start
```

The script generates private random credentials in `.env.demo`, builds the application image, starts PostgreSQL, applies migrations, seeds only synthetic data and waits for the web/API health checks. The first build downloads dependencies and can take several minutes. Later builds reuse the Docker cache.

Open this address in the Mac browser:

```text
http://localhost:3000
```

Sign in with `admin@hikmah.example`. Open the private configuration file with the Mac's TextEdit:

```sh
open -e .env.demo
```

Use the value after `HIKMAH_DEMO_PASSWORD=` as the password. The same generated demo password also works for `admin2@hikmah.example`, `teacher@hikmah.example` and `ameer@hikmah.example`. Do not post the file or its values to chat/GitHub.

If port 3000 is already used, change `HIKMAH_DEMO_PORT` in `.env.demo` to an unused port, then run the start command again. Keep the credential values unchanged after initial setup; the named database volume retains its password and seeded accounts.

The web port binds only to the Mac's loopback address. This demo configuration is not a LAN/public deployment or a mobile-device API exposure.

## Test and stop

Run the complete code-quality, database/PDF integration and production-build checks inside a temporary application container:

```sh
bash scripts/demo.sh test
```

The integration runner creates and drops its own randomly named test database, preserving the demo data. It uses test-only approved policies; the demo institute's official policies remain unapproved.

Other commands:

```sh
bash scripts/demo.sh status
bash scripts/demo.sh logs
bash scripts/demo.sh stop
```

Stopping preserves the database. Start it later with `bash scripts/demo.sh start`.

If startup fails, inspect `logs` and share the error text with credentials removed. A missing `node` command on the Mac is expected and does not prevent this setup.

## Verification scope

The Docker-only workflow was checked on the managed Linux Docker engine: fresh database startup/migrations/seeding, browser sign-in/attendance/raw result preview/sign-out, private credential-file permissions, repeat initialization and the full check command. This does not claim a physical Ventura/2017-Mac test or native iOS/Android E2E verification.

For a managed-cloud build using a supplied proxy CA, set `HIKMAH_DEMO_BUILD_CA` to the trusted CA file path before `start`. The script passes it as a BuildKit secret; TLS verification remains enabled. Ordinary Mac users do not need this variable.
