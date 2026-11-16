# Try the mobile app on iPhone and Android

The repository contains a native Expo/React Native app in `apps/mobile`. Opening the website on a phone is a separate responsive-web test.

## Update safely first

Download the **complete latest project** or update your Git checkout. This release adds native packages and screens, so replacing only `mobile-demo.sh` is insufficient. Keep your private `.env.demo`, `.env.institute` and local `docker-packages` font archives. Docker database volumes hold your existing data independently of the source folder. Do not delete volumes or run `down -v`. Keep the backup/key copies described in [data safety](DATA_SAFETY_AND_FRESH_START.md).

## Easiest test on your M4 Mac: Docker + Expo Go

1. Start Docker Desktop. Open Terminal inside the updated project folder.
2. Install **Expo Go** on iPhone and Android. Sign in to the same free [Expo account](https://expo.dev/signup) on both phones and in Expo CLI. This is separate from your Hikmah staff account. The app uses **Expo SDK 58**; use a compatible Expo Go client or the development/preview build below.
3. Connect the Mac and phones to the same trusted Wi-Fi. Allow iOS Local Network access. Guest networks, VPNs and client isolation can block the connection.
4. Choose the database you want to test. **For your existing institute**, run:

   ```sh
   bash scripts/institute.sh start
   bash scripts/mobile-demo.sh login
   bash scripts/mobile-demo.sh whoami
   bash scripts/mobile-demo.sh institute
   ```

   `start` rebuilds the image from the updated source, migrates and starts your existing institute. It preserves passwords and data. `login` is needed only if Expo CLI is not already signed in. Enter your **Expo** password privately at its prompt. The final command enables LAN access for the institute (normally port **3002**) and starts Metro on **8081**. It does not run the synthetic seed. Use your private institute account on the phone. If this is the first institute installation, create the administrator once with `bash scripts/institute.sh create-admin` after `start`.

   **For synthetic demo testing instead**, run:

   ```sh
   bash scripts/demo.sh start
   bash scripts/mobile-demo.sh login
   bash scripts/mobile-demo.sh demo
   ```

   The demo normally uses port **3000** and [these demo accounts](INSTITUTE_RELEASE.md#stable-local-demo-accounts). A fresh demo uses `HikmahDemo2026!`; an existing demo keeps its password. Demo and institute data and accounts are separate.

5. Leave Terminal running. Scan the **fresh Expo QR** with iPhone Camera or Expo Go's Android scanner. Both phones can use the same Metro session. Docker supplies Node and Metro; Homebrew, host Node, Xcode and Android Studio are unnecessary for this path.
6. At mobile sign-in, use the printed **Phone server address**, such as `http://192.168.1.20:3002`. **Do not use `localhost` on a phone**. If an older saved server is shown, tap **Use printed server address**, or edit Server address manually. This discards that old server's local session; it does not copy or reset data. Sign in with the account belonging to the selected database.
7. Try the floating bottom tabs and **More**. More searches every permitted workspace. Wide tablets use a sidebar. Toggle **English / اردو** and complete the device checklist below.

If IP detection fails, find the Mac's IPv4 address in **System Settings → Wi-Fi → Details → TCP/IP**, then use your actual address:

```sh
HIKMAH_MOBILE_HOST_IP=192.168.1.20 bash scripts/mobile-demo.sh institute
```

For demo testing replace `institute` with `demo`. The printed server port follows your configuration. The QR uses **8081**, while the server address uses the institute/demo web proxy port; neither is PostgreSQL.

To stop Metro, press **Control+C**. To return the institute website to Mac-only access, run `bash scripts/institute.sh start` without a LAN binding. Stop its containers with `bash scripts/institute.sh stop`. For the demo, use the matching `demo.sh start` / `demo.sh stop`. These operations preserve the database. Local plain HTTP is for trusted development Wi-Fi only; live staff phones should use the hosted HTTPS origin.

## What is available on the phone

The app uses native React Native screens, not an embedded website. It now covers the same eleven role-controlled workspaces as the portal, including academic setup, calendar administration, curricula/schemes, student and marks CSV imports, results/publication, policies, accounts and audit. See [the workflow-by-workflow parity record](MOBILE_PARITY.md). Ameer still receives attendance only; added screens do not grant additional authority. The website remains separately responsive.

## Expo login and manifest troubleshooting

If iPhone reports **“You need to be signed in to Expo Go and Expo CLI”**, stop Metro with Control+C, sign in to Expo Go on the phone, then run `login`, `whoami` and the appropriate `institute` or `demo` command above with the same Expo account. Use the updated `scripts/mobile-demo.sh`: older versions force `EXPO_OFFLINE=1`, which prevents Expo CLI from resolving the signed-in account even after a login. The corrected launcher enables online access and keeps Expo's private session/cache in the separate Docker volume `hikmah-mobile-expo-home`, outside Git and application image layers. Keep Internet access available for Expo account/manifest requests as well as local Wi-Fi connectivity.

To change the Expo account, run `bash scripts/mobile-demo.sh logout`, then `login` again. This logs out Expo CLI only; it does not change Hikmah passwords or student data. `HIKMAH_EXPO_HOME_VOLUME` can choose a different private Docker home volume if multiple operators share this Mac. Treat the Docker volume as private account data; do not share/export it. The database backup helper backs up institute records, not this Expo login.

`TypeScript: tsconfig.json#include ... updated` is Expo configuring generated type paths. `Android Bundled ...` means Metro produced the bundle, not that every device workflow passed. Manifest-asset warnings and a redirect for runtime `custom` are separate messages: use the `--go` launcher/Expo Go QR, restart after login, and inspect any warning that remains. Signing in addresses the reported iOS account requirement; it does not prove a remaining asset/network issue has been resolved.

## If you prefer host Node

Install Node.js 24 LTS for Apple silicon from nodejs.org. Then, in the project root:

```sh
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install --frozen-lockfile
pnpm --filter @hikmah/mobile exec expo login
HIKMAH_DEMO_BIND=0.0.0.0 bash scripts/demo.sh start
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 pnpm dev:mobile -- --lan
```

Replace the IP with your Mac address. If your Node distribution does not include Corepack, use `npm install --global pnpm@10.28.2` instead. The Docker path above avoids this host setup.

## Development, installable preview and production builds

Expo Go is for development. The checked-in `apps/mobile/eas.json` has development, preview and production profiles.

- **Development build:** an SDK-compatible signed app for development with Metro. The matching `expo-dev-client` package is included; build the `development` profile and start Metro with `--dev-client` instead of `--go`.
- **Android preview:** installable internal-distribution APK. Use an institute/staging **HTTPS** server; release builds intentionally reject plain HTTP.
- **iPhone preview:** an ad hoc internal build requires Apple Developer membership, registered device UDIDs and signing credentials. TestFlight is an alternative through App Store Connect. A JavaScript export does not produce an installable `.ipa`.
- **Production:** use your institute's final bundle/package IDs, icons, signing credentials, privacy information, HTTPS origin and EAS project. Apple/Google store review/distribution is a separate step.

With Node/pnpm installed, run from `apps/mobile` using a maintained EAS CLI, sign in to your own Expo account and follow its prompts:

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

Set `EXPO_PUBLIC_API_URL=https://school.your-domain.org` in the EAS environment used for the build, or enter that HTTPS origin on the app's sign-in screen. It is a public endpoint, not a secret. Do not put database credentials, bootstrap passwords or Better Auth secrets into `EXPO_PUBLIC_*` values. `eas build:configure` may add your own EAS project ID; do not reuse someone else's signing configuration. Keep a record of who controls signing and store accounts.

## Device acceptance checklist

Record device/OS, app build, date, operator and outcome for each iPhone and Android test:

- Sign in/out as Admin, Mushrif, subject teacher and Ameer; check that only assigned classes/papers appear.
- Toggle both languages before and after sign-in; reopen the app and verify the preference. Check Urdu names, reading order, long text, large font size and keyboard behavior.
- Mark Present/Absent/Half/Leave on a configured academic day. Save, reopen, submit and confirm locked days cannot be silently edited. Try a holiday and a future date; the server must reject unauthorized entry.
- Check year/session/previous-session attendance totals, calendar holidays/extra days, and the multiple-day grid confirmation. As admin, preview a different weekly schedule for a selected class before applying it.
- Enter assigned marks, exam leave and on-time flags; save/reopen. An ungraded blank must remain unresolved, not zero.
- As admin/Mushrif, download a class CSV template, fill paper marks, pick it from Files/Downloads, validate, review and apply. Try a malformed file, an explicit zero, an unresolved blank and an acknowledged correction. Also try assigned-paper and student CSV imports.
- Download/share an authorized PDF and view performance/history. Check a denied report/class cannot be accessed by a lower role.
- Change your own password; verify the other device is signed out. Ask an admin to reset a test user's password, then verify the old password fails.
- As admin, try setup, staff creation/reset, invitation activation, scheme approval/revision, policies, correction review and audit. Use a synthetic class to complete preflight and explicit publication; review the PDF before any real publication.
- Put the app in the background, revoke its role on web, return and confirm the old access disappears. Test airplane mode, a slow/unreachable server, Retry saved session, unsaved navigation, rotation, reduced transparency and recovery without duplicate saves. Writes are not queued offline.

The managed Linux checks cover TypeScript, shared/API security tests and iOS/Android JavaScript bundles. Physical-device camera/QR, native networking, secure storage, sharing, accessibility and signing require the real-device checks above.
