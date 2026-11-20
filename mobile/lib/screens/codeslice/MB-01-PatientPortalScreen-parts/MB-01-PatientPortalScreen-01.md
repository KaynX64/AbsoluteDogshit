<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 01 of 02 -->
# MB-01 · patient_portal_screen.dart

Mobile screens slice map · [index](../../CODESLICE.md) · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-01 · mobile/lib/screens/patient_portal_screen.dart
**LOC:** 3545 · **Anchor commit:** e0aadaa · **Role:** Patient 5-tab shell: overview/QR pass, appointments, SOS, documents, profile; queue socket, offline SOS
**Mounted by:** login_screen.dart (every non-EMERGENCY_RESPONDER role); splash_screen.dart (saved-session revalidation)
**API surface:** POST /api/emergency/sos · GET /api/privacy/status · POST /api/privacy/consent · POST /api/privacy/revoke · GET /api/appointments/queue/my · GET /api/health-pass/token · GET /api/profile/me · POST /api/auth/logout
**Socket events:** on queue:updated triggers silent refetch of active queue ticket; socket.io connect with JWT auth; no emits
**State / key fields:** nav _currentIndex · QR pass _qrToken,_loadingQR · profile _profileData,_loadingProfile,_identity · consent _hasConsented · queue _activeQueueTicket,_queuePollingTimer(30s),_socket,_previousQueueStatus · SOS _sosConsent,_isHolding,_holdProgressNotifier,_holdTimer,_isDispatchingSOS,_sosStatusMessage · active incident banner below the header and Responder Hub buttons on the health pass and profile · secure storage keys jwt_token,user_data

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-35 | — | imports: secure storage, qr_flutter, geolocator, socket_io_client, url_launcher, screens/services |
| 2 | 36-66 | _PatientIdentity | _PatientIdentity value class: roleWord, identifier, affiliation; _joinNonEmpty helper |
| 3 | 67-137 | _PatientIdentity.fromProfile | factory mapping primary_role (FACULTY, DOCTOR, NURSE, STUDENT...) to role/ID/affiliation strings |
| 4 | 138-146 | roleWithIdentifier | getters roleWithIdentifier and fullSubtitle for health pass and profile header |
| 5 | 147-161 | PatientPortalScreen | StatefulWidget shell; receives logged-in user map from login/splash routing |
| 6 | 162-202 | _PatientPortalScreenState | state fields: tab index, jwt storage, QR/profile/consent/queue/SOS-hold, responder flag |
| 7 | 203-232 | initState | boot: consent check, initial profile reuse, QR/queue fetches, queue socket, consent-gated preloading and foreground/online queue poll |
| 8 | 233-247 | dispose | removes the connectivity listener, cancels queue and hold timers, disposes hold progress and disposes the owned queue socket |
| 9 | 248-304 | _onConnectivityChanged | connectivity callback; when back online triggers queued SOS replay, then setState |
| 10 | 305-350 | _replayQueuedSosEvents | replays offline-queued SOS: POST /api/emergency/sos per event; keeps failures queued |
| 11 | 351-371 | _checkPrivacyConsent | GET /api/privacy/status; shows mandatory R.A. 10173 consent modal when not consented |
| 12 | 372-408 | _recordConsent | POST /api/privacy/consent (PHI_PROCESSING_RA_10173); refetches QR, profile and queue ticket |
| 13 | 409-433 | _revokeConsent | POST /api/privacy/revoke; ends the alert session, clears secure storage and returns to LoginScreen |
| 14 | 434-533 | _showConsentModal | R.A. 10173 privacy notice dialog; Decline exits session, Agree records consent |
| 15 | 534-583 | _showRevokeDialog | Revoke Consent confirmation dialog; confirm calls _revokeConsent |
| 16 | 584-615 | _initQueueSocket | socket.io connect to socketUrl (websocket+polling, JWT auth); queue events refresh; appointment/prescription events invalidate session data |
| 17 | 616-678 | _fetchActiveQueueTicket | Shared queue refresh with coalesced follow-up and unchanged-ticket suppression; waiting to consultation fires turn notification |
| 18 | 679-699 | _fetchQRPass | GET /api/health-pass/token; stores _qrToken for the dynamic campus pass QR |
| 19 | 700-746 | _fetchProfile | GET /api/profile/me; caches emergency contact, blood type, allergies for offline SOS |
| 20 | 747-759 | _launchDialer | opens tel: dialer via url_launcher (used for 911) |
| 21 | 760-801 | _startHold | hold-to-fire SOS: 2.5s timer + _holdProgressNotifier; _cancelHold aborts early release |
| 22 | 802-880 | _triggerEmergencySOS | GPS fix via Geolocator; offline path queues SOS + dials 911; POST /api/emergency/sos |