# MB-07 · EmergencyAlertService

Mobile slice map · [index](../CODESLICE.md)

## MB-07 · mobile/lib/services/emergency_alert_service.dart
**LOC:** 1218 · **Anchor commit:** 4e79e9b plus working-tree changes

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-27 | `_firebaseMessagingBackgroundHandler` | Background Firebase initialization |
| 2 | 28-82 | `_generateWavBytesIsolate` | Fallback WAV synthesized only if the alarm asset fails |
| 3 | 83-161 | `enum DeliveryStatus` | Delivery UI state, session fields and plugin state |
| 4 | 162-315 | `void beginSession` | Authentication binding, teardown, sign-out and Android push retirement fallback |
| 5 | 316-390 | `void setForeground` | Foreground lifecycle, reconnect recovery and authenticated socket |
| 6 | 391-473 | `void _clearAccess` | Capability and tier refresh with session guards |
| 7 | 474-714 | `Future<bool> refreshIncidents` | Single-flight roster, status actions, read-only report APIs, shared counts, PDFs and permission recovery |
| 8 | 715-750 | `Future<void> setDutyMode` | Local mode persistence and registration retry |
| 9 | 751-852 | `Future<bool> initializeFirebase` | FCM streams, foreground hints and cold/warm tap verification |
| 10 | 853-929 | `Future<String?> currentFcmToken` | Device token and per-installation registration |
| 11 | 930-1018 | `Future<void> requestNotificationPermission` | Android channels and local notification tap registration |
| 12 | 1019-1080 | `void _announce` | Generic local SOS tray entries and cancellation |
| 13 | 1081-1160 | `void testSiren` | Bounded sound test and serialized foreground alarm playback |
| 14 | 1161-1218 | `Future<void> showAppointmentConfirmedNotification` | Local appointment and queue notifications |