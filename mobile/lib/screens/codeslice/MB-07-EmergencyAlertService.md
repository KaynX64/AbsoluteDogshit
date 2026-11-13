# MB-07 · emergency_alert_service.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-07 · mobile/lib/services/emergency_alert_service.dart
**LOC:** 900 · **Anchor commit:** fb9688d · **Role:** SERVICE (not a screen): singleton SOS backbone — emergency socket wiring, FCM push, alarm audio/vibration, SOS dialog, QR-flag audience
**Mounted by:** singleton factory EmergencyAlertService() — consumed by main.dart, login/splash, responder_screen, patient_portal_screen, session_timeout_listener, consultation_scheduler_screen
**API surface:** POST /api/profile/fcm-token (L279); GET /api/emergency/active (L255, L497); GET /api/profile/me (L463, qualified-responder flag sync)
**Socket events:** emit join:responders (L352); on emergency:new_alert (L356), emergency:status_change (L380), responder:status_changed (L399)
**State / key fields:** io.Socket _socket (L67), AudioPlayer + notifications plugin (L68-69), _isAlarmPlaying/_vibrationTimer/_cachedWavBytes (L72-74), _isResponderActive (L79), _lastAlertIdProcessed dedup (L80), _sosDialogContext/_sosDialogAlertId (L84-85), 4 AndroidNotificationChannel consts (L91-130)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-18 | — | imports: socket_io_client, audioplayers, local notifications, FCM, flutter_background, ApiConfig |
| 2 | 19-60 | _generateWavBytesIsolate | top-level isolate fn: builds procedural dual-tone (853/960 Hz) WAV siren bytes |
| 3 | 61-88 | EmergencyAlertService | singleton ctor; fields: _socket, audio, notifications, storage, alarm/vibration, FCM, dialog bookkeeping |
| 4 | 89-130 | _responderCriticalChannel | 4 AndroidNotificationChannel consts: SOS critical, student confirm, queue turn, appointments |
| 5 | 131-173 | initialize | initialize(): notifications + channels + permission, pre-generate WAV, audio context, connectSocket |
| 6 | 174-227 | syncFcmTokenWithBackend | FCM: permission, getToken, onTokenRefresh repost, onMessage router (EMERGENCY_SOS/QUEUE_TURN/else) |
| 7 | 228-238 | currentFcmToken | currentFcmToken getter: token for logout paths so the server can release this device's push registration |
| 8 | 239-272 | _handleForegroundSosPush | FCM SOS push: dedupe by alertId, GET /api/emergency/active for full tiered payload, then broadcast |
| 9 | 273-290 | _postTokenToServer | _postTokenToServer: POST /api/profile/fcm-token with jwt + device_type android |
| 10 | 291-325 | _enableBackgroundService | _enable/_disableBackgroundService: FlutterBackground on-call foreground service with wifi lock |
| 11 | 326-354 | connectSocket | connectSocket: socketUrl JWT auth, websocket+polling, reconnect; onConnect emits join:responders |
| 12 | 355-374 | emergency:new_alert | on emergency:new_alert: gate _isResponderActive, ignore own user_id alert, dedupe, triggerEmergencyBroadcast |
| 13 | 375-394 | emergency:status_change | on emergency:status_change: resolved/false_alarm stops alarm, cancels notif 999, closes live SOS dialog |
| 14 | 395-407 | responder:status_changed | on responder:status_changed: Qualified Responder flag toggled mid-session → _applyFlagChange (no re-login) |
| 15 | 408-424 | startResponderListener | startResponderListener: init + forced socket reconnect + background service + FCM + catch-up; stop undoes |
| 16 | 425-453 | _storedUserIsResponderRoute | QR flag: _storedUserIsResponderRoute role check; _applyFlagChange start/stops listener for flagged accounts |
| 17 | 454-487 | syncQualifiedResponderFlag | syncQualifiedResponderFlag: GET /api/profile/me, persist flag into user_data, apply live change; null on error |
| 18 | 488-516 | _catchUpOnOpenAlerts | _catchUpOnOpenAlerts: GET /api/emergency/active at listener start; alarm newest triggered, else quiet notif |
| 19 | 517-535 | showResponderCatchUpNotification | local notif id 104: 'N open SOS incidents' for already-acknowledged alerts on listener start |
| 20 | 536-558 | showStudentSosSentNotification | local notif id 101: 'SOS Alert Dispatched' confirmation for the student who sent the SOS |
| 21 | 559-580 | showAppointmentConfirmedNotification | local notif id 102 on appointment_channel: consultation confirmed / reminder |
| 22 | 581-605 | showQueueTurnNotification | local notif id 103 on clinic_queue_channel: ticket called, proceed to consultation room |
| 23 | 606-639 | playAlarmSound | playAlarmSound: loop emr_sound.ogg (cached WAV fallback), 600ms HapticFeedback vibration timer |
| 24 | 640-656 | stopAlarmSound | stopAlarmSound stops player + vibration; _cancelEmergencyNotification removes tray notif 999 |
| 25 | 657-667 | _closeSosDialog | _closeSosDialog: pops the tracked SOS dialog context from the socket listener |
| 26 | 668-717 | triggerEmergencyBroadcast | triggerEmergencyBroadcast: parses tiered payload, full-screen notif 999 (name + coords only, PHI-safe) |
| 27 | 718-781 | EMERGENCY ALERT (CRITICAL) | showDialog crimson AlertDialog: banner, DRRM protocol header, patient name, role + studentNo |
| 28 | 782-828 | Medical details not shared | tiered medical block: redacted notice for non-clinical responders vs blood type/allergies/coords |
| 29 | 829-849 | Open in Google Maps | 'Open in Google Maps' button: stops siren, launchUrl(googleMapsUrl) external |
| 30 | 850-871 | SosAlertActions | SosAlertActions shared status row (any tier may close); on close pops dialog + cancels notif |
| 31 | 872-901 | SILENCE ALARM | 'SILENCE ALARM' button: dismiss dialog without closing the incident; dialog + method close |
