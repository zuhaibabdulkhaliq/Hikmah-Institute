# Run Hikmah on an Apple silicon Mac

This guide runs the synthetic local demo on an M1/M2/M3/M4 Mac, including M4 Pro. Docker Desktop runs the web portal, API, PostgreSQL and PDF dependencies. You do not need Homebrew, Node, pnpm, Python or Git installed on the Mac for this workflow.

## 1. Start Docker Desktop

Use the current Docker Desktop installer for **Mac with Apple silicon**, compatible with your macOS version. Open Docker from Applications and wait until its engine is running. You do not need to enable Kubernetes or force Intel/amd64 emulation.

Open Terminal with Spotlight (Command-Space, type Terminal, Return). Run these commands one at a time, without copying the Terminal prompt:

```sh
uname -m
docker --version
docker compose version
docker info
```

`uname -m` should say `arm64` in a native Terminal. Docker and Compose should print versions, and `docker info` should include a Server section without a connection error. If Docker is missing from PATH, reopen Terminal; if it is still missing, check Docker Desktop's command-line tool installation setting.

## 2. Download the latest project

Open <https://github.com/zuhaibabdulkhaliq/Hikmah-Institute>. Select **Code → Download ZIP**, save it in Downloads, then double-click the ZIP in Finder to extract it. A fresh download includes the setup updates; an older ZIP does not update itself.

For the default extracted folder, run:

```sh
cd ~/Downloads/Hikmah-Institute-master
ls scripts/demo.sh compose.demo.yaml
```

Both files should be listed. If your folder has a different name, type `cd ` in Terminal, drag the extracted folder from Finder into Terminal, then press Return. Keep this folder: its hidden `.env.demo` stores your local credentials.

If you already use Git, `git pull --ff-only origin master` in a clean checkout on `master` is an alternative to downloading another ZIP. Resolve local changes separately; do not overwrite private configuration files.

## 3. Build and start

If you already downloaded the Noto font packages, keep them in this folder layout:

```text
Hikmah-Institute-master/
  Dockerfile
  scripts/install-fonts.sh
  docker-packages/
    fonts-noto-core_20201225-1_all.deb
    fonts-noto-extra_20201225-1_all.deb
```

Use the latest `Dockerfile` and `scripts/install-fonts.sh` together. For an existing ZIP-based project, download just those two updated files from GitHub using **Download raw file** and replace the corresponding files in your existing project. Preserve `docker-packages/` and your existing `.env.demo`. No Homebrew or Git installation is needed.

Confirm the two archives are present:

```sh
ls -lh docker-packages/*.deb
```

Docker installs these `all`-architecture packages inside its Linux container; they work on Apple silicon. The build prints `Using local Noto font packages from docker-packages; no Noto archive download.` The archives are excluded from the final application image. Other uncached dependencies still require Internet access. With neither local archive present the build downloads fonts normally; with an incomplete or invalid local pair it stops with a clear error. See [local font packages](../docker-packages/README.md).

From the project folder:

```sh
bash scripts/demo.sh start
```

The first run downloads dependencies, builds the application, creates private random demo credentials, starts the database, applies migrations, seeds synthetic data and waits for the API/web health checks. Keep Docker running and allow several minutes for the first build. Subsequent builds reuse the Docker cache. Avoid `sudo`.

When successful, Terminal prints:

```text
Demo ready: http://localhost:3000
```

Open <http://localhost:3000> in Safari or Chrome. The application runs in the background; you may close Terminal after the start command completes. Docker Desktop must stay running.

## 4. Sign in

Open your private local credentials in TextEdit:

```sh
open -e .env.demo
```

Find `HIKMAH_DEMO_PASSWORD=` and copy only the value after `=`. Sign in with:

| Email                    | Access                                       |
| ------------------------ | -------------------------------------------- |
| `admin@hikmah.example`   | Administrator                                |
| `admin2@hikmah.example`  | Second administrator                         |
| `teacher@hikmah.example` | Subject teacher (fresh demo)                 |
| `subject@hikmah.example` | Subject-only teacher on fresh/upgraded demos |
| `mushrif@hikmah.example` | All subjects and attendance in Section A     |
| `ameer@hikmah.example`   | Section A attendance                         |

All synthetic accounts use the generated `HIKMAH_DEMO_PASSWORD`. Keep the configuration file private and preserve its credential values after the first setup; the database volume keeps the original credentials and accounts. Finder hides dotfiles; `open -e .env.demo` opens it directly.

If the administrator password is rejected, first confirm the email is `admin@hikmah.example` and that you copied only `HIKMAH_DEMO_PASSWORD`, not the database password or authentication secret. Restarting the demo does not change existing account passwords. If the configuration value no longer matches the saved demo account, keep the services running and run:

```sh
bash scripts/reset-demo-password.sh
```

