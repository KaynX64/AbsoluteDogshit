<!-- split from mobile/lib/screens/codeslice/MB-01-PatientPortalScreen.md — part 02 of 02 -->
| 23 | 890-916 | _handleSignOut | Confirms sign-out, ends the shared alert session, clears JWT and user data, and returns to LoginScreen |
| 24 | 917-944 | _formatRelativeDate | helpers: _getInitials for avatars; _formatRelativeDate (Today, 3d ago, 2mo ago) |
| 25 | 945-958 | ConsultationSchedulerScreen | build() head; tab list: overview, scheduler, SOS, DocumentsViewer, profile |
| 26 | 959-1017 | AccountSettingsButton | SessionTimeoutListener and app header with the Account settings gear |
| 27 | 1018-1031 | bottomNavigationBar | body Column: active incident banner, offline banner and active tab; bottomNavigationBar mounts custom nav |
| 28 | 1032-1071 | _buildOfflineBanner | red offline banner: last-synced notice, SOS still works via call |
| 29 | 1072-1145 | _buildCustomBottomNav | custom bottom nav row: Overview, Appointments, SOS, Documents, Profile slots |
| 30 | 1146-1202 | _buildNavItem | reusable nav item: sage pill when selected, icon + label |
| 31 | 1203-1258 | _buildSosNavItem | center SOS nav pill: crimson active state, siren icon |
| 32 | 1259-1336 | _buildOverviewTab | responder badge helper and overview heading, refresh gesture and active queue card |
| 33 | 1337-1506 | QrImageView | campus health pass card: dynamic QR, name, role-aware identity lines, optional Qualified Responder badge and Responder Hub button |
| 34 | 1507-1645 | Book consultation | pass actions: Refresh pass (_fetchQRPass), Book consultation to tab 1; actions wrap when needed |
| 35 | 1646-1764 | Prescriptions | shortcut cards: Prescriptions and Medical clearances, both jump to documents tab |
| 36 | 1765-1852 | YOUR HEALTH AT A GLANCE | dark card head: white heading, heart and menu icons; initials avatar, name, role line, profile link |
| 37 | 1853-1948 | Blood type | at-a-glance stats: blood type and known allergy; View full profile to tab 4 |
| 38 | 1949-2017 | Your campus infirmary | campus infirmary card: PSU Lingayen address, Mon-Fri 8AM-5PM hours |
| 39 | 2018-2071 | A gentle reminder | wellness reminder card; closes overview tab build |
| 40 | 2072-2194 | _buildActiveQueueCard | queue ticket card: NOW SERVING or WAITING badge, ticket_no, ahead count, room, wait |
| 41 | 2195-2254 | _buildSOSTab | SOS tab head: Emergency SOS title, offline flag, responsive circle sizes |
| 42 | 2255-2321 | demoBadgeBg | First card: campus SOS badge, title, and explainer text |
| 43 | 2322-2370 | _sosConsent | consent checkbox: share location + medical details, gates panic button |
| 44 | 2371-2484 | _holdProgressNotifier | hold-to-SOS button: GestureDetector, progress ring, 2.5s countdown text |
| 45 | 2485-2507 | _sosStatusMessage | Show queued, accepted or rejected status and close the campus SOS card |
| 46 | 2508-2594 | You are currently offline | Below campus SOS: Call 911 and account-scoped emergency contact actions regardless of API reachability; close the tab |
| 47 | 2595-2614 | _buildOfflineCallButton | full-width offline call button; dials via OfflineSosService.dialNumber |
| 48 | 2615-2643 | _buildOfflineSmsButton | outlined SMS button; composeEmergencySms with prefilled emergency body |
| 49 | 2644-2688 | _buildProfileTab | profile tab setup: loading guard, hp/u/identity, BMI parse, immunization decode |
| 50 | 2689-2717 | Your health. Your profile. | profile header texts; RefreshIndicator refetches profile and consent status |
| 51 | 2718-2878 | View health pass | user card: initials avatar, role lines, optional Qualified Responder badge and Responder Hub button, View health pass back to tab 0 |
| 52 | 2879-2991 | Clinical details | clinical details card head: DOB/age, sex, BMI + category note |
| 53 | 2992-3124 | Known allergy | clinical stats: blood type, known allergy, condition, height, weight |
| 54 | 3125-3177 | Last verified | last-verified-by-staff stamp + clinic-only update notice |
| 55 | 3178-3243 | Immunizations | immunizations list card from healthProfile.immunization_history |
| 56 | 3244-3338 | Contact details | contact card: Edit opens EditProfileScreen, phone, emergency contact |
| 57 | 3339-3461 | Change password | settings ListTiles: ChangePasswordScreen, privacy terms + Revoke, Sign out |
