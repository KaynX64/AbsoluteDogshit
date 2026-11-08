<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 01 of 02 -->
# MB-01 · patient_portal_screen.dart

Mobile screens slice map · [index](../../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-01 · mobile/lib/screens/patient_portal_screen.dart
**LOC:** 3102 · **Anchor commit:** 4a14140 · **Role:** Patient 5-tab shell: overview/QR pass, appointments, SOS, documents, profile; queue socket, offline SOS
**Mounted by:** login_screen.dart L75 (every non-EMERGENCY_RESPONDER role); splash_screen.dart L108 (saved-session revalidation)
**API surface:** POST /api/emergency/sos (L253,L674) · GET /api/privacy/status (L290) · POST /api/privacy/consent (L308) · POST /api/privacy/revoke (L339) · GET /api/appointments/queue/my (L502) · GET /api/health-pass/token (L534) · GET /api/profile/me (L549) · POST /api/auth/logout (L752)
**Socket events:** on queue:updated (L492) triggers silent refetch of active queue ticket; socket.io connect with JWT auth L484-491; no emits
**State / key fields:** nav _currentIndex · QR pass _qrToken,_loadingQR · profile _profileData,_loadingProfile,_identity · consent _hasConsented · queue _activeQueueTicket,_queuePollingTimer(30s),_socket,_previousQueueStatus · SOS _sosConsent,_isHolding,_holdProgressNotifier,_holdTimer,_isDispatchingSOS,_sosStatusMessage · responder _isQualifiedResponder · secure storage keys jwt_token,user_data

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-23 | — | imports: secure storage, qr_flutter, geolocator, socket_io_client, url_launcher, screens/services |
| 2 | 24-54 | _PatientIdentity | _PatientIdentity value class: roleWord, identifier, affiliation; _joinNonEmpty helper |
| 3 | 55-125 | _PatientIdentity.fromProfile | factory mapping primary_role (FACULTY, DOCTOR, NURSE, STUDENT...) to role/ID/affiliation strings |
| 4 | 126-134 | roleWithIdentifier | getters roleWithIdentifier and fullSubtitle for health pass and profile header |
| 5 | 135-142 | PatientPortalScreen | StatefulWidget shell; receives logged-in user map from login/splash routing |
| 6 | 143-176 | _PatientPortalScreenState | state fields: tab index, jwt storage, QR/profile/consent/queue/SOS-hold, responder flag |
| 7 | 177-203 | initState | boot: consent check, QR/profile/queue fetches, socket init, 30s queue poll, responder listener |
| 8 | 204-216 | didChangeAppLifecycleState | on app resume re-syncs _isQualifiedResponder via syncQualifiedResponderFlag |
| 9 | 217-231 | dispose | cancels queue poll + hold timers, disconnects socket, stops responder listener |
| 10 | 232-240 | _onConnectivityChanged | connectivity callback; when back online triggers queued SOS replay, then setState |
| 11 | 241-280 | _replayQueuedSosEvents | replays offline-queued SOS: POST /api/emergency/sos per event; keeps failures queued |
| 12 | 281-302 | _checkPrivacyConsent | GET /api/privacy/status; shows mandatory R.A. 10173 consent modal when not consented |
| 13 | 303-333 | _recordConsent | POST /api/privacy/consent (PHI_PROCESSING_RA_10173); refetches QR, profile, queue ticket |
| 14 | 334-356 | _revokeConsent | POST /api/privacy/revoke; wipes secure storage and returns to LoginScreen |
| 15 | 357-437 | _showConsentModal | R.A. 10173 privacy notice dialog; Decline exits session, Agree records consent |
| 16 | 438-475 | _showRevokeDialog | Revoke Consent confirmation dialog; confirm calls _revokeConsent |
| 17 | 476-496 | _initQueueSocket | socket.io connect to socketUrl (websocket+polling, JWT auth); on queue:updated refetch |
| 18 | 497-527 | _fetchActiveQueueTicket | GET /api/appointments/queue/my; waiting to in-consultation fires turn notification |
| 19 | 528-542 | _fetchQRPass | GET /api/health-pass/token; stores _qrToken for the dynamic campus pass QR |
| 20 | 543-572 | _fetchProfile | GET /api/profile/me; caches emergency contact, blood type, allergies for offline SOS |
| 21 | 573-589 | _launchDialer | opens tel: dialer via url_launcher (used for 911) |
| 22 | 590-629 | _startHold | hold-to-fire SOS: 2.5s timer + _holdProgressNotifier; _cancelHold aborts early release |
| 23 | 630-701 | _triggerEmergencySOS | GPS fix via Geolocator; offline path queues SOS + dials 911; POST /api/emergency/sos |
