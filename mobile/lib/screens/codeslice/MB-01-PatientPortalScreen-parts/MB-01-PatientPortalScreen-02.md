<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 02 of 02 -->
| 23 | 699-739 | _showEmergencyConfirmationDialog | SOS Alert Active confirmation dialog after successful dispatch |
| 24 | 740-766 | _handleSignOut | Confirms sign-out, ends the shared alert session, clears JWT and user data, and returns to LoginScreen |
| 25 | 767-792 | _formatRelativeDate | helpers: _getInitials for avatars; _formatRelativeDate (Today, 3d ago, 2mo ago) |
| 26 | 793-806 | ConsultationSchedulerScreen | build() head; tab list: overview, scheduler, SOS, DocumentsViewer, profile |
| 27 | 807-865 | AccountSettingsButton | SessionTimeoutListener and app header with the Account settings gear |
| 28 | 866-877 | bottomNavigationBar | body Column: active incident banner, offline banner and active tab; bottomNavigationBar mounts custom nav |
| 29 | 878-910 | _buildOfflineBanner | red offline banner: last-synced notice, SOS still works via call |
| 30 | 911-981 | _buildCustomBottomNav | custom bottom nav row: Overview, Appointments, SOS, Documents, Profile slots |
| 31 | 982-1038 | _buildNavItem | reusable nav item: sage pill when selected, icon + label |
| 32 | 1039-1094 | _buildSosNavItem | center SOS nav pill: crimson active state, siren icon |
| 33 | 1095-1163 | _buildOverviewTab | responder badge helper and overview heading, refresh gesture and active queue card |
| 34 | 1164-1318 | QrImageView | campus health pass card: dynamic QR, name, role-aware identity lines, optional Qualified Responder badge and Responder Hub button |
| 35 | 1319-1440 | Book consultation | pass actions: Refresh pass (_fetchQRPass), Book consultation to tab 1; actions wrap when needed |
| 36 | 1441-1555 | Prescriptions | shortcut cards: Prescriptions and Medical clearances, both jump to documents tab |
| 37 | 1556-1636 | YOUR HEALTH AT A GLANCE | dark card head: white heading, heart and menu icons; initials avatar, name, role line, profile link |
| 38 | 1637-1732 | Blood type | at-a-glance stats: blood type and known allergy; View full profile to tab 4 |
| 39 | 1733-1791 | Your campus infirmary | campus infirmary card: PSU Lingayen address, Mon-Fri 8AM-5PM hours |
| 40 | 1792-1839 | A gentle reminder | wellness reminder card; closes overview tab build |
| 41 | 1840-1940 | _buildActiveQueueCard | queue ticket card: NOW SERVING or WAITING badge, ticket_no, ahead count, room, wait |
| 42 | 1941-1998 | _buildSOSTab | SOS tab head: Emergency SOS title, offline flag, responsive circle sizes |
| 43 | 1999-2069 | You are currently offline | offline panel: Call 911 + cached emergency contact call and SMS buttons |
| 44 | 2070-2136 | demoBadgeBg | SOS card badge, title, and explainer text |
| 45 | 2137-2184 | _sosConsent | consent checkbox: share location + medical details, gates panic button |
| 46 | 2185-2289 | _holdProgressNotifier | hold-to-SOS button: GestureDetector, progress ring, 2.5s countdown text |
| 47 | 2290-2311 | _sosStatusMessage | SOS status message line (dispatched, failed, offline); closes SOS card |
| 48 | 2312-2372 | Call 911 | out-of-campus card with Call 911 dialer button; closes SOS tab |
| 49 | 2373-2392 | _buildOfflineCallButton | full-width offline call button; dials via OfflineSosService.dialNumber |
| 50 | 2393-2415 | _buildOfflineSmsButton | outlined SMS button; composeEmergencySms with prefilled emergency body |
| 51 | 2416-2459 | _buildProfileTab | profile tab setup: loading guard, hp/u/identity, BMI parse, immunization decode |
| 52 | 2460-2488 | Your health. Your profile. | profile header texts; RefreshIndicator refetches profile and consent status |
| 53 | 2489-2644 | View health pass | user card: initials avatar, role lines, optional Qualified Responder badge and Responder Hub button, View health pass back to tab 0 |
| 54 | 2645-2743 | Clinical details | clinical details card head: DOB/age, sex, BMI + category note |
| 55 | 2744-2855 | Known allergy | clinical stats: blood type, known allergy, condition, height, weight |
| 56 | 2856-2905 | Last verified | last-verified-by-staff stamp + clinic-only update notice |
| 57 | 2906-2968 | Immunizations | immunizations list card from healthProfile.immunization_history |
| 58 | 2969-3061 | Contact details | contact card: Edit opens EditProfileScreen, phone, emergency contact |
| 59 | 3062-3177 | Change password | settings ListTiles: ChangePasswordScreen, privacy terms + Revoke, Sign out |
