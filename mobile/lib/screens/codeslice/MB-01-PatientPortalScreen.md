# MB-01 · patient_portal_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

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
| 24 | 702-742 | _showEmergencyConfirmationDialog | SOS Alert Active confirmation dialog after successful dispatch |
| 25 | 743-772 | _handleSignOut | POST /api/auth/logout with fcm_token; clears jwt/user_data, back to LoginScreen |
| 26 | 773-794 | _formatRelativeDate | helpers: _getInitials for avatars; _formatRelativeDate (Today, 3d ago, 2mo ago) |
| 27 | 795-815 | ConsultationSchedulerScreen | build() head; tab list: overview, scheduler, SOS, DocumentsViewer, profile |
| 28 | 816-917 | Qualified Responder | SessionTimeoutListener + Scaffold + AppBar: logo, responder badge, initials avatar |
| 29 | 918-927 | bottomNavigationBar | body Column: offline banner + active tab; bottomNavigationBar mounts custom nav |
| 30 | 928-956 | _buildOfflineBanner | red offline banner: last-synced notice, SOS still works via call |
| 31 | 957-1031 | _buildCustomBottomNav | custom bottom nav row: Overview, Appointments, SOS, Documents, Profile slots |
| 32 | 1032-1088 | _buildNavItem | reusable nav item: sage pill when selected, icon + label |
| 33 | 1089-1140 | _buildSosNavItem | center SOS nav pill: crimson active state, siren icon |
| 34 | 1141-1203 | _buildOverviewTab | overview tab head: greeting, RefreshIndicator refetch, active queue card slot |
| 35 | 1204-1316 | QrImageView | campus health pass card: dynamic QR, name, role-aware identity lines |
| 36 | 1317-1433 | Book consultation | pass actions: Refresh pass (_fetchQRPass), Book consultation to tab 1; compact/wide |
| 37 | 1434-1548 | Prescriptions | shortcut cards: Prescriptions and Medical clearances, both jump to documents tab |
| 38 | 1549-1634 | YOUR HEALTH AT A GLANCE | dark at-a-glance card head: initials avatar, name, role line, link to profile |
| 39 | 1635-1725 | Blood type | at-a-glance stats: blood type and known allergy; View full profile to tab 4 |
| 40 | 1726-1784 | Your campus infirmary | campus infirmary card: PSU Lingayen address, Mon-Fri 8AM-5PM hours |
| 41 | 1785-1833 | A gentle reminder | wellness reminder card; closes overview tab build |
| 42 | 1834-1930 | _buildActiveQueueCard | queue ticket card: NOW SERVING or WAITING badge, ticket_no, ahead count, room, wait |
| 43 | 1931-1990 | _buildSOSTab | SOS tab head: Emergency SOS title, offline flag, responsive circle sizes |
| 44 | 1991-2059 | You are currently offline | offline panel: Call 911 + cached emergency contact call and SMS buttons |
| 45 | 2060-2138 | DEMO ONLY | demo SOS card: DEMO ONLY badge, Your campus SOS title, explainer text |
| 46 | 2139-2177 | _sosConsent | consent checkbox: share location + medical details, gates panic button |
| 47 | 2178-2275 | _holdProgressNotifier | hold-to-SOS button: GestureDetector, progress ring, 2.5s countdown text |
| 48 | 2276-2298 | _sosStatusMessage | SOS status message line (dispatched, failed, offline); closes demo card |
| 49 | 2299-2359 | Call 911 | out-of-campus card with Call 911 dialer button; closes SOS tab |
| 50 | 2360-2379 | _buildOfflineCallButton | full-width offline call button; dials via OfflineSosService.dialNumber |
| 51 | 2380-2398 | _buildOfflineSmsButton | outlined SMS button; composeEmergencySms with prefilled emergency body |
| 52 | 2399-2435 | _buildProfileTab | profile tab setup: loading guard, hp/u/identity, BMI parse, immunization decode |
| 53 | 2436-2475 | Your health. Your profile. | profile header texts; RefreshIndicator refetches profile and consent status |
| 54 | 2476-2569 | View health pass | user card: initials avatar, role lines, View health pass back to tab 0 |
| 55 | 2570-2668 | Clinical details | clinical details card head: DOB/age, sex, BMI + category note |
| 56 | 2669-2780 | Known allergy | clinical stats: blood type, known allergy, condition, height, weight |
| 57 | 2781-2829 | Last verified | last-verified-by-staff stamp + clinic-only update notice |
| 58 | 2830-2893 | Immunizations | immunizations list card from healthProfile.immunization_history |
| 59 | 2894-2986 | Contact details | contact card: Edit opens EditProfileScreen, phone, emergency contact |
| 60 | 2987-3102 | Change password | settings ListTiles: ChangePasswordScreen, privacy terms + Revoke, Sign out |
