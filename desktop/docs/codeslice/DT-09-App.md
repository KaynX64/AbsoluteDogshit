# DT-09 · App.tsx

[Desktop slice index](../CODESLICE.md)

## DT-09 · desktop/src/app/App.tsx

`LoginScreen.tsx`, `Sidebar.tsx`, `TopBar.tsx`, and `useSessionTimeout.ts` sit alongside the shell.

The sign-in shell loads before the staff console bundle. The renderer warms the shared bundle after the login screen paints. The incident report listener stays mounted at shell level across role switches. The shell uses the sidebar order in `consoleNavigation.ts` to animate staff-initiated workspace navigation. If Terminal access is revoked during focus refresh, the shell returns to Users & roles.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-45 | — | Imports and declarations |
| 2 | 46-118 | function AppShell | function AppShell |
| 3 | 119-200 | const handleSignOut | const handleSignOut |
| 4 | 201-251 | const handleLogin | const handleLogin |
| 5 | 252-337 | const handleManualReplay | const handleManualReplay |
| 6 | 338-355 | <LoginScreen | <LoginScreen |
| 7 | 356-367 | <Sidebar | <Sidebar |
| 8 | 368-458 | <TopBar | <TopBar |
| 9 | 459-582 | <IncidentReportModal | <IncidentReportModal |
| 10 | 583-589 | export default function App | export default function App |
