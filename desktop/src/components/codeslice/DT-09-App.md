# DT-09 · App.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-09 · desktop/src/App.tsx
**LOC:** 1098 · **Anchor commit:** working tree · **Role:** App shell: login/session bootstrap, account themes, role-based console routing, offline replay badge, update banner, change-password modal
**Mounted by:** entry (main.tsx)
**API surface:** POST /api/auth/login (L731), POST /api/auth/logout (L684), PUT /api/auth/change-password (L797)
**Socket events:** none directly (child consoles own their sockets)
**State / key fields:** session: user, email, password, error, activeRoleView (multi-role View-as) · workspace: adminTab, doctorViewMode, nurseViewMode · connectivity: isOnline, offlineQueueCount, isReplaying · updater: updateStatus, updateDismissed · pw modal: showPasswordModal, current/new/confirmPassword, passwordMsg
**Mounts (by activeRoleView):** NURSE→NurseConsole · DOCTOR/DENTIST→DoctorConsole(currentRole) · ADMIN→AdminConsole(activeTab) · EMERGENCY_RESPONDER→ResponderConsole · always: IncidentReportModal · shell: Sidebar, TopBar, LoginScreen

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-22 | import ThemedLogo | imports: role consoles, hooks, offline-sync service, API config, theme, IncidentReportModal, settings, themed logo |
| 2 | 23-118 | const I = { | inline SVG icon set I (Users, Shield, Chart, Database, Stethoscope, Calendar, Pill, Alert, Key, Logout...) |
| 3 | 119-152 | useSessionTimeout | 8h inactivity auto-logout hook (R.A. 10173); activity events reset; clears valetudo_token, reloads |
| 4 | 154-255 | navByRole | Sidebar rail: role→nav map including Admin's Archived accounts view, badges, sign-out, password link |
| 5 | 256-341 | tb-role-select | TopBar: greeting, View-as role select, Connected/Offline pill, queued-replay button, user chip |
| 6 | 342-649 | LoginScreen | login split screen; login card has a faint green pointer-following glow, limited to the card; includes email/password form and dev quick-login chips |
| 7 | 650-680 | function AppShell() | App state: user, activeRoleView, workspace views, connectivity, updater, password modal |
| 8 | 681-700 | handleSignOut | POST /api/auth/logout; restore default unauthenticated theme and purge valetudo_token, credentials and user state |
| 9 | 701-711 | isResponder | responder-only accounts skip session timeout; useBookingBadge → sidebar badge key |
| 10 | 712-731 | offline-queue-changed | online/offline and offline-queue listeners; refreshOfflineQueueFromBackend() syncs badge on mount |
| 11 | 732-771 | handleLogin | POST /api/auth/login; staff-role gate; store valetudo_token; apply account theme after authentication; default role view; bootstrapOfflineCache bg |
| 12 | 772-783 | handleManualReplay | manual replayOfflineQueue() with synced-count alert (TopBar queued button) |
| 13 | 784-840 | handleChangePassword | password policy and match checks; PUT /api/auth/change-password; surfaces server issues[] |
| 14 | 841-859 | onUpdateStatus | subscribe electronAPI.onUpdateStatus; unauthenticated gate renders LoginScreen |
| 15 | 860-896 | app-shell | shell render: Sidebar (activeItem/onItemClick wired per role view) + TopBar |
| 16 | 897-935 | update-banner | update banner: download %, Later dismiss, Restart now → installUpdate |
| 17 | 936-964 | app-content | mounts NurseConsole/DoctorConsole/AdminConsole/ResponderConsole by role + IncidentReportModal popup |
| 18 | 965-1076 | modal-backdrop | change-password modal: 3 fields, PasswordStrengthIndicator, submit gated on evaluatePassword, feedback |
| 19 | 1081-1097 | export default function App() | mounts ThemeProvider around AppShell |
