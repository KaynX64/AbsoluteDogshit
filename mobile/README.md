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

Tap the **Account settings** gear in the patient portal or responder header. Choose **Appearance** or **Change password**. The patient Profile tab also has a direct password shortcut.

To end your session, choose **Sign out of portal** in the patient Profile tab or **Sign out** in the responder header, then confirm.

In **Appearance**, choose **Light** or **Dark** and a **LeoVital**, **Blossom**, or **Sunrise** palette. The preview and the app update immediately. The page shows account-save status and offers **Retry saving** when needed.

**Change password** uses your current password and confirmation of the new one. After a successful change, sign in again with the new password.

Appearance saves to the signed-in account using the same preferences as desktop. Pending saves remain cached for that account and retry when connectivity returns or the app resumes. Saved selections survive restarts. Sign-in uses the default appearance, and the app checks for desktop changes on resume or reconnect.

Android responder delivery, duty settings and staging checks are documented in the [Qualified Responder specification](../QUALIFIED_RESPONDER_REVAMP_SPECIFICATION.md).
