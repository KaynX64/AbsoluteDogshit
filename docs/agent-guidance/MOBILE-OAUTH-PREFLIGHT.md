# Mobile Google sign-in preflight

Run this preflight before diagnosing PSU Google sign-in, changing its configuration, or deploying a build to verify a sign-in fix. Start with read-only checks. Use the platform, build, device and API instance that reproduced the issue. Record pass, fail or unverified for each applicable check.

## Local environment and API

1. For a local Android build, check `node --version`, `flutter doctor -v` and `flutter devices`. Compare the installed tools with the [project setup](../../README.md#-getting-started). Verify the target phone is authorized for USB debugging or the emulator is available if the task needs installation. For an existing APK, identify its build mode and signer directly.
2. Read the effective API origin from the build's `API_BASE_URL` Dart define or [the app default](../../mobile/lib/config/api_config.dart). For a local phone, confirm the address is reachable from the phone. For the standard Android emulator use `10.0.2.2` when reaching a host API. Plain `flutter run` works from `mobile/` when the app default already matches the reachable API. See [device and TLS setup](../../mobile/README.md#configure-and-run).
3. For the local API, check that `server/.env` exists. Compare required settings against [the bootstrap guide](AGENTS-01.md#bootstrap-a-dev-machine-order-matters) and [the example](../../server/.env.example). Check that `GOOGLE_OAUTH_CLIENT_ID` is populated and account for any override in the server process environment. The root `.env` serves the Compose setup. For a deployed API, verify its deployment settings through the authorized environment.
4. Request `GET /api/ping` at the effective origin with TLS verification enabled. For local HTTPS, trust the CA configured for the debug build. Check the certificate chain, expiry and hostname or IP if the request fails. Report whether the check ran from the host or the device.

## OAuth files and signing

- **Android.** Inspect `mobile/android/app/google-services.json` for the client matching the build's package in [Gradle](../../mobile/android/app/build.gradle.kts). The Web OAuth ID is the `client_id` with `client_type: 3` in that client's `oauth_client` array. Compare the full ID with the API value. If the build passes `--dart-define=GOOGLE_OAUTH_CLIENT_ID=…`, compare that effective value with the API instead. For a default Android build, check the generated `default_web_client_id` resource when available to catch stale build output.
- **Android signer.** Verify the SHA-1 for the exact APK with Android SDK Build Tools' `apksigner verify --print-certs`, or use the correct variant in the [Gradle signing report](../../mobile/README.md#find-the-android-signing-fingerprint) for a build you will produce locally. Verify the package and SHA-1 are registered as an Android OAuth client in the Firebase or Google Cloud project that owns the Web client. For a Play-installed build, use the Play app signing certificate. A `client_type: 1` entry with matching package and `android_info.certificate_hash` is local evidence. If it is absent, check the console or report cloud registration as unverified. Download a fresh Android config after enabling Google sign-in or adding the fingerprint.
- **iOS.** Check the Runner bundle ID, the build's `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_REVERSED_CLIENT_ID`, and the Web client ID passed as `GOOGLE_OAUTH_CLIENT_ID`. The API must use that Web client ID. See the [iOS setup](../../mobile/README.md#psu-google-sign-in).
- **Firebase push.** Check `server/serviceAccountKey.json` only when push notifications are part of the task. The API verifies Google ID tokens through Google's OAuth library.

### Read-only Android comparison on Windows

Run from the repository root with server dependencies installed. Set `$apkSha1` to the verified signing fingerprint if available. The comparison prints presence and match results. For a build with a Dart override, check that override separately.

```powershell
$apkSha1 = ''
Push-Location server
try {
    @'
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const envPath = '.env';
const configPath = '../mobile/android/app/google-services.json';
const resourcePath = '../mobile/build/app/generated/res/processDebugGoogleServices/values/values.xml';
const envPresent = existsSync(envPath);
const configPresent = existsSync(configPath);
const env = envPresent ? parse(readFileSync(envPath)) : {};
let firebase;
if (configPresent) {
  try {
    firebase = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    console.log('Android config is not readable JSON.');
  }
}

const packageName = 'com.psu.valetudo.mobile';
const client = firebase?.client?.find(
  item => item.client_info?.android_client_info?.package_name === packageName,
);
const oauth = client?.oauth_client ?? [];
const webId = oauth.find(item => item.client_type === 3)?.client_id?.trim();
const apiId = (process.env.GOOGLE_OAUTH_CLIENT_ID ?? env.GOOGLE_OAUTH_CLIENT_ID)?.trim();
const generatedId = existsSync(resourcePath)
  ? readFileSync(resourcePath, 'utf8').match(/name="default_web_client_id"[^>]*>([^<]+)</)?.[1]?.trim()
  : undefined;
const normalizeSha = value => value?.replaceAll(':', '').trim().toLowerCase();
const sha = normalizeSha(process.argv[2]);
const matches = (left, right) => left && right ? left === right : null;

console.log(JSON.stringify({
  serverEnvExists: envPresent,
  serverEnvWebClientSet: Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim()),
  currentShellOverridesEnvFile: process.env.GOOGLE_OAUTH_CLIENT_ID !== undefined,
  androidConfigExists: configPresent,
  androidPackageFound: Boolean(client),
  androidWebClientSet: Boolean(webId),
  androidWebClientMatchesApiSettings: matches(webId, apiId),
  generatedDebugClientMatchesAndroidConfig: matches(generatedId, webId),
  apkSha1ListedInAndroidConfig: sha ? oauth.some(item =>
    item.client_type === 1 &&
    item.android_info?.package_name === packageName &&
    normalizeSha(item.android_info?.certificate_hash) === sha
  ) : null,
}, null, 2));
'@ | node --input-type=module - $apkSha1
} finally {
    Pop-Location
}
```

## Verify and report

Confirm the target API includes the [mobile sign-in migrations](../../mobile/README.md#psu-google-sign-in). Reload the affected API after authorized environment changes and rebuild after app configuration changes. For an end-to-end test, let the account owner complete the Google picker with their PSU Workspace account. Their HealthLink record must be active and have an assigned role. The mobile password form is reserved for synthetic development accounts.

Report the exact failing stage and any check that could not run. A matching client ID or healthy API is partial evidence. Keep environment values, raw Firebase configuration, tokens, credentials, signing keys and patient data out of logs and reports.
