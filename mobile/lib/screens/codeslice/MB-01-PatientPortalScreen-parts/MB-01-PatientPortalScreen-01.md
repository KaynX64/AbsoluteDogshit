<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 01 of 02 -->
# MB-01 · patient_portal_screen.dart

Mobile screens slice map · [index](../../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-01 · mobile/lib/screens/patient_portal_screen.dart
**LOC:** 3186 · **Anchor verification:** current Overview contrast fix · **Role:** Patient 5-tab shell: overview/QR pass, appointments, SOS, documents, profile; queue socket, offline SOS
**Mounted by:** login_screen.dart (every non-EMERGENCY_RESPONDER role); splash_screen.dart (saved-session revalidation)
**API surface:** POST /api/emergency/sos (L253,L674) · GET /api/privacy/status · POST /api/privacy/consent · POST /api/privacy/revoke · GET /api/appointments/queue/my · GET /api/health-pass/token · GET /api/profile/me · POST /api/auth/logout
**Socket events:** on queue:updated triggers silent refetch of active queue ticket; socket.io connect with JWT auth; no emits
**State / key fields:** nav _currentIndex · QR pass _qrToken,_loadingQR · profile _profileData,_loadingProfile,_identity · consent _hasConsented · queue _activeQueueTicket,_queuePollingTimer(30s),_socket,_previousQueueStatus · SOS _sosConsent,_isHolding,_holdProgressNotifier,_holdTimer,_isDispatchingSOS,_sosStatusMessage · live Responder Hub below the header · secure storage keys jwt_token,user_data

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-28 | — | imports: secure storage, qr_flutter, geolocator, socket_io_client, url_launcher, screens/services |
| 2 | 29-59 | _PatientIdentity | _PatientIdentity value class: roleWord, identifier, affiliation; _joinNonEmpty helper |
| 3 | 60-130 | _PatientIdentity.fromProfile | factory mapping primary_role (FACULTY, DOCTOR, NURSE, STUDENT...) to role/ID/affiliation strings |
| 4 | 131-139 | roleWithIdentifier | getters roleWithIdentifier and fullSubtitle for health pass and profile header |
| 5 | 140-148 | PatientPortalScreen | StatefulWidget shell; receives logged-in user map from login/splash routing |
| 6 | 149-177 | _PatientPortalScreenState | state fields: tab index, jwt storage, QR/profile/consent/queue/SOS-hold, responder flag |
| 7 | 178-199 | initState | boot: consent check, initial profile reuse, QR/queue fetches, queue socket and 30s queue poll |
| 9 | 202-209 | dispose | cancels queue poll + hold timers, disconnects socket, stops responder listener |
| 10 | 210-218 | _onConnectivityChanged | connectivity callback; when back online triggers queued SOS replay, then setState |
| 11 | 219-258 | _replayQueuedSosEvents | replays offline-queued SOS: POST /api/emergency/sos per event; keeps failures queued |
| 12 | 259-280 | _checkPrivacyConsent | GET /api/privacy/status; shows mandatory R.A. 10173 consent modal when not consented |
| 13 | 281-311 | _recordConsent | POST /api/privacy/consent (PHI_PROCESSING_RA_10173); refetches QR, profile, queue ticket |
| 14 | 312-336 | _revokeConsent | POST /api/privacy/revoke; wipes secure storage and returns to LoginScreen |
| 15 | 337-419 | _showConsentModal | R.A. 10173 privacy notice dialog; Decline exits session, Agree records consent |
| 16 | 420-457 | _showRevokeDialog | Revoke Consent confirmation dialog; confirm calls _revokeConsent |
| 17 | 458-479 | _initQueueSocket | socket.io connect to socketUrl (websocket+polling, JWT auth); on queue:updated refetch |
| 18 | 480-510 | _fetchActiveQueueTicket | GET /api/appointments/queue/my; waiting to in-consultation fires turn notification |
| 19 | 511-529 | _fetchQRPass | GET /api/health-pass/token; stores _qrToken for the dynamic campus pass QR |
| 20 | 530-568 | _fetchProfile | GET /api/profile/me; caches emergency contact, blood type, allergies for offline SOS |
| 21 | 569-585 | _launchDialer | opens tel: dialer via url_launcher (used for 911) |
| 22 | 586-625 | _startHold | hold-to-fire SOS: 2.5s timer + _holdProgressNotifier; _cancelHold aborts early release |
| 23 | 626-697 | _triggerEmergencySOS | GPS fix via Geolocator; offline path queues SOS + dials 911; POST /api/emergency/sos |
