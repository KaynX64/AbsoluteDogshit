# mobile/AGENTS.md — Flutter patient & responder app

Flutter (Dart SDK ^3.13.3). Key packages: `http`, `flutter_secure_storage` (token storage), `socket_io_client` (v2 — matches server Socket.IO v4), `qr_flutter`, `geolocator`, `flutter_local_notifications`, `flutter_background`, `firebase_core` + `firebase_messaging` (FCM push), `connectivity_plus`, `audioplayers`, `url_launcher`, `open_filex`, `path_provider`.

## API host — one hardcode point

`lib/config/api_config.dart` is the host authority: Android uses a hardcoded LAN IP; the Android **emulator** must use `10.0.2.2` instead; web falls back to `localhost`. Read the configured value from that file rather than duplicating the IP in documentation. Change the URL only there, then fully restart the app so existing HTTP and socket connections use the new host.

## Code map — lib/

- `main.dart` — bootstrap, theme, auth gate / navigation.
- `screens/` — `splash_screen`, `login_screen`, `patient_portal_screen` (~123 KB — search, don't read whole), `consultation_scheduler_screen`, `documents_viewer_screen` (verified PDF stream), `responder_screen` (SOS console), `edit_profile_screen`, `change_password_screen`.
- `screens/CODESLICE.md` + `screens/codeslice/` — per-screen slice maps (verified line ranges + rg-able anchors, one sub-MD per monolith); also maps `services/emergency_alert_service.dart` (MB-07).
- `services/` — `connectivity_service` (offline detection), `emergency_alert_service` (SOS + geolocation + Qualified Responder flag handling; its socket also listens for `emergency:status_change` — any responder closing an incident stops this device's alarm and closes its SOS dialog), `offline_sos_service` (queues SOS while offline).
- `widgets/` — `session_timeout_listener` (logout releases the FCM token + stops the responder listener), `valetudo_logo`, `sos_alert_actions` (shared SOS status-change path: `updateSosAlertStatus()` returns a result map `{ok, error, code, currentStatus}` + stateful `SosAlertActions` row; ALL responder tiers may acknowledge/dispatch/resolve/false-alarm — 409 "already closed" is treated as success).
- **Qualified Responder** (`USERS.is_qualified_responder`, any role): login + splash store the flag in `user_data`; a flagged patient-side account runs `EmergencyAlertService().startResponderListener()` while PatientPortalScreen is open (flag-gated, role routing unchanged — EMERGENCY_RESPONDER accounts still land on ResponderScreen). `responder:status_changed` (socket) and `syncQualifiedResponderFlag()` (on resume) apply flag changes mid-session; `_storedUserIsResponderRoute()` guards ResponderScreen-routed accounts. Logout paths (portal L744, responder screen, session timeout) send `fcm_token` in the logout body so the server drops the device's push registration.
- `utils/responsive.dart` — breakpoints.

## Account appearance and settings

- Both role headers use the 48 dp gear in `widgets/account_settings_button.dart`. The shared Account settings page opens Appearance and Change password. Keep the patient Profile password shortcut pointed at the same form. Appearance uses scrollable labeled choices, a live preview, and account-save status and retry. Test theme changes in both directions on the open Appearance page.
- Password change validates the same new value it sends, mirrors the server's length and character-group rules, and leaves account-specific checks to the server. After success, clear the session keys and active theme, preserve per-account appearance caches, and replace the navigation stack with sign-in. Send the device's FCM token when available so the server can remove its registration.
- `theme/account_theme_controller.dart` owns account-scoped secure-storage caches, pending saves, serialized writes and session/revision guards. Login binds fresh account preferences; splash restores this account's cache before refreshing. Reconnect and app resume refresh server preferences without replacing pending local edits. Reset the controller on every sign-out/session termination path.
- Both clients share `GET`/`PUT /api/profile/theme` and `USERS.theme_mode` / `theme_preset`. No schema change is needed. Theme access is authenticated and independent of clinical privacy consent. Mobile changes follow the account to desktop on its next account-theme load; mobile refreshes desktop changes on resume/reconnect.
- `theme/app_palette.dart` mirrors desktop preset anchors and bridges custom screen colors to Flutter's `ColorScheme`. Use theme-derived colors for new UI. Keep emergency action contrast and explicitly white QR backgrounds. Do not add account-global appearance storage or use one account's cached preference for another.
- Match foregrounds to their actual surfaces in every state: `onPrimary` on primary fills, `onSurface` on regular cards, and `onSurfaceVariant` for secondary labels. Booking doctor/purpose/date/slot choices must theme both selected and unselected fills. Disabled slots use container surfaces; the date picker inherits the current theme. Reserve white fills for QR/paper or an explicit Light-mode preview.
- Run `flutter test` and `flutter analyze` after appearance/session changes. `test/account_theme_test.dart` covers account persistence and both role headers. `test/mobile_appearance_test.dart` covers live contrast, date-picker mode and appearance at enlarged text scale. `test/change_password_test.dart` covers field validation, recovery, and sign-in after success.

## Platform folders are GENERATED: android/, ios/, linux/, macos/, windows/, web/

Regenerated by `flutter create .` — do not hand-edit and do not read them wholesale. Legitimate exceptions only:

- `android/app/src/main/AndroidManifest.xml` (permissions), `android/app/build.gradle.kts` (applicationId / versions), `android/app/src/{debug,profile}/AndroidManifest.xml`.
- `ios/Runner/Info.plist` (permission strings) and the entitlements files.
- `web/index.html`, `web/manifest.json`.

## Firebase

Push notifications require `android/app/google-services.json` (gitignored — fetch it from the Firebase console; never commit it). The server side needs `server/serviceAccountKey.json`.

## Commands

`flutter pub get` · `flutter run` (device, or `-d chrome`) · `flutter build apk --release` · `flutter test`.

## Gotchas

- `main.dart` installs `DevHttpOverrides` only in debug mode and its callback returns `kDebugMode`. Release builds retain certificate validation. A release device needs a certificate chain trusted by its actual Android/app trust configuration; do not assume installing a user CA is sufficient. Symptom of a trust mismatch: `HandshakeException` on login. The comment above `DevHttpOverrides` incorrectly mentions allowing release certificates; follow the executable behavior.
- Document/QR URLs are generated server-side from `PUBLIC_API_BASE_URL` — that host must be reachable from the phone's network or `documents_viewer_screen` and scanned QR codes will fail.
- Never read `pubspec.lock` or the `android/gradle*` files unless the task is build configuration.
