<!-- split from mobile/lib/screens/AGENTS.md — part 02 of 02 -->

### consultation_scheduler_screen.dart — booking and history
- [Slice map](../codeslice/MB-02-ConsultationSchedulerScreen.md).
- Data: `_fetchDoctors` (`GET /api/appointments/doctors`), `_fetchAvailableSlots` (`GET /api/appointments/slots?doctorId=&date=`), `_fetchMyAppointments`, `_submitBooking` (POST), `_cancelAppointment` (`PATCH /api/appointments/:id/cancel`).
- `_initSlotSocket` refetches slots for the selected clinician and date on `appointment:booked` or `appointment:cancelled`.
- Booking requires the themed, scrollable `widgets/appointment_booking_review.dart` dialog before POST. Snapshot the selected care team, purpose, date/time and trimmed notes; submit only after explicit confirmation. Edit/back/dismiss preserve the draft. `_isReviewing` prevents duplicate dialogs; `_isSubmitting` prevents duplicate requests. A slot refresh during review invalidates the snapshot and requires a new selection/review. `appointment_booking_review_test.dart` covers this flow and all palettes in light/dark at 320dp and 200% text.
- All choice states use theme surfaces and paired foregrounds, including available/unavailable slots and unselected cards. Keep `onPrimary` on selected dates, slots and tabs. The date picker inherits the account theme. `mobile_appearance_test.dart` supplies an optional HTTP client and tests the rendered choices in all modes/presets.
- The app lifecycle listener reconnects the slot socket. History supports list and grid layouts.

### documents_viewer_screen.dart — prescriptions, clearances and diagnostics

- [Slice map](../codeslice/MB-03-DocumentsViewerScreen.md). Each tab supports list and grid layouts.
- `_fetchPrescriptions`, `_fetchClearances` and `_fetchDiagnostics` read `GET /api/documents/{prescriptions,clearances,attachments}/my`.
- `_downloadAndOpenPdf` retrieves a protected PDF and opens it through `open_filex`. `_openDiagnosticDocument` handles attachment downloads.
- The prescription and clearance previews encode a public `/api/documents/verify/:qrToken` link in the QR seal.

### responder_screen.dart — dedicated responder route
- [Slice map](../codeslice/MB-04-ResponderScreen.md). The screen hosts the shared `ResponderHub` and retains account settings and sign-out. The authenticated alert session serves both responder routes and reconciles incidents independently of screen lifetime.

### change_password_screen.dart
- [Slice map](../codeslice/MB-05-ChangePasswordScreen.md).
- `_validateNewPassword` mirrors the server's length and character-group requirements. `_submit` calls `PUT /api/auth/change-password` and directs field errors to the relevant control. `_returnToSignIn` clears session state after success.

### edit_profile_screen.dart
- `initState` initializes the form with the supplied profile. `_saveProfile` calls `PUT /api/profile/me`.

### login_screen.dart
- [Slice map](../codeslice/MB-06-LoginScreen.md).
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
