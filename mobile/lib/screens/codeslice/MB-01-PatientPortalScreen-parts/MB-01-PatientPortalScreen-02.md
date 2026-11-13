<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 02 of 02 -->
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
