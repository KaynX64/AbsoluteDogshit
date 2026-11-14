<!-- split from mobile/lib/screens/AGENTS.md — part 02 of 02 -->

### consultation_scheduler_screen.dart — 1,695 lines / 58 KB. Booking + history (2 tabs)
- **Slice map:** `codeslice/MB-02-ConsultationSchedulerScreen.md` (see the code-slice index for verified ranges).
- Data: `_fetchDoctors` L427 (`GET /api/appointments/doctors`), `_fetchAvailableSlots` L453 (`GET /api/appointments/slots?doctorId=&date=`), `_fetchMyAppointments` L482, `_submitBooking` L500 (POST), `_cancelAppointment` L616 (`PATCH /api/appointments/:id/cancel`).
- Slots refresh live: `_initSlotSocket` L149 — socket `appointment:booked` L161 / `appointment:cancelled` L166 → refetch slots for the selected doctor/date.
- Lifecycle: app-lifecycle listener L143 (reconnect socket). UI: booking tab L897 · doctor list L1016 · purpose chips L1098 · date carousel L1187 · slot grid L1303 · history tab L1422.

### documents_viewer_screen.dart — 1,576 lines / 62 KB. Prescriptions / clearances / diagnostics (3 sub-tabs)
- **Slice map:** `codeslice/MB-03-DocumentsViewerScreen.md` (31 slices, verified @ 93b4172).
- Fetches: prescriptions L55, clearances L70, diagnostics/attachments L85 (`GET /api/documents/{prescriptions,clearances,attachments}/my`).
- PDF: `_downloadAndOpenPdf` L109 (`GET /api/documents/$kind/$id/pdf`, opens via `open_filex`); attachment download L1379.
- Embedded QR verification view (for scanned docs): L177 and L532 (`GET /api/documents/verify/$qrToken`).
- Lists: prescriptions L918 · clearances L1126 · diagnostics L1327; modals: prescription L174, clearance certificate L529.

### responder_screen.dart — 795 lines / 29 KB. SOS dispatch console
- **Slice maps:** `codeslice/MB-04-ResponderScreen.md` (18 slices) · SOS service → `codeslice/MB-07-EmergencyAlertService.md` (31 slices) — verified @ 93b4172.
- `_fetchActiveAlerts` L56 (`GET /api/emergency/active`), `_updateAlertStatus` L103 (delegates to shared `updateSosAlertStatus()` — `lib/widgets/sos_alert_actions.dart`; surfaces the server's 409 message, treats "already closed elsewhere" as success), Google Maps deep-link L138 (stops the alarm first), SOS dialog broadcast L82 (passes `onStatusChanged` so list actions made in the dialog refresh the screen), sign out ~L248 (logout body sends `fcm_token`), alert card L429, stat pills L754.
- `lib/services/emergency_alert_service.dart` handles both FCM and Socket.IO events. The screen polls and refreshes its active list. The screen owns the listener lifecycle for EMERGENCY_RESPONDER-route accounts (start L41 / stop L52; the service's flag-change handler deliberately skips those accounts).

### change_password_screen.dart — 607 lines / 20 KB
- **Slice map:** `codeslice/MB-05-ChangePasswordScreen.md` (17 slices, verified @ 93b4172).
- Client-side strength mirror `_evaluateStrength` L50 (keep in sync with server `passwordPolicy`); submit L117 (`PUT /api/auth/change-password`); requirements panel `_PasswordRequirementsPanel` L537.

### edit_profile_screen.dart — 398 lines / 14 KB
- `_saveProfile` L64 → `PUT /api/profile/me` L80. Loads profile in `initState` L41.

### login_screen.dart — 426 lines / 16 KB
- **Slice map:** `codeslice/MB-06-LoginScreen.md` (14 slices, verified @ 93b4172).
- `_handleLogin` L35 (`POST /api/auth/login` L43) → stores `jwt_token` + `user_data`, syncs FCM token (`EmergencyAlertService().syncFcmTokenWithBackend()`), routes by role.

### splash_screen.dart — 309 lines / 13 KB
- `_checkSavedSession` L36 (`GET /api/profile/me` L64) → `_routeUser` L83 by roles → `_goToLogin` L100.

## Rules

- New screens follow the same skeleton: `XxxScreen` + `_XxxScreenState`, `initState` loads, `dispose` cleans timers/sockets/controllers, mounted guards after awaits.
- Never hardcode `http(s)://...` hosts — `ApiConfig.baseUrl` only.
- Adding a screen? Register its route in `main.dart` navigation and (if role-restricted) the login/splash routing.
- Endpoints must exist server-side (see the [server route map](../../../../server/src/routes/AGENTS.md)); QR/document URLs come from `PUBLIC_API_BASE_URL` on the server — unreachable-host bugs are usually that env var, not this folder.
