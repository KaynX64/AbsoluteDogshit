# DT-09 · App.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-09 · desktop/src/App.tsx
**LOC:** 1111 · **Anchor base:** 2727901 + current changes · **Role:** App shell: login/session bootstrap, account themes, role-based console routing, offline replay badge, update banner, change-password modal
**Mounted by:** entry (main.tsx)
**API surface:** POST /api/auth/login (L743), POST /api/auth/logout (L690), PUT /api/auth/change-password (L820)
**Socket events:** none directly (child consoles own their sockets)
**State / key fields:** session: user, email, password, error, activeRoleView (multi-role View-as) · workspace: adminTab, doctorViewMode, nurseViewMode · connectivity: isOnline, offlineQueueCount, isReplaying · updater: updateStatus, updateDismissed · pw modal: showPasswordModal, current/new/confirmPassword, passwordMsg
**Mounts (by activeRoleView):** NURSE→NurseConsole · DOCTOR/DENTIST→DoctorConsole(currentRole) · ADMIN→AdminConsole(activeTab) · EMERGENCY_RESPONDER→ResponderConsole · always: IncidentReportModal · shell: Sidebar, TopBar, LoginScreen

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-24 | import ThemedLogo | imports: role consoles, hooks, offline-sync service, API config, theme, IncidentReportModal, settings, themed logo |
| 2 | 25-120 | const I = { | inline SVG icon set I (Users, Shield, Chart, Database, Stethoscope, Calendar, Pill, Alert, Key, Logout...) |
| 3 | 121-154 | useSessionTimeout | 8h inactivity auto-logout hook (R.A. 10173); activity events reset; clears valetudo_token, reloads |
| 4 | 157-259 | navByRole | Role navigation, Nurse analytics, Incident Records capability, and sign-out. Users & roles stays selected while the internal Archived accounts tab is open. |
| 5 | 260-345 | tb-role-select | TopBar: greeting, View-as role select, Connected/Offline pill, queued-replay button, user chip |
| 6 | 346-653 | LoginScreen | login split screen; login card has a faint green pointer-following glow, limited to the card; includes email/password form and dev quick-login chips |
| 7 | 654-685 | function AppShell() | App state: user, activeRoleView, workspace views, connectivity, updater, password modal |
| 8 | 686-697 | handleSignOut | POST /api/auth/logout; restore default unauthenticated theme and purge valetudo_token, credentials and user state |
| 9 | 698-719 | isResponder | responder-only accounts skip session timeout; useBookingBadge → sidebar badge key |
| 10 | 720-739 | offline-queue-changed | online/offline and offline-queue listeners; refreshOfflineQueueFromBackend() syncs badge on mount |
| 11 | 740-779 | handleLogin | POST /api/auth/login; staff-role gate; store valetudo_token; apply account theme after authentication; default role view; bootstrapOfflineCache bg |
| 12 | 780-791 | handleManualReplay | manual replayOfflineQueue() with synced-count alert (TopBar queued button) |
| 13 | 792-848 | handleChangePassword | password policy and match checks; PUT /api/auth/change-password; surfaces server issues[] |
| 14 | 849-867 | onUpdateStatus | subscribe electronAPI.onUpdateStatus; unauthenticated gate renders LoginScreen |
| 15 | 868-906 | app-shell | shell render: Sidebar (activeItem/onItemClick wired per role view) + TopBar |
| 16 | 907-945 | update-banner | update banner: download %, Later dismiss, Restart now → installUpdate |
| 17 | 946-974 | app-content | mounts NurseConsole/DoctorConsole/AdminConsole/ResponderConsole by role + IncidentReportModal popup |
| 18 | 975-1086 | modal-backdrop | change-password modal: 3 fields, PasswordStrengthIndicator, submit gated on evaluatePassword, feedback |
| 19 | 1091-1108 | export default function App() | mounts ThemeProvider around AppShell |
