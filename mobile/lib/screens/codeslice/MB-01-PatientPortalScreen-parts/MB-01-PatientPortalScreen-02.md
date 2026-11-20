<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 02 of 02 -->
| 23 | 881-927 | _showEmergencyConfirmationDialog | SOS Alert Active confirmation dialog after successful dispatch |
| 24 | 928-954 | _handleSignOut | Confirms sign-out, ends the shared alert session, clears JWT and user data, and returns to LoginScreen |
| 25 | 955-982 | _formatRelativeDate | helpers: _getInitials for avatars; _formatRelativeDate (Today, 3d ago, 2mo ago) |
| 26 | 983-996 | ConsultationSchedulerScreen | build() head; tab list: overview, scheduler, SOS, DocumentsViewer, profile |
| 27 | 997-1055 | AccountSettingsButton | SessionTimeoutListener and app header with the Account settings gear |
| 28 | 1056-1069 | bottomNavigationBar | body Column: active incident banner, offline banner and active tab; bottomNavigationBar mounts custom nav |
| 29 | 1070-1109 | _buildOfflineBanner | red offline banner: last-synced notice, SOS still works via call |
| 30 | 1110-1183 | _buildCustomBottomNav | custom bottom nav row: Overview, Appointments, SOS, Documents, Profile slots |
| 31 | 1184-1240 | _buildNavItem | reusable nav item: sage pill when selected, icon + label |
| 32 | 1241-1296 | _buildSosNavItem | center SOS nav pill: crimson active state, siren icon |
| 33 | 1297-1374 | _buildOverviewTab | responder badge helper and overview heading, refresh gesture and active queue card |
| 34 | 1375-1539 | QrImageView | campus health pass card: dynamic QR, name, role-aware identity lines, optional Qualified Responder badge and Responder Hub button |
| 35 | 1540-1678 | Book consultation | pass actions: Refresh pass (_fetchQRPass), Book consultation to tab 1; actions wrap when needed |
| 36 | 1679-1797 | Prescriptions | shortcut cards: Prescriptions and Medical clearances, both jump to documents tab |
| 37 | 1798-1885 | YOUR HEALTH AT A GLANCE | dark card head: white heading, heart and menu icons; initials avatar, name, role line, profile link |
| 38 | 1886-1981 | Blood type | at-a-glance stats: blood type and known allergy; View full profile to tab 4 |
| 39 | 1982-2050 | Your campus infirmary | campus infirmary card: PSU Lingayen address, Mon-Fri 8AM-5PM hours |
| 40 | 2051-2104 | A gentle reminder | wellness reminder card; closes overview tab build |
| 41 | 2105-2227 | _buildActiveQueueCard | queue ticket card: NOW SERVING or WAITING badge, ticket_no, ahead count, room, wait |
| 42 | 2228-2286 | _buildSOSTab | SOS tab head: Emergency SOS title, offline flag, responsive circle sizes |
| 43 | 2287-2366 | You are currently offline | offline panel: Call 911 + cached emergency contact call and SMS buttons |
| 44 | 2367-2433 | demoBadgeBg | SOS card badge, title, and explainer text |
| 45 | 2434-2482 | _sosConsent | consent checkbox: share location + medical details, gates panic button |
| 46 | 2483-2596 | _holdProgressNotifier | hold-to-SOS button: GestureDetector, progress ring, 2.5s countdown text |
| 47 | 2597-2616 | _sosStatusMessage | SOS status message line (dispatched, failed, offline); closes SOS card |
| 48 | 2617-2680 | Call 911 | out-of-campus card with Call 911 dialer button; closes SOS tab |
| 49 | 2681-2700 | _buildOfflineCallButton | full-width offline call button; dials via OfflineSosService.dialNumber |
| 50 | 2701-2729 | _buildOfflineSmsButton | outlined SMS button; composeEmergencySms with prefilled emergency body |
| 51 | 2730-2774 | _buildProfileTab | profile tab setup: loading guard, hp/u/identity, BMI parse, immunization decode |
| 52 | 2775-2803 | Your health. Your profile. | profile header texts; RefreshIndicator refetches profile and consent status |
| 53 | 2804-2964 | View health pass | user card: initials avatar, role lines, optional Qualified Responder badge and Responder Hub button, View health pass back to tab 0 |
| 54 | 2965-3077 | Clinical details | clinical details card head: DOB/age, sex, BMI + category note |
| 55 | 3078-3210 | Known allergy | clinical stats: blood type, known allergy, condition, height, weight |
| 56 | 3211-3263 | Last verified | last-verified-by-staff stamp + clinic-only update notice |
| 57 | 3264-3329 | Immunizations | immunizations list card from healthProfile.immunization_history |
| 58 | 3330-3424 | Contact details | contact card: Edit opens EditProfileScreen, phone, emergency contact |
| 59 | 3425-3545 | Change password | settings ListTiles: ChangePasswordScreen, privacy terms + Revoke, Sign out |