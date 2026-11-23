# MB-07 · EmergencyAlertService

Mobile slice map · [index](../CODESLICE.md)

## MB-07 · mobile/lib/services/emergency_alert_service.dart
**LOC:** 1196 · **Anchor commit:** b8b8b1f

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-27 | `_firebaseMessagingBackgroundHandler` | Background Firebase initialization |
| 2 | 28-82 | `_generateWavBytesIsolate` | Fallback WAV synthesized only if the alarm asset fails |
| 3 | 83-160 | `enum DeliveryStatus` | Delivery UI state, session fields and plugin state |
| 4 | 161-312 | `void beginSession` | Authentication binding, teardown, sign-out and Android push retirement fallback |
| 5 | 313-387 | `void setForeground` | Foreground lifecycle, reconnect recovery and authenticated socket |
| 6 | 388-451 | `void _clearAccess` | Capability and tier refresh with session guards |
| 7 | 452-692 | `Future<bool> refreshIncidents` | Single-flight roster, status actions, read-only report APIs, shared counts, PDFs and permission recovery |
| 8 | 693-728 | `Future<void> setDutyMode` | Local mode persistence and registration retry |
| 9 | 729-830 | `Future<bool> initializeFirebase` | FCM streams, foreground hints and cold/warm tap verification |
| 10 | 831-907 | `Future<String?> currentFcmToken` | Device token and per-installation registration |
| 11 | 908-996 | `Future<void> requestNotificationPermission` | Android channels and local notification tap registration |
| 12 | 997-1058 | `void _announce` | Generic local SOS tray entries and cancellation |
| 13 | 1059-1138 | `void testSiren` | Bounded sound test and serialized foreground alarm playback |
| 14 | 1139-1196 | `Future<void> showAppointmentConfirmedNotification` | Local appointment and queue notifications |
