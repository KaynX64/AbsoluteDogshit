# Valetudo HealthLink mobile app

Flutter app for patients and emergency responders. Module-specific architecture, platform, and security guidance lives in [AGENTS.md](./AGENTS.md); repository-wide setup is in the root [AGENTS.md](../AGENTS.md).

## Configure and run

Set the API host in `lib/config/api_config.dart` for the device running the app. Android devices need a reachable LAN host; the Android emulator uses `10.0.2.2` to reach the development host. See [AGENTS.md](./AGENTS.md) for TLS and Firebase setup.

```powershell
flutter pub get
flutter run
```

## Build and test

```powershell
flutter test
flutter build apk --release
```

Do not commit Firebase service-account or `google-services.json` credentials. Platform folders are generated; edit only the exceptions listed in [AGENTS.md](./AGENTS.md).

## Account settings

Tap the initials at the top right of the patient portal or responder screen to choose **Light** or **Dark** appearance and a **LeoVital**, **Blossom**, or **Sunrise** palette. The same menu opens **Change password**.

The settings sheet previews each mode and palette before selection, shows account-save status, and groups password changes under Security. Booking cards, dates, available/unavailable time slots and the calendar picker follow the selected appearance.

The open settings sheet updates its background, text and controls together when switching modes or palettes; it does not need to be closed and reopened.

Appearance applies immediately and saves to the signed-in account using the same preferences as desktop. Pending saves remain cached for that account and retry when connectivity returns or the app resumes. The menu displays save status and a retry action. Saved selections survive app restarts; signing out resets the sign-in screen's appearance. Mobile checks for changes made on desktop when it resumes or reconnects.
