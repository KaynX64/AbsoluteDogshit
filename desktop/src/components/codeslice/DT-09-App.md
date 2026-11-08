# DT-09 · App.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-09 · desktop/src/App.tsx
**LOC:** 1075 · **Anchor commit:** working tree · **Role:** App shell: login/session bootstrap, role-based console routing, offline replay badge, update banner, change-password modal
**Mounted by:** entry (main.tsx)
**API surface:** POST /api/auth/login (L731), POST /api/auth/logout (L684), PUT /api/auth/change-password (L797)
**Socket events:** none directly (child consoles own their sockets)
**State / key fields:** session: user, email, password, error, activeRoleView (multi-role View-as) · workspace: adminTab, doctorViewMode, nurseViewMode · connectivity: isOnline, offlineQueueCount, isReplaying · updater: updateStatus, updateDismissed · pw modal: showPasswordModal, current/new/confirmPassword, passwordMsg
**Mounts (by activeRoleView):** NURSE→NurseConsole · DOCTOR/DENTIST→DoctorConsole(currentRole) · ADMIN→AdminConsole(activeTab) · EMERGENCY_RESPONDER→ResponderConsole · always: IncidentReportModal · shell: Sidebar, TopBar, LoginScreen

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-22 | valetudo_logo | imports: role consoles, hooks, offline-sync service, API config, theme, IncidentReportModal, logo |
| 2 | 23-118 | const I = { | inline SVG icon set I (Users, Shield, Chart, Database, Stethoscope, Calendar, Pill, Alert, Key, Logout...) |
| 3 | 119-152 | useSessionTimeout | 8h inactivity auto-logout hook (R.A. 10173); activity events reset; clears valetudo_token, reloads |
| 4 | 154-254 | navByRole | Sidebar rail: role→nav map, badges, sign-out, password link |
| 5 | 255-340 | tb-role-select | TopBar: greeting, View-as role select, Connected/Offline pill, queued-replay button, user chip |
| 6 | 341-648 | LoginScreen | login split screen; login card has a faint green pointer-following glow, limited to the card; includes email/password form and dev quick-login chips |
| 7 | 649-679 | export default function App() | App state: user, activeRoleView, workspace views, connectivity, updater, password modal |
| 8 | 680-699 | handleSignOut | POST /api/auth/logout; purge valetudo_token, credentials and user state |
| 9 | 700-710 | isResponder | responder-only accounts skip session timeout; useBookingBadge → sidebar badge key |
| 10 | 711-730 | offline-queue-changed | online/offline and offline-queue listeners; refreshOfflineQueueFromBackend() syncs badge on mount |
| 11 | 731-770 | handleLogin | POST /api/auth/login; staff-role gate; store valetudo_token; default role view; bootstrapOfflineCache bg |
| 12 | 771-782 | handleManualReplay | manual replayOfflineQueue() with synced-count alert (TopBar queued button) |
| 13 | 783-839 | handleChangePassword | password policy and match checks; PUT /api/auth/change-password; surfaces server issues[] |
| 14 | 840-858 | onUpdateStatus | subscribe electronAPI.onUpdateStatus; unauthenticated gate renders LoginScreen |
| 15 | 859-895 | app-shell | shell render: Sidebar (activeItem/onItemClick wired per role view) + TopBar |
| 16 | 896-934 | update-banner | update banner: download %, Later dismiss, Restart now → installUpdate |
| 17 | 935-963 | app-content | mounts NurseConsole/DoctorConsole/AdminConsole/ResponderConsole by role + IncidentReportModal popup |
| 18 | 964-1075 | modal-backdrop | change-password modal: 3 fields, PasswordStrengthIndicator, submit gated on evaluatePassword, feedback |
