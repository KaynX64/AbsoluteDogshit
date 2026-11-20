# MB-07 · EmergencyAlertService

Mobile slice map · [index](../CODESLICE.md)

## MB-07 · mobile/lib/services/emergency_alert_service.dart
**LOC:** 1023 · **Anchor verification:** Android responder revamp

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 20-24 | `_firebaseMessagingBackgroundHandler` | Background Firebase initialization |
| 2 | 25-79 | `_generateWavBytesIsolate` | Fallback WAV synthesized only if the alarm asset fails |
| 3 | 80-151 | `enum DeliveryStatus` | Delivery UI state, session fields and plugin state |
| 4 | 152-269 | `void beginSession` | Authentication binding, device settings, teardown and sign-out |
| 5 | 270-324 | `void setForeground` | Foreground lifecycle, reconnect recovery and authenticated socket |
| 6 | 325-385 | `void _clearAccess` | Capability and tier refresh with session guards |
| 7 | 386-492 | `Future<bool> refreshIncidents` | Single-flight REST snapshots and status transitions |
| 8 | 493-528 | `Future<void> setDutyMode` | Local mode persistence and registration retry |
| 9 | 529-630 | `Future<bool> initializeFirebase` | FCM streams, foreground hints and cold/warm tap verification |
| 10 | 631-703 | `Future<String?> currentFcmToken` | Device token and per-installation registration |
| 11 | 704-797 | `Future<void> requestNotificationPermission` | Android channels and local notification tap registration |
| 12 | 798-859 | `void _announce` | Generic local SOS tray entries and cancellation |
| 13 | 860-939 | `void testSiren` | Bounded sound test and serialized foreground alarm playback |
| 14 | 940-1023 | `Future<void> showStudentSosSentNotification` | Local student SOS confirmation, appointment and queue notifications |