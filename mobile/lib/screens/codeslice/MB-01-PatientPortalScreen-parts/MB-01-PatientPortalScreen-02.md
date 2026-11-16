<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 02 of 02 -->
| 24 | 698-738 | _showEmergencyConfirmationDialog | SOS Alert Active confirmation dialog after successful dispatch |
| 25 | 739-765 | _handleSignOut | Confirm manual sign-out, then POST /api/auth/logout with fcm_token; clears jwt/user_data, back to LoginScreen |
| 26 | 766-787 | _formatRelativeDate | helpers: _getInitials for avatars; _formatRelativeDate (Today, 3d ago, 2mo ago) |
| 27 | 788-806 | ConsultationSchedulerScreen | build() head; tab list: overview, scheduler, SOS, DocumentsViewer, profile |
| 28 | 807-865 | AccountSettingsButton | SessionTimeoutListener and app header with the Account settings gear |
| 29 | 866-876 | bottomNavigationBar | body Column: offline banner + active tab; bottomNavigationBar mounts custom nav |
| 30 | 877-905 | _buildOfflineBanner | red offline banner: last-synced notice, SOS still works via call |
| 31 | 906-980 | _buildCustomBottomNav | custom bottom nav row: Overview, Appointments, SOS, Documents, Profile slots |
| 32 | 981-1037 | _buildNavItem | reusable nav item: sage pill when selected, icon + label |
| 33 | 1038-1089 | _buildSosNavItem | center SOS nav pill: crimson active state, siren icon |
| 34 | 1090-1162 | _buildOverviewTab | overview tab head: greeting, RefreshIndicator refetch, active queue card slot |
| 35 | 1163-1315 | QrImageView | campus health pass card: dynamic QR, name, role-aware identity lines, optional Qualified Responder badge and Responder Hub button |
| 36 | 1317-1438 | Book consultation | pass actions: Refresh pass (_fetchQRPass), Book consultation to tab 1; actions wrap when needed |
| 37 | 1439-1553 | Prescriptions | shortcut cards: Prescriptions and Medical clearances, both jump to documents tab |
| 38 | 1554-1639 | YOUR HEALTH AT A GLANCE | dark at-a-glance card head: initials avatar, name, role line, link to profile |
| 39 | 1640-1730 | Blood type | at-a-glance stats: blood type and known allergy; View full profile to tab 4 |
| 40 | 1731-1789 | Your campus infirmary | campus infirmary card: PSU Lingayen address, Mon-Fri 8AM-5PM hours |
| 41 | 1790-1838 | A gentle reminder | wellness reminder card; closes overview tab build |
| 42 | 1839-1935 | _buildActiveQueueCard | queue ticket card: NOW SERVING or WAITING badge, ticket_no, ahead count, room, wait |
| 43 | 1936-1995 | _buildSOSTab | SOS tab head: Emergency SOS title, offline flag, responsive circle sizes |
| 44 | 1996-2064 | You are currently offline | offline panel: Call 911 + cached emergency contact call and SMS buttons |
| 45 | 2065-2143 | demoBadgeBg | SOS card badge, title, and explainer text |
| 46 | 2144-2182 | _sosConsent | consent checkbox: share location + medical details, gates panic button |
| 47 | 2183-2287 | _holdProgressNotifier | hold-to-SOS button: GestureDetector, progress ring, 2.5s countdown text |
| 48 | 2288-2310 | _sosStatusMessage | SOS status message line (dispatched, failed, offline); closes demo card |
| 49 | 2311-2371 | Call 911 | out-of-campus card with Call 911 dialer button; closes SOS tab |
| 50 | 2372-2391 | _buildOfflineCallButton | full-width offline call button; dials via OfflineSosService.dialNumber |
| 51 | 2392-2410 | _buildOfflineSmsButton | outlined SMS button; composeEmergencySms with prefilled emergency body |
| 52 | 2411-2447 | _buildProfileTab | profile tab setup: loading guard, hp/u/identity, BMI parse, immunization decode |
| 53 | 2448-2487 | Your health. Your profile. | profile header texts; RefreshIndicator refetches profile and consent status |
| 54 | 2488-2643 | View health pass | user card: initials avatar, role lines, optional Qualified Responder badge and Responder Hub button, View health pass back to tab 0 |
| 55 | 2644-2742 | Clinical details | clinical details card head: DOB/age, sex, BMI + category note |
| 56 | 2743-2854 | Known allergy | clinical stats: blood type, known allergy, condition, height, weight |
| 57 | 2855-2903 | Last verified | last-verified-by-staff stamp + clinic-only update notice |
| 58 | 2904-2967 | Immunizations | immunizations list card from healthProfile.immunization_history |
| 59 | 2968-3060 | Contact details | contact card: Edit opens EditProfileScreen, phone, emergency contact |
| 60 | 3061-3177 | Change password | settings ListTiles: ChangePasswordScreen, privacy terms + Revoke, Sign out |
