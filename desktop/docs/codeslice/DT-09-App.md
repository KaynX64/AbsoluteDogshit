# DT-09 · App.tsx

[Desktop slice index](../CODESLICE.md)

## DT-09 · desktop/src/app/App.tsx

`LoginScreen.tsx`, `Sidebar.tsx`, `TopBar.tsx`, and `useSessionTimeout.ts` sit alongside the shell.

The sign-in shell loads before the staff console bundle. The renderer warms the shared bundle after the login screen paints. The incident report provider/editor stays mounted at shell level. Staff history/report navigation keeps clinical console drafts mounted and pauses their realtime subscription while hidden. The shell uses the sidebar order in `consoleNavigation.ts` to animate staff-initiated workspace navigation. If Terminal access is revoked during focus refresh, the shell returns to Users & roles.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-45 | — | Imports and declarations |
| 2 | 46-124 | function AppShell | function AppShell |
| 3 | 125-209 | const handleSignOut | Confirm manual sign-out before clearing the session |
| 4 | 210-260 | const handleLogin | const handleLogin |
| 5 | 261-346 | const handleManualReplay | const handleManualReplay |
| 6 | 347-366 | <LoginScreen | <LoginScreen |
| 7 | 367-378 | <Sidebar | <Sidebar |
| 8 | 379-473 | <TopBar | <TopBar |
| 9 | 474-599 | <IncidentReportModal | <IncidentReportModal |
| 10 | 600-606 | export default function App | export default function App |
