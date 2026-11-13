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
