# mobile/lib/screens/AGENTS.md — screen map & navigation anchors

One screen per file: public `XxxScreen` (stateless) + private `_XxxScreenState` (stateful). Line anchors are for commit **b7556cb** — re-derive with `rg -n "methodName" file.dart` after edits.

**Never open a file >1k lines whole** (`patient_portal_screen.dart` ~3k, `consultation_scheduler_screen.dart` ~1.7k, `documents_viewer_screen.dart` ~1.6k). Use the anchors: read a ±40-line window.

## Universal patterns (copy these; don't invent variants)

- Token: `final _storage = const FlutterSecureStorage();` → `await _storage.read(key: 'jwt_token')`. Keys: `jwt_token`, `user_data` (written at login, login_screen L54-55).
- HTTP: `ApiConfig.client` / `http.post` + `Uri.parse('${ApiConfig.baseUrl}/api/...')`, header `{'Authorization': 'Bearer $token'}`, `if (!mounted) return;` after every await. `ApiConfig.baseUrl` is the single host definition (`lib/config/api_config.dart`) — screens must not hardcode hosts.
- Sockets: `IO.io(ApiConfig.socketUrl, ...)` in `_initXxxSocket` with the JWT in `auth`; always `disconnect()` in `dispose()`.
- UI style: `_pillInputDecoration()` — each screen defines its own copy (dedupe candidate, but keep visual parity when touching one). Toasts via `SnackBar`.
- Role routing: login sends `EMERGENCY_RESPONDER` → `ResponderScreen`, everyone else → `PatientPortalScreen` (login L64-70); splash re-validates the saved session and routes the same way (`_routeUser` L83).
- After any await before `setState`/`Navigator`: keep the `mounted` guard — silent background failures in Flutter throw otherwise.
- Server enforces RBAC/consent; any role gating in screens is UX only.

## Screens

### patient_portal_screen.dart — 3,026 lines / 116 KB. The main patient hub (3 tabs)
- `_PatientIdentity` model L32; screen state L144.
- **Consent (RA 10173 gate)**: `_checkPrivacyConsent` L252 (`GET /api/privacy/status`), `_recordConsent` L270 (POST consent), `_revokeConsent` L301, consent modal `_showConsentModal` L324, revoke dialog L405. The portal blocks on this at startup.
- **Queue**: `_initQueueSocket` L447 (socket `queue:updated` L458 → refetch), `_fetchActiveQueueTicket` L464 (`GET /api/appointments/queue/my`), active-queue card L1759.
- **QR health pass**: `_fetchQRPass` L495 (`GET /api/health-pass/token`).
- **Profile**: `_fetchProfile` L510 (`GET /api/profile/me`), profile tab L2328.
- **SOS**: hold-to-trigger button `_startHold` L591 (progress `ValueNotifier` L163, `_sosConsent` gate), `_triggerEmergencySOS` L631 (`POST /api/emergency/sos` L673), confirmation dialog L703; offline SOS queueing `_replayQueuedSosEvents` L208 (replayed on reconnect).
- **Qualified Responder** (flag from login/splash, stored in `user_data`): `_isQualifiedResponder` L171 drives (1) the header chip (build L848), (2) `startResponderListener()` on entry L193, stop on dispose L227 / sign-out. `WidgetsBindingObserver` didChangeAppLifecycleState L206 re-checks via `EmergencyAlertService().syncQualifiedResponderFlag()` on resume and refreshes the chip.
- **Offline**: `_onConnectivityChanged` L203, banner L853, call-button L2285, SMS-button L2305.
- Sign out L744 (`POST /api/auth/logout` with `fcm_token` body so the server releases the device push). Tabs: overview L1070 · SOS L1860 · profile L2328; bottom nav L886, SOS nav item L1014.

### consultation_scheduler_screen.dart — 1,694 lines / 56 KB. Booking + history (2 tabs)
- Data: `_fetchDoctors` L427 (`GET /api/appointments/doctors`), `_fetchAvailableSlots` L453 (`GET /api/appointments/slots?doctorId=&date=`), `_fetchMyAppointments` L482, `_submitBooking` L500 (POST), `_cancelAppointment` L616 (`PATCH /api/appointments/:id/cancel`).
- Slots refresh live: `_initSlotSocket` L149 — socket `appointment:booked` L161 / `appointment:cancelled` L166 → refetch slots for the selected doctor/date.
- Lifecycle: app-lifecycle listener L143 (reconnect socket). UI: booking tab L897 · doctor list L1016 · purpose chips L1098 · date carousel L1187 · slot grid L1303 · history tab L1422.

### documents_viewer_screen.dart — 1,577 lines / 60 KB. Prescriptions / clearances / diagnostics (3 sub-tabs)
- Fetches: prescriptions L55, clearances L70, diagnostics/attachments L85 (`GET /api/documents/{prescriptions,clearances,attachments}/my`).
- PDF: `_downloadAndOpenPdf` L109 (`GET /api/documents/$kind/$id/pdf`, opens via `open_filex`); attachment download L1379.
- Embedded QR verification view (for scanned docs): L177 and L532 (`GET /api/documents/verify/$qrToken`).
- Lists: prescriptions L918 · clearances L1126 · diagnostics L1327; modals: prescription L174, clearance certificate L529.

### responder_screen.dart — 771 lines / 26 KB. SOS dispatch console
- `_fetchActiveAlerts` L55 (`GET /api/emergency/active`), `_updateAlertStatus` L91 (delegates to shared `updateSosAlertStatus()` — `lib/widgets/sos_alert_actions.dart`), Google Maps deep-link L126, sign out L223 (logout body sends `fcm_token`), alert card L405, stat pills L730.
- No screen-level socket — live pushes arrive via FCM through `lib/services/emergency_alert_service.dart` (its socket listens for `emergency:new_alert` and `responder:status_changed`); the screen polls/refreshes. The screen owns the listener lifecycle for EMERGENCY_RESPONDER-route accounts (start L36 / stop L48; the service's flag-change handler deliberately skips those accounts).

### change_password_screen.dart — 607 lines / 19 KB
- Client-side strength mirror `_evaluateStrength` L50 (keep in sync with server `passwordPolicy`); submit L117 (`PUT /api/auth/change-password`); requirements panel `_PasswordRequirementsPanel` L537.

### edit_profile_screen.dart — 412 lines / 13 KB
- `_saveProfile` L64 → `PUT /api/profile/me` L80. Loads profile in `initState` L41.

### login_screen.dart — 426 lines / 15 KB
- `_handleLogin` L35 (`POST /api/auth/login` L43) → stores `jwt_token` + `user_data`, syncs FCM token (`EmergencyAlertService().syncFcmTokenWithBackend()`), routes by role.

### splash_screen.dart — 296 lines / 11 KB
- `_checkSavedSession` L36 (`GET /api/profile/me` L64) → `_routeUser` L83 by roles → `_goToLogin` L100.

## Rules

- New screens follow the same skeleton: `XxxScreen` + `_XxxScreenState`, `initState` loads, `dispose` cleans timers/sockets/controllers, mounted guards after awaits.
- Never hardcode `http(s)://...` hosts — `ApiConfig.baseUrl` only.
- Adding a screen? Register its route in `main.dart` navigation and (if role-restricted) the login/splash routing.
- Endpoints must exist server-side (route map in `server/AGENTS.md`); QR/document URLs come from `PUBLIC_API_BASE_URL` on the server — unreachable-host bugs are usually that env var, not this folder.
