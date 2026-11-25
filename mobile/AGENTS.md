# mobile/AGENTS.md — Flutter patient & responder app

Flutter (Dart SDK ^3.13.3). Key packages: `http`, `flutter_secure_storage` (token storage), `socket_io_client` (v2 — matches server Socket.IO v4), `qr_flutter`, `geolocator`, `flutter_local_notifications`, `firebase_core` + `firebase_messaging` (FCM push), `connectivity_plus`, `audioplayers`, `url_launcher`, `open_filex`, `path_provider`.

## API host

`lib/config/api_config.dart` is the host authority for REST and Socket.IO. Pass `--dart-define=API_BASE_URL=…` with a reachable HTTPS origin at build or launch time. Without an override, the app uses the checked-in LAN address. Rebuild when changing the origin. See the [mobile setup guide](README.md#configure-and-run) for phone and emulator commands.

## Code map — lib/

- `main.dart` — bootstrap, theme, auth gate / navigation.
- `screens/` — `splash_screen`, `login_screen`, `patient_portal_screen` (use the slice map), `consultation_scheduler_screen`, `documents_viewer_screen` (verified PDF stream), `responder_screen` (SOS console), `edit_profile_screen`, `change_password_screen`.
- `screens/CODESLICE.md` + `screens/codeslice/` — per-screen slice maps (verified line ranges + rg-able anchors, one sub-MD per monolith); also maps `services/emergency_alert_service.dart` (MB-07) and `widgets/responder_hub.dart` (MB-08).
- `services/` owns connectivity, the session-scoped typed responder roster, FCM and alarm playback, and the offline SOS queue.
- `widgets/` contains the shared Responder Hub, incident detail sheet, confirmed status actions, and session timeout listener.
- Responder access uses live clinic-approved appointments after staged cutover; the boolean is a compatibility projection, never authority. Community accounts acknowledge only; staff appointments also require a live clinical/emergency staff role. Reviewer designation is independent of SOS access. Qualification applications/renewals are in account settings. Preserve expiry timers, session guards, duty modes and private evidence access. [Qualifications](../server/RESPONDER-QUALIFICATIONS.md) · [Responder records](../server/RESPONDER-RECORDS.md).
- `utils/responsive.dart` — breakpoints.
- Responder UI uses `ResponderStyle` and shared filters/cards. `ActiveIncidentCard` reuses `SosAlertActions` for quick actions and closure confirmation. Preserve account fonts, 200% text scaling, lazy destinations and bounded memory caches; hidden views defer refreshes.

## Account appearance and settings

- Both headers keep the 48 dp settings gear. `widgets/account_settings_button.dart` opens a scrollable `AccountSettingsSheet` with Light/Dark, named two-circle palettes, save status/retry and Change password. No screen previews. Its live Material surface sits over a transparent modal route, keeping theme changes readable while open. The Profile password shortcut uses the same form.
- Password change validates the same new value it sends, mirrors the server's length and character-group rules, and leaves account-specific checks to the server. After success, clear the session keys and active theme, preserve per-account appearance caches, and replace the navigation stack with sign-in. Include the installation ID when available and the FCM token for legacy registration cleanup.
- `theme/account_theme_controller.dart` owns account-scoped secure-storage caches, pending saves, serialized writes and session/revision guards. Login binds fresh account preferences; splash restores this account's cache before refreshing. Reconnect and app resume refresh server preferences without replacing pending local edits. Reset the controller on every sign-out/session termination path.
- Both clients share `GET`/`PUT /api/profile/theme` and `USERS.theme_mode` / `theme_preset`. No schema change is needed. Theme access is authenticated and independent of clinical privacy consent. Mobile changes follow the account to desktop on its next account-theme load; mobile refreshes desktop changes on resume/reconnect.
- `theme/app_palette.dart` mirrors desktop preset anchors and bridges custom screen colors to Flutter's `ColorScheme`. Use theme-derived colors for new UI. Keep emergency action contrast and explicitly white QR backgrounds. Do not add account-global appearance storage or use one account's cached preference for another.
- Match foregrounds to their actual surfaces in every state: `onPrimary` on primary fills, `onSurface` on regular cards, and `onSurfaceVariant` for secondary labels. Booking doctor/purpose/date/slot choices must theme both selected and unselected fills. Disabled slots use container surfaces; the date picker inherits the current theme. Reserve white fills for QR/paper or an explicit Light-mode preview.
- Run `flutter test` and `flutter analyze` after appearance/session changes. `test/account_theme_test.dart` covers account persistence and both role headers. `test/mobile_appearance_test.dart` covers open-drawer contrast, dismissal, date-picker mode and 200% text scale. `test/change_password_test.dart` covers field validation, recovery, and sign-in after success.

## Platform folders are GENERATED: android/, ios/, linux/, macos/, windows/, web/

Regenerated by `flutter create .` — do not hand-edit and do not read them wholesale. Legitimate exceptions only:

- `android/app/src/main/AndroidManifest.xml` (permissions), `android/app/build.gradle.kts` (applicationId / versions), `android/app/src/{debug,profile}/AndroidManifest.xml`.
- `ios/Runner/Info.plist` (permission strings) and the entitlements files.
- `web/index.html`, `web/manifest.json`.

## Firebase

Push notifications require `android/app/google-services.json` (gitignored — fetch it from the Firebase console; never commit it). The server side needs `server/serviceAccountKey.json`.

The first Flutter frame renders before Firebase, Android notification setup and connectivity monitoring start. Authenticated routes start their realtime connections after sign-in or saved-session validation. Local notifications wait for channel setup, and the alarm audio player is created when an alarm first sounds.

## Commands

`flutter pub get` · `flutter run` (device, or `-d chrome`) · `flutter build apk --release` · `flutter test`.

## Gotchas

- `main.dart` installs `DevHttpOverrides` only in debug mode. Release builds validate the certificate chain and configured hostname or IP. Sign-in distinguishes TLS failures from a server that cannot be reached.
- Document/QR URLs are generated server-side from `PUBLIC_API_BASE_URL` — that host must be reachable from the phone's network or `documents_viewer_screen` and scanned QR codes will fail.
- Never read `pubspec.lock` or the `android/gradle*` files unless the task is build configuration.