This uses the current `.env.demo` value to reset only the synthetic administrator's password, revokes that administrator's sessions and records the recovery in the audit log. It preserves students, attendance, marks, policies and other accounts. It requires the existing image and running database but does not rebuild or download fonts. For an older ZIP checkout, download [scripts/reset-demo-password.sh](https://github.com/zuhaibabdulkhaliq/Hikmah-Institute/blob/master/scripts/reset-demo-password.sh) using **Download raw file** and save it in your existing `scripts` folder first. Reload the login page and sign in again. Do not delete the database volume to recover a password.

## 5. Check the application

Sign in as the administrator and check the dashboard, Academic setup, Attendance, Exams & schemes, Results & reports and Policies. The seed contains 20 synthetic learners; its first sample result has a raw total of `513 / 600`.

Policies begin unapproved. Official publication is blocked until an authorized institute operator enters and approves actual academic policies. An unapproved-policy blocker in the demo is expected. Automated tests use isolated test-only policies; do not copy them into official settings.

Run the full automated checks from Terminal in the same folder:

```sh
bash scripts/demo.sh test
```

The command rebuilds the current source, runs lint/type checks, runs the database/PDF integration tests, and builds the web/API applications. It returns to the prompt with exit code zero on success. You should see 52 tests pass and no test failures. The test runner creates and drops its own temporary database, preserving the demo database. This command does not run native-device or browser automation; use the manual browser steps above on your Mac.

## 6. Status, stopping and starting again

```sh
bash scripts/demo.sh status
bash scripts/demo.sh logs
bash scripts/demo.sh stop
```

Status should show `db`, `api` and `web` running and healthy after startup. Stop preserves the database. Next time, open Docker Desktop, return to this same folder and run:

```sh
bash scripts/demo.sh start
```

Keep `.env.demo` and the Docker database volume. Do not remove the volume or use `down -v` unless you intentionally want to erase this demo's data. Downloading the source again does not reset the existing Docker volume; reusing it requires the original private configuration.

## Troubleshooting

| Symptom                                                      | Action                                                                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker: command not found`                                  | Reopen Terminal and check Docker Desktop's CLI installation setting.                                                                                                  |
| Cannot connect to the Docker daemon                          | Open Docker Desktop and wait for the engine, then retry.                                                                                                              |
| `scripts/demo.sh` is missing                                 | Confirm the extracted folder and download the latest GitHub ZIP.                                                                                                      |
| `node: command not found` on the Mac                         | Use the Docker commands above; host Node is not required for this demo.                                                                                               |
| Port 3000 is already allocated                               | Run `bash scripts/demo.sh stop`, open `.env.demo`, change only `HIKMAH_DEMO_PORT=3000` to `HIKMAH_DEMO_PORT=3002`, then start again and open `http://localhost:3002`. |
| Build ends with exit 137 or reports insufficient memory/disk | Check Docker Desktop resource settings and available storage, close heavy apps, increase Docker memory if possible, then retry.                                       |
| Administrator password rejected                              | Confirm the email and password field above, then use `bash scripts/reset-demo-password.sh` to recover the synthetic administrator without deleting data.              |
| Startup times out or a service is unhealthy                  | Run `bash scripts/demo.sh status` and `bash scripts/demo.sh logs`; share the relevant error with passwords, tokens and database connection strings removed.           |

The web port is bound to the Mac's loopback address. This setup is for local synthetic demonstration, not public hosting or access from a phone.

## Mobile development and deployment

The Expo app is in `apps/mobile`; the Docker demo does not start Metro, an iOS simulator or an Android emulator. Native development is a separate setup requiring host Node/pnpm and a compatible Expo runtime, Xcode for iOS and/or Android Studio for Android. Official installers can be used without Homebrew. See the [README mobile instructions](../README.md#mobile) for API reachability requirements.

## Updating an existing demo

Keep your original `.env.demo` and Docker database volume. If using Git in a clean checkout on `master`, stop the services, run `git pull --ff-only origin master`, then run `bash scripts/demo.sh start` to rebuild and restart. For ZIP downloads, stop the services and rename the old project folder before extracting a fresh ZIP. Copy its original `.env.demo` into the new project folder before starting. If you use local fonts, also copy both `.deb` archives from the old `docker-packages/` into the new `docker-packages/` before building; Command-Shift-Period in Finder reveals hidden files. Do not generate different credentials for the retained database.

## Use your original logo

The web app detects `apps/web/public/hikmah_logo.png` at build time. If your original PNG is in Downloads, run these commands from the project folder:

```sh
mkdir -p apps/web/public
cp "$HOME/Downloads/Hikmah Logo.png" apps/web/public/hikmah_logo.png
bash scripts/demo.sh start
```

This copies your exact image without altering it and rebuilds the application to use it. The original user-uploaded PNG is included in the repository. The copy command above is only needed if you want to replace it with another local copy. Without that file the app shows a simple academic mark beside the institute name. This web asset setting does not replace the separate Expo app icon or published PDF branding.

For a hosted installation, follow [deployment and recovery](DEPLOYMENT.md) and the remaining acceptance checks in [the implementation record](IMPLEMENTATION_STATUS.md). The local demo command does not deploy a public site. The institute's policies, staging/security/recovery checks and native-device acceptance remain separate rollout requirements.

## Verification scope

The Docker demo and full check command were verified on the managed Linux x86_64 Docker engine. The image uses multi-architecture Node/PostgreSQL base images and the configuration does not force Intel; Docker on an M4 selects ARM64 images and dependencies. A physical M4/macOS run and native-device E2E have not been performed here.

## English/Urdu and phones

Use **English / اردو** on the sign-in page or web header. Fresh demos use the stable password described in [the release guide](INSTITUTE_RELEASE.md); existing `.env.demo` values remain unchanged. To test the native app on both iPhone and Android using Docker, follow [Mobile testing](MOBILE_TESTING.md). For institute hosting, use [Hosting](HOSTING.md).
