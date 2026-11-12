# Try the mobile app on iPhone and Android

The repository contains a native Expo/React Native app in `apps/mobile`. Opening the website on a phone is a separate responsive-web test.

## Easiest first test on your M4 Mac: Docker + Expo Go

1. Download the updated source. Preserve your original `.env.demo` and local `docker-packages` font archives. Start Docker Desktop.
2. Install **Expo Go** from Apple's App Store on iPhone and Google Play on Android. Your app uses **Expo SDK 58**. The Expo Go client must support that SDK; if it does not, use the development/preview build section below rather than changing package versions at random.
3. Connect the Mac and both phones to the same trusted Wi-Fi. Allow Local Network access when iOS asks. Guest Wi-Fi, VPNs, client isolation or a firewall may prevent direct connection.
4. In Terminal, inside the project folder, run:

   ```sh
   bash scripts/mobile-demo.sh
   ```

   Docker supplies Node and Metro; Homebrew, a host Node installation, Xcode and Android Studio are not required for this Expo Go path. The script builds/starts the demo, exposes port 3000 on your LAN, and starts Metro on port 8081. It displays your Mac's **Phone server address** and an Expo QR code. Keep Terminal open.

5. On iPhone, scan the QR code with Camera and open in Expo Go. On Android, use Expo Go's QR scanner. You can connect both phones to the same session.
6. The mobile sign-in screen shows **Server address**. Use the printed address, for example `http://192.168.1.20:3000`. **Do not use `localhost` on a physical phone**: that means the phone itself. The app remembers this address; changing servers discards the previous server's local session.
7. Use the accounts in [the release guide](INSTITUTE_RELEASE.md#stable-local-demo-accounts). A fresh demo uses `HikmahDemo2026!`; your existing accounts keep their existing passwords unless you deliberately run the fixed-demo setup command.
8. Switch **English / اردو** and complete the checklist below.

If the script cannot find your Mac's address, find it in **System Settings → Wi-Fi → Details → TCP/IP**, then run:

```sh
HIKMAH_MOBILE_HOST_IP=192.168.1.20 bash scripts/mobile-demo.sh
```

Replace the example with your actual Mac IPv4 address. The sign-in server address points to port **3000**; the Expo QR connects to **8081**. Neither is PostgreSQL's port.

To stop Metro, press **Control+C**. To return the website to Mac-only access, run `bash scripts/demo.sh start` normally, without `HIKMAH_DEMO_BIND`. To stop the demo, run `bash scripts/demo.sh stop`. Neither removes the database.

## If you prefer host Node

Install Node.js 24 LTS for Apple silicon from nodejs.org. Then, in the project root:

```sh
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install --frozen-lockfile
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
- Check year/session attendance totals and recent-day grid confirmation.
- Enter assigned marks, exam leave and on-time flags; save/reopen. An ungraded blank must remain unresolved, not zero.
- Download/share an authorized PDF and view performance/history. Check a denied report/class cannot be accessed by a lower role.
- Change your own password; verify the other device is signed out. Ask an admin to reset a test user's password, then verify the old password fails.
- Put the app in the background, revoke its role on web, return and confirm the old access disappears. Test airplane mode and recovery without duplicate saves.

The managed Linux checks cover TypeScript, shared/API security tests and iOS/Android JavaScript bundles. Physical-device camera/QR, native networking, secure storage, sharing, accessibility and signing require the real-device checks above.
