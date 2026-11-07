# DT-09 · App.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-09 · desktop/src/App.tsx
**LOC:** 898 · **Anchor commit:** 93b4172 · **Role:** App shell: login/session bootstrap, role-based console routing, offline replay badge, update banner, change-password modal
**Mounted by:** entry (main.tsx)
**API surface:** POST /api/auth/login (L560), POST /api/auth/logout (L508), PUT /api/auth/change-password (L633)
**Socket events:** none directly (child consoles own their sockets)
**State / key fields:** session: user, email, password, error, activeRoleView (multi-role View-as) · workspace: adminTab, doctorViewMode, nurseViewMode · connectivity: isOnline, offlineQueueCount, isReplaying · updater: updateStatus, updateDismissed · pw modal: showPasswordModal, current/new/confirmPassword, passwordMsg
**Mounts (by activeRoleView):** NURSE→NurseConsole · DOCTOR/DENTIST→DoctorConsole(currentRole) · ADMIN→AdminConsole(activeTab) · EMERGENCY_RESPONDER→ResponderConsole · always: IncidentReportModal · shell: Sidebar, TopBar, LoginScreen

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-20 | valetudo_logo | imports: 4 consoles, useBookingBadge, offlineSync svc, API_BASE_URL, theme, IncidentReportModal |
| 2 | 22-114 | const I = { | inline SVG icon set I (Users, Shield, Chart, Database, Stethoscope, Calendar, Pill, Alert, Key, Logout...) |
| 3 | 116-140 | useSessionTimeout | 8h inactivity auto-logout hook (R.A. 10173); activity events reset; clears valetudo_token, reloads |
| 4 | 142-250 | navByRole | Sidebar rail: role→nav map (ADMIN 6, NURSE 3, DOCTOR/DENTIST 5, RESPONDER 1), badges, sign-out, pw link |
| 5 | 252-336 | tb-role-select | TopBar: greeting, View-as role select, Connected/Offline pill, queued-replay button, user chip |
| 6 | 338-468 | LoginScreen | login split screen: sage hero panel, email+password form, error line, dev quick-login chips |
| 7 | 470-501 | export default function App() | App state: user, activeRoleView, adminTab/doctorViewMode/nurseViewMode, isOnline, offlineQueue, pw modal |
| 8 | 503-522 | handleSignOut | POST /api/auth/logout; purge valetudo_token, credentials and user state |
| 9 | 524-533 | isResponder | responder-only accounts skip session timeout; useBookingBadge → sidebar badge key (expected/scheduled) |
| 10 | 535-553 | offline-queue-changed | online/offline + offline-queue-changed listeners; refreshOfflineQueueFromBackend() syncs badge on mount |
| 11 | 555-593 | handleLogin | POST /api/auth/login; staff-role gate; store valetudo_token; default role view; bootstrapOfflineCache bg |
| 12 | 595-605 | handleManualReplay | manual replayOfflineQueue() with synced-count alert (TopBar queued button) |
| 13 | 607-662 | handleChangePassword | pw policy via evaluatePassword + match check; PUT /api/auth/change-password; surfaces server issues[] |
| 14 | 664-681 | onUpdateStatus | subscribe electronAPI.onUpdateStatus; unauthenticated gate renders LoginScreen |
| 15 | 683-718 | app-shell | shell render: Sidebar (activeItem/onItemClick wired per role view) + TopBar |
| 16 | 720-757 | update-banner | update banner: download %, Later dismiss, Restart now → installUpdate (confirms queued offline edits) |
| 17 | 759-786 | app-content | mounts NurseConsole/DoctorConsole/AdminConsole/ResponderConsole by role + IncidentReportModal popup |
| 18 | 788-898 | modal-backdrop | change-password modal: 3 fields, PasswordStrengthIndicator, submit gated on evaluatePassword, feedback |
