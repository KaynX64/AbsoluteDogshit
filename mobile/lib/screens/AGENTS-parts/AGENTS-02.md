<!-- split from mobile/lib/screens/AGENTS.md — part 02 of 02 -->

### consultation_scheduler_screen.dart — 1,695 lines / 58 KB. Booking + history (2 tabs)
- **Slice map:** `codeslice/MB-02-ConsultationSchedulerScreen.md` (see the code-slice index for verified ranges).
- Data: `_fetchDoctors` L427 (`GET /api/appointments/doctors`), `_fetchAvailableSlots` L453 (`GET /api/appointments/slots?doctorId=&date=`), `_fetchMyAppointments` L482, `_submitBooking` L500 (POST), `_cancelAppointment` L616 (`PATCH /api/appointments/:id/cancel`).
- Slots refresh live: `_initSlotSocket` L149 — socket `appointment:booked` L161 / `appointment:cancelled` L166 → refetch slots for the selected doctor/date.
- All choice states use theme surfaces and paired foregrounds, including available/unavailable slots and unselected cards. Keep `onPrimary` on selected dates, slots and tabs. The date picker inherits the account theme. `mobile_appearance_test.dart` supplies an optional HTTP client and tests the rendered choices in all modes/presets.
- Lifecycle: app-lifecycle listener L143 (reconnect socket). UI: booking tab L897 · doctor list L1016 · purpose chips L1098 · date carousel L1187 · slot grid L1303 · history tab L1422.

### documents_viewer_screen.dart — 1,576 lines / 62 KB. Prescriptions / clearances / diagnostics (3 sub-tabs)
- **Slice map:** `codeslice/MB-03-DocumentsViewerScreen.md` (31 slices, verified @ 93b4172).
- Fetches: prescriptions L55, clearances L70, diagnostics/attachments L85 (`GET /api/documents/{prescriptions,clearances,attachments}/my`).
- PDF: `_downloadAndOpenPdf` L109 (`GET /api/documents/$kind/$id/pdf`, opens via `open_filex`); attachment download L1379.
- Embedded QR verification view (for scanned docs): L177 and L532 (`GET /api/documents/verify/$qrToken`).
- Lists: prescriptions L918 · clearances L1126 · diagnostics L1327; modals: prescription L174, clearance certificate L529.

### responder_screen.dart — dedicated responder route
- [Slice map](../codeslice/MB-04-ResponderScreen.md). The screen hosts the shared `ResponderHub` and retains account settings and sign-out. The authenticated alert session serves both responder routes and reconciles incidents independently of screen lifetime.

### change_password_screen.dart
- **Slice map:** `codeslice/MB-05-ChangePasswordScreen.md`.
- `_validateNewPassword` mirrors the server's length and character-group requirements. `_submit` calls `PUT /api/auth/change-password` and directs field errors to the relevant control. `_returnToSignIn` clears session state after success.

### edit_profile_screen.dart — 398 lines / 14 KB
- `_saveProfile` L64 → `PUT /api/profile/me` L80. Loads profile in `initState` L41.

### login_screen.dart — 426 lines / 16 KB
- **Slice map:** `codeslice/MB-06-LoginScreen.md` (14 slices, verified @ 93b4172).
- `_handleLogin` persists the JWT and user, binds the account theme and starts the shared alert session. Device registration runs asynchronously.
- After storing the session, bind its account theme through `AccountThemeScope` before navigation. Never carry the previous account's theme into a new sign-in.

### splash_screen.dart
- `_checkSavedSession` checks `/api/profile/me` while restoring the account theme from cache. It routes by role after validation, retains the saved session on a network failure, and treats `PRIVACY_CONSENT_REQUIRED` as a valid session. A successful profile response also seeds the patient portal's initial profile.
- Refresh the dedicated theme endpoint after accepting the session. Cached login profile theme fields may be older than the device's last successful preference save. Reset theme state on authentication rejection.

## Rules

- New screens follow the same skeleton: `XxxScreen` + `_XxxScreenState`, `initState` loads, `dispose` cleans timers/sockets/controllers, mounted guards after awaits.
- Never hardcode `http(s)://...` hosts — `ApiConfig.baseUrl` only.
- Adding a screen? Register its route in `main.dart` navigation and (if role-restricted) the login/splash routing.
- Endpoints must exist server-side (see the [server route map](../../../../server/src/routes/AGENTS.md)); QR/document URLs come from `PUBLIC_API_BASE_URL` on the server — unreachable-host bugs are usually that env var, not this folder.
