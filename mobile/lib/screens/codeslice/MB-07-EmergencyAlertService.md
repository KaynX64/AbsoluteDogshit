# MB-07 · EmergencyAlertService

Mobile slice map · [index](../CODESLICE.md)

## MB-07 · mobile/lib/services/emergency_alert_service.dart
**LOC:** 1099 · **Anchor verification:** Android responder revamp

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 20-24 | `_firebaseMessagingBackgroundHandler` | Background Firebase initialization |
| 2 | 25-79 | `_generateWavBytesIsolate` | Fallback WAV synthesized only if the alarm asset fails |
| 3 | 80-154 | `enum DeliveryStatus` | Delivery UI state, session fields and plugin state |
| 4 | 155-300 | `void beginSession` | Authentication binding, teardown, sign-out and Android push retirement fallback |
| 5 | 301-362 | `void setForeground` | Foreground lifecycle, reconnect recovery and authenticated socket |
| 6 | 363-423 | `void _clearAccess` | Capability and tier refresh with session guards |
| 7 | 424-592 | `Future<bool> refreshIncidents` | Single-flight active roster, status transitions and pending incident report requests |
| 8 | 593-628 | `Future<void> setDutyMode` | Local mode persistence and registration retry |
| 9 | 629-730 | `Future<bool> initializeFirebase` | FCM streams, foreground hints and cold/warm tap verification |
| 10 | 731-807 | `Future<String?> currentFcmToken` | Device token and per-installation registration |
| 11 | 808-899 | `Future<void> requestNotificationPermission` | Android channels and local notification tap registration |
| 12 | 900-961 | `void _announce` | Generic local SOS tray entries and cancellation |
| 13 | 962-1041 | `void testSiren` | Bounded sound test and serialized foreground alarm playback |
| 14 | 1042-1099 | `Future<void> showAppointmentConfirmedNotification` | Local appointment and queue notifications |
