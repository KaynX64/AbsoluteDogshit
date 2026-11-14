<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 02 of 02 -->
| 24 | 707-747 | _showEmergencyConfirmationDialog | SOS Alert Active confirmation dialog after successful dispatch |
| 25 | 748-778 | _handleSignOut | POST /api/auth/logout with fcm_token; clears jwt/user_data, back to LoginScreen |
| 26 | 779-800 | _formatRelativeDate | helpers: _getInitials for avatars; _formatRelativeDate (Today, 3d ago, 2mo ago) |
| 27 | 801-821 | ConsultationSchedulerScreen | build() head; tab list: overview, scheduler, SOS, DocumentsViewer, profile |
| 28 | 822-875 | SessionTimeoutListener | SessionTimeoutListener + Scaffold + AppBar: LeoVital brand and initials avatar |
| 29 | 876-885 | bottomNavigationBar | body Column: offline banner + active tab; bottomNavigationBar mounts custom nav |
| 30 | 886-914 | _buildOfflineBanner | red offline banner: last-synced notice, SOS still works via call |
| 31 | 915-989 | _buildCustomBottomNav | custom bottom nav row: Overview, Appointments, SOS, Documents, Profile slots |
| 32 | 990-1046 | _buildNavItem | reusable nav item: sage pill when selected, icon + label |
| 33 | 1047-1098 | _buildSosNavItem | center SOS nav pill: crimson active state, siren icon |
| 34 | 1099-1161 | _buildOverviewTab | overview tab head: greeting, RefreshIndicator refetch, active queue card slot |
| 35 | 1162-1314 | QrImageView | campus health pass card: dynamic QR, name, role-aware identity lines, optional Qualified Responder badge |
| 36 | 1315-1431 | Book consultation | pass actions: Refresh pass (_fetchQRPass), Book consultation to tab 1; compact/wide |
| 37 | 1432-1546 | Prescriptions | shortcut cards: Prescriptions and Medical clearances, both jump to documents tab |
| 38 | 1547-1632 | YOUR HEALTH AT A GLANCE | dark at-a-glance card head: initials avatar, name, role line, link to profile |
| 39 | 1633-1723 | Blood type | at-a-glance stats: blood type and known allergy; View full profile to tab 4 |
| 40 | 1724-1782 | Your campus infirmary | campus infirmary card: PSU Lingayen address, Mon-Fri 8AM-5PM hours |
| 41 | 1783-1831 | A gentle reminder | wellness reminder card; closes overview tab build |
| 42 | 1832-1928 | _buildActiveQueueCard | queue ticket card: NOW SERVING or WAITING badge, ticket_no, ahead count, room, wait |
| 43 | 1929-1988 | _buildSOSTab | SOS tab head: Emergency SOS title, offline flag, responsive circle sizes |
| 44 | 1989-2057 | You are currently offline | offline panel: Call 911 + cached emergency contact call and SMS buttons |
| 45 | 2058-2136 | DEMO ONLY | demo SOS card: DEMO ONLY badge, Your campus SOS title, explainer text |
| 46 | 2137-2175 | _sosConsent | consent checkbox: share location + medical details, gates panic button |
| 47 | 2176-2273 | _holdProgressNotifier | hold-to-SOS button: GestureDetector, progress ring, 2.5s countdown text |
| 48 | 2274-2296 | _sosStatusMessage | SOS status message line (dispatched, failed, offline); closes demo card |
| 49 | 2297-2357 | Call 911 | out-of-campus card with Call 911 dialer button; closes SOS tab |
| 50 | 2358-2377 | _buildOfflineCallButton | full-width offline call button; dials via OfflineSosService.dialNumber |
| 51 | 2378-2396 | _buildOfflineSmsButton | outlined SMS button; composeEmergencySms with prefilled emergency body |
| 52 | 2397-2433 | _buildProfileTab | profile tab setup: loading guard, hp/u/identity, BMI parse, immunization decode |
| 53 | 2434-2473 | Your health. Your profile. | profile header texts; RefreshIndicator refetches profile and consent status |
| 54 | 2474-2628 | View health pass | user card: initials avatar, role lines, optional Qualified Responder badge, View health pass back to tab 0 |
| 55 | 2629-2727 | Clinical details | clinical details card head: DOB/age, sex, BMI + category note |
| 56 | 2728-2839 | Known allergy | clinical stats: blood type, known allergy, condition, height, weight |
| 57 | 2840-2888 | Last verified | last-verified-by-staff stamp + clinic-only update notice |
| 58 | 2889-2952 | Immunizations | immunizations list card from healthProfile.immunization_history |
| 59 | 2953-3045 | Contact details | contact card: Edit opens EditProfileScreen, phone, emergency contact |
| 60 | 3046-3162 | Change password | settings ListTiles: ChangePasswordScreen, privacy terms + Revoke, Sign out |
