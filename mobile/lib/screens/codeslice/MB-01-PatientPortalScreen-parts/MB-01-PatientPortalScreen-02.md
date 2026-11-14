<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 02 of 02 -->
| 24 | 702-742 | _showEmergencyConfirmationDialog | SOS Alert Active confirmation dialog after successful dispatch |
| 25 | 743-772 | _handleSignOut | POST /api/auth/logout with fcm_token; clears jwt/user_data, back to LoginScreen |
| 26 | 773-794 | _formatRelativeDate | helpers: _getInitials for avatars; _formatRelativeDate (Today, 3d ago, 2mo ago) |
| 27 | 795-815 | ConsultationSchedulerScreen | build() head; tab list: overview, scheduler, SOS, DocumentsViewer, profile |
| 28 | 816-885 | SessionTimeoutListener | SessionTimeoutListener + Scaffold + AppBar: LeoVital brand and initials avatar |
| 29 | 886-895 | bottomNavigationBar | body Column: offline banner + active tab; bottomNavigationBar mounts custom nav |
| 30 | 896-924 | _buildOfflineBanner | red offline banner: last-synced notice, SOS still works via call |
| 31 | 925-999 | _buildCustomBottomNav | custom bottom nav row: Overview, Appointments, SOS, Documents, Profile slots |
| 32 | 1000-1056 | _buildNavItem | reusable nav item: sage pill when selected, icon + label |
| 33 | 1057-1108 | _buildSosNavItem | center SOS nav pill: crimson active state, siren icon |
| 34 | 1109-1171 | _buildOverviewTab | overview tab head: greeting, RefreshIndicator refetch, active queue card slot |
| 35 | 1172-1323 | QrImageView | campus health pass card: dynamic QR, name, role-aware identity lines, optional Qualified Responder badge |
| 36 | 1324-1440 | Book consultation | pass actions: Refresh pass (_fetchQRPass), Book consultation to tab 1; compact/wide |
| 37 | 1441-1555 | Prescriptions | shortcut cards: Prescriptions and Medical clearances, both jump to documents tab |
| 38 | 1556-1641 | YOUR HEALTH AT A GLANCE | dark at-a-glance card head: initials avatar, name, role line, link to profile |
| 39 | 1642-1732 | Blood type | at-a-glance stats: blood type and known allergy; View full profile to tab 4 |
| 40 | 1733-1791 | Your campus infirmary | campus infirmary card: PSU Lingayen address, Mon-Fri 8AM-5PM hours |
| 41 | 1792-1840 | A gentle reminder | wellness reminder card; closes overview tab build |
| 42 | 1841-1937 | _buildActiveQueueCard | queue ticket card: NOW SERVING or WAITING badge, ticket_no, ahead count, room, wait |
| 43 | 1938-1997 | _buildSOSTab | SOS tab head: Emergency SOS title, offline flag, responsive circle sizes |
| 44 | 1998-2066 | You are currently offline | offline panel: Call 911 + cached emergency contact call and SMS buttons |
| 45 | 2067-2145 | DEMO ONLY | demo SOS card: DEMO ONLY badge, Your campus SOS title, explainer text |
| 46 | 2146-2184 | _sosConsent | consent checkbox: share location + medical details, gates panic button |
| 47 | 2185-2282 | _holdProgressNotifier | hold-to-SOS button: GestureDetector, progress ring, 2.5s countdown text |
| 48 | 2283-2305 | _sosStatusMessage | SOS status message line (dispatched, failed, offline); closes demo card |
| 49 | 2306-2366 | Call 911 | out-of-campus card with Call 911 dialer button; closes SOS tab |
| 50 | 2367-2386 | _buildOfflineCallButton | full-width offline call button; dials via OfflineSosService.dialNumber |
| 51 | 2387-2405 | _buildOfflineSmsButton | outlined SMS button; composeEmergencySms with prefilled emergency body |
| 52 | 2406-2442 | _buildProfileTab | profile tab setup: loading guard, hp/u/identity, BMI parse, immunization decode |
| 53 | 2443-2482 | Your health. Your profile. | profile header texts; RefreshIndicator refetches profile and consent status |
| 54 | 2483-2637 | View health pass | user card: initials avatar, role lines, optional Qualified Responder badge, View health pass back to tab 0 |
| 55 | 2638-2736 | Clinical details | clinical details card head: DOB/age, sex, BMI + category note |
| 56 | 2737-2848 | Known allergy | clinical stats: blood type, known allergy, condition, height, weight |
| 57 | 2849-2897 | Last verified | last-verified-by-staff stamp + clinic-only update notice |
| 58 | 2898-2961 | Immunizations | immunizations list card from healthProfile.immunization_history |
| 59 | 2962-3054 | Contact details | contact card: Edit opens EditProfileScreen, phone, emergency contact |
| 60 | 3055-3170 | Change password | settings ListTiles: ChangePasswordScreen, privacy terms + Revoke, Sign out |
