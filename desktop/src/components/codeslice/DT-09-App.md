# DT-09 · App.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-09 · desktop/src/App.tsx
**LOC:** 1099 · **Anchor base:** 2727901 + current changes · **Role:** App shell: login/session bootstrap, account themes, role-based console routing, offline replay badge, update banner, change-password modal
**Mounted by:** entry (main.tsx)
**API surface:** POST /api/auth/login (L743), POST /api/auth/logout (L690), PUT /api/auth/change-password (L820)
**Socket events:** none directly (child consoles own their sockets)
**State / key fields:** session: user, email, password, error, activeRoleView (multi-role View-as) · workspace: adminTab, doctorViewMode, nurseViewMode · connectivity: isOnline, offlineQueueCount, isReplaying · updater: updateStatus, updateDismissed · pw modal: showPasswordModal, current/new/confirmPassword, passwordMsg
**Mounts (by activeRoleView):** NURSE→NurseConsole · DOCTOR/DENTIST→DoctorConsole(currentRole) · ADMIN→AdminConsole(activeTab) · EMERGENCY_RESPONDER→ResponderConsole · always: IncidentReportModal · shell: Sidebar, TopBar, LoginScreen

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-23 | import ThemedLogo | imports: role consoles, hooks, offline-sync service, API config, theme, IncidentReportModal, settings, themed logo |
| 2 | 24-119 | const I = { | inline SVG icon set I (Users, Shield, Chart, Database, Stethoscope, Calendar, Pill, Alert, Key, Logout...) |
| 3 | 120-153 | useSessionTimeout | 8h inactivity auto-logout hook (R.A. 10173); activity events reset; clears valetudo_token, reloads |
| 4 | 155-256 | navByRole | Role navigation and sign-out. Users & roles stays selected while the internal Archived accounts tab is open. |
| 5 | 257-342 | tb-role-select | TopBar: greeting, View-as role select, Connected/Offline pill, queued-replay button, user chip |
| 6 | 343-650 | LoginScreen | login split screen; login card has a faint green pointer-following glow, limited to the card; includes email/password form and dev quick-login chips |
| 7 | 651-681 | function AppShell() | App state: user, activeRoleView, workspace views, connectivity, updater, password modal |
| 8 | 682-701 | handleSignOut | POST /api/auth/logout; restore default unauthenticated theme and purge valetudo_token, credentials and user state |
| 9 | 702-712 | isResponder | responder-only accounts skip session timeout; useBookingBadge → sidebar badge key |
| 10 | 713-732 | offline-queue-changed | online/offline and offline-queue listeners; refreshOfflineQueueFromBackend() syncs badge on mount |
| 11 | 733-772 | handleLogin | POST /api/auth/login; staff-role gate; store valetudo_token; apply account theme after authentication; default role view; bootstrapOfflineCache bg |
| 12 | 773-784 | handleManualReplay | manual replayOfflineQueue() with synced-count alert (TopBar queued button) |
| 13 | 785-841 | handleChangePassword | password policy and match checks; PUT /api/auth/change-password; surfaces server issues[] |
| 14 | 842-860 | onUpdateStatus | subscribe electronAPI.onUpdateStatus; unauthenticated gate renders LoginScreen |
| 15 | 861-897 | app-shell | shell render: Sidebar (activeItem/onItemClick wired per role view) + TopBar |
| 16 | 898-936 | update-banner | update banner: download %, Later dismiss, Restart now → installUpdate |
| 17 | 937-965 | app-content | mounts NurseConsole/DoctorConsole/AdminConsole/ResponderConsole by role + IncidentReportModal popup |
| 18 | 966-1077 | modal-backdrop | change-password modal: 3 fields, PasswordStrengthIndicator, submit gated on evaluatePassword, feedback |
| 19 | 1082-1098 | export default function App() | mounts ThemeProvider around AppShell |
