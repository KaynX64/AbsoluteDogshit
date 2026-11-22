<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 01 of 02 -->
# MB-01 · patient_portal_screen.dart

Mobile screens slice map · [index](../../CODESLICE.md) · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-01 · mobile/lib/screens/patient_portal_screen.dart
**LOC:** 3461 · **Anchor commit:** b8b8b1f · **Role:** Patient 5-tab shell: overview/QR pass, appointments, SOS, documents, profile; queue socket, offline SOS
**Mounted by:** login_screen.dart (every non-EMERGENCY_RESPONDER role); splash_screen.dart (saved-session revalidation)
**API surface:** POST /api/emergency/sos · GET /api/privacy/status · POST /api/privacy/consent · POST /api/privacy/revoke · GET /api/appointments/queue/my · GET /api/health-pass/token · GET /api/profile/me · POST /api/auth/logout
**Socket events:** on queue:updated triggers silent refetch of active queue ticket; socket.io connect with JWT auth; no emits
**State / key fields:** nav _currentIndex · QR pass _qrToken,_loadingQR · profile _profileData,_loadingProfile,_identity · consent _hasConsented · queue _activeQueueTicket,_queuePollingTimer(30s),_socket,_previousQueueStatus · SOS _sosConsent,_isHolding,_holdProgressNotifier,_holdTimer,_isDispatchingSOS,_sosStatusMessage · active incident banner below the header and Responder Hub buttons on the health pass and profile · secure storage keys jwt_token,user_data

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-34 | — | imports: secure storage, qr_flutter, geolocator, socket_io_client, url_launcher, screens/services |
| 2 | 35-65 | _PatientIdentity | _PatientIdentity value class: roleWord, identifier, affiliation; _joinNonEmpty helper |
| 3 | 66-136 | _PatientIdentity.fromProfile | factory mapping primary_role (FACULTY, DOCTOR, NURSE, STUDENT...) to role/ID/affiliation strings |
| 4 | 137-145 | roleWithIdentifier | getters roleWithIdentifier and fullSubtitle for health pass and profile header |
| 5 | 146-160 | PatientPortalScreen | StatefulWidget shell; receives logged-in user map from login/splash routing |
| 6 | 161-206 | _PatientPortalScreenState | state fields: tab index, jwt storage, QR/profile/consent/queue/SOS-hold, responder flag |
| 7 | 207-237 | initState | boot: consent check, initial profile reuse, QR/queue fetches, queue socket, consent-gated preloading and foreground/online queue poll |
| 8 | 238-254 | dispose | removes the connectivity listener, cancels queue and hold timers, disposes hold progress and disposes the owned queue socket |
| 9 | 255-314 | _onConnectivityChanged | connectivity callback; when back online triggers queued SOS replay, then setState |
| 10 | 315-359 | _replayQueuedSosEvents | Sync account-owned SOS requests and show receipt, retry or rejection; sign-in, resume and reconnect trigger replay |
| 11 | 360-380 | _checkPrivacyConsent | GET /api/privacy/status; shows mandatory R.A. 10173 consent modal when not consented |
| 12 | 381-417 | _recordConsent | POST /api/privacy/consent (PHI_PROCESSING_RA_10173); refetches QR, profile and queue ticket |
| 13 | 418-439 | _revokeConsent | POST /api/privacy/revoke; ends the alert session, clears secure storage and returns to LoginScreen |
| 14 | 440-526 | _showConsentModal | R.A. 10173 privacy notice dialog; Decline exits session, Agree records consent |
| 15 | 527-576 | _showRevokeDialog | Revoke Consent confirmation dialog; confirm calls _revokeConsent |
| 16 | 577-617 | _initQueueSocket | socket.io connect to socketUrl (websocket+polling, JWT auth); queue events refresh; appointment/prescription events invalidate session data |
| 17 | 618-699 | _fetchActiveQueueTicket | Shared queue refresh with coalesced follow-up and unchanged-ticket suppression; waiting to consultation fires turn notification |
| 18 | 700-742 | _fetchQRPass | Load the current health pass, track its expiry and refresh the visible pass |
| 19 | 743-784 | _fetchProfile | Load the profile and cache emergency contact details for the signed-in account |
| 20 | 785-796 | _launchDialer | opens tel: dialer via url_launcher (used for 911) |
| 21 | 797-838 | _startHold | hold-to-fire SOS: 2.5s timer + _holdProgressNotifier; _cancelHold aborts early release |
| 22 | 839-889 | _triggerEmergencySOS | Request location with a timeout, save a keyed SOS request and reconcile server receipt |
