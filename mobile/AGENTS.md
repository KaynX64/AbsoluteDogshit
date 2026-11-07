# mobile/ — Flutter (Dart ^3.13, `flutter_lints`)
Patient portal (profile, appointments/consultation scheduling, documents, QR health pass) + responder SOS screen. Package `com.psu.valetudo.mobile`.

## Commands (run in `mobile/`)
`flutter pub get` · `flutter run` · `flutter analyze` (use as check) · `flutter test` (only the default `test/widget_test.dart`).

## Work ONLY in `lib/`
- `main.dart` — entry, Firebase init, routing.
- `config/api_config.dart` — `ApiConfig.baseUrl` (platform-aware, default `https://localhost:5000`) + shared `http.Client`. Never hardcode URLs.
- `screens/` — `login`, `splash`, `change_password`, `edit_profile`, `patient_portal` (**~2.9k lines**), `consultation_scheduler` (~1.7k), `documents_viewer` (~1.6k), `responder` (~0.8k). Grep `class `/`Widget build` then range-read.
- `services/` — `connectivity_service`, `emergency_alert_service` (~600, socket + FCM + local notification + sound), `offline_sos_service` (queue SOS when offline).
- `widgets/` — `session_timeout_listener`, `valetudo_logo`. `utils/responsive.dart`.
- Assets: `assets/emr_sound.ogg`, `assets/valetudo_logo.png` (declared in `pubspec.yaml`).

## Do not read/edit
`android/ ios/ linux/ macos/ windows/ web/` (scaffolding), `pubspec.lock`, `.metadata`, `build/`.
Touch them only for: Android/iOS permissions (location, notifications, background), package id, icons/splash, Firebase config.

## Rules
- Auth token → `flutter_secure_storage` only (never SharedPreferences/logs).
- HTTP via `ApiConfig.client`; Bearer JWT; handle 401 → logout, offline → `connectivity_service`.
- Realtime via `socket_io_client`; SOS location via `geolocator`; keep `session_timeout_listener` wrapping authenticated screens.
- Don't add packages without asking. Prefer splitting big screens into widgets in `widgets/` instead of growing them.
