<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 02 of 02 -->
| 24 | 708-748 | _showEmergencyConfirmationDialog | SOS Alert Active confirmation dialog after successful dispatch |
| 25 | 749-792 | _handleSignOut | Confirm manual sign-out, then POST /api/auth/logout with fcm_token; clears jwt/user_data, back to LoginScreen |
| 26 | 793-814 | _formatRelativeDate | helpers: _getInitials for avatars; _formatRelativeDate (Today, 3d ago, 2mo ago) |
| 27 | 815-835 | ConsultationSchedulerScreen | build() head; tab list: overview, scheduler, SOS, DocumentsViewer, profile |
| 28 | 836-894 | AccountSettingsButton | SessionTimeoutListener and app header with the Account settings gear |
| 29 | 895-904 | bottomNavigationBar | body Column: offline banner + active tab; bottomNavigationBar mounts custom nav |
| 30 | 905-933 | _buildOfflineBanner | red offline banner: last-synced notice, SOS still works via call |
| 31 | 934-1008 | _buildCustomBottomNav | custom bottom nav row: Overview, Appointments, SOS, Documents, Profile slots |
| 32 | 1009-1065 | _buildNavItem | reusable nav item: sage pill when selected, icon + label |
| 33 | 1066-1117 | _buildSosNavItem | center SOS nav pill: crimson active state, siren icon |
| 34 | 1118-1180 | _buildOverviewTab | overview tab head: greeting, RefreshIndicator refetch, active queue card slot |
| 35 | 1181-1333 | QrImageView | campus health pass card: dynamic QR, name, role-aware identity lines, optional Qualified Responder badge |
| 36 | 1334-1455 | Book consultation | pass actions: Refresh pass (_fetchQRPass), Book consultation to tab 1; actions wrap when needed |
| 37 | 1456-1570 | Prescriptions | shortcut cards: Prescriptions and Medical clearances, both jump to documents tab |
| 38 | 1571-1656 | YOUR HEALTH AT A GLANCE | dark card head: white heading, heart and menu icons; initials avatar, name, role line, profile link |
| 39 | 1657-1747 | Blood type | at-a-glance stats: blood type and known allergy; View full profile to tab 4 |
| 40 | 1748-1806 | Your campus infirmary | campus infirmary card: PSU Lingayen address, Mon-Fri 8AM-5PM hours |
| 41 | 1807-1855 | A gentle reminder | wellness reminder card; closes overview tab build |
| 42 | 1856-1952 | _buildActiveQueueCard | queue ticket card: NOW SERVING or WAITING badge, ticket_no, ahead count, room, wait |
| 43 | 1953-2012 | _buildSOSTab | SOS tab head: Emergency SOS title, offline flag, responsive circle sizes |
| 44 | 2013-2081 | You are currently offline | offline panel: Call 911 + cached emergency contact call and SMS buttons |
| 45 | 2082-2160 | demoBadgeBg | SOS card badge, title, and explainer text |
| 46 | 2161-2199 | _sosConsent | consent checkbox: share location + medical details, gates panic button |
| 47 | 2200-2297 | _holdProgressNotifier | hold-to-SOS button: GestureDetector, progress ring, 2.5s countdown text |
| 48 | 2298-2320 | _sosStatusMessage | SOS status message line (dispatched, failed, offline); closes demo card |
| 49 | 2321-2381 | Call 911 | out-of-campus card with Call 911 dialer button; closes SOS tab |
| 50 | 2382-2401 | _buildOfflineCallButton | full-width offline call button; dials via OfflineSosService.dialNumber |
| 51 | 2402-2420 | _buildOfflineSmsButton | outlined SMS button; composeEmergencySms with prefilled emergency body |
| 52 | 2421-2457 | _buildProfileTab | profile tab setup: loading guard, hp/u/identity, BMI parse, immunization decode |
| 53 | 2458-2497 | Your health. Your profile. | profile header texts; RefreshIndicator refetches profile and consent status |
| 54 | 2498-2652 | View health pass | user card: initials avatar, role lines, optional Qualified Responder badge, View health pass back to tab 0 |
| 55 | 2653-2751 | Clinical details | clinical details card head: DOB/age, sex, BMI + category note |
| 56 | 2752-2863 | Known allergy | clinical stats: blood type, known allergy, condition, height, weight |
| 57 | 2864-2912 | Last verified | last-verified-by-staff stamp + clinic-only update notice |
| 58 | 2913-2976 | Immunizations | immunizations list card from healthProfile.immunization_history |
| 59 | 2977-3069 | Contact details | contact card: Edit opens EditProfileScreen, phone, emergency contact |
| 60 | 3070-3186 | Change password | settings ListTiles: ChangePasswordScreen, privacy terms + Revoke, Sign out |
