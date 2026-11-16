# MB-07 · EmergencyAlertService

Mobile slice map · [index](../CODESLICE.md)

## MB-07 · mobile/lib/services/emergency_alert_service.dart
**LOC:** 1020 · **Anchor verification:** Android responder revamp

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 19-23 | `_firebaseMessagingBackgroundHandler` | Background Firebase initialization |
| 2 | 24-78 | `_generateWavBytesIsolate` | Fallback WAV synthesized only if the alarm asset fails |
| 3 | 79-150 | `enum DeliveryStatus` | Delivery UI state, session fields and plugin state |
| 4 | 151-266 | `void beginSession` | Authentication binding, device settings, teardown and sign-out |
| 5 | 267-321 | `void setForeground` | Foreground lifecycle, reconnect recovery and authenticated socket |
| 6 | 322-382 | `void _clearAccess` | Capability and tier refresh with session guards |
| 7 | 383-489 | `Future<bool> refreshIncidents` | Single-flight REST snapshots and status transitions |
| 8 | 490-525 | `Future<void> setDutyMode` | Local mode persistence and registration retry |
| 9 | 526-627 | `Future<bool> initializeFirebase` | FCM streams, foreground hints and cold/warm tap verification |
| 10 | 628-700 | `Future<String?> currentFcmToken` | Device token and per-installation registration |
| 11 | 701-794 | `Future<void> requestNotificationPermission` | Android channels and local notification tap registration |
| 12 | 795-856 | `void _announce` | Generic local SOS tray entries and cancellation |
| 13 | 857-936 | `void testSiren` | Bounded sound test and serialized foreground alarm playback |
| 14 | 937-1020 | `Future<void> showStudentSosSentNotification` | Local student SOS confirmation, appointment and queue notifications |
