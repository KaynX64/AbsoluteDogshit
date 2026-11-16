# DT-09 · App.tsx

[Desktop slice index](../CODESLICE.md)

## DT-09 · desktop/src/app/App.tsx

`LoginScreen.tsx`, `Sidebar.tsx`, `TopBar.tsx`, and `useSessionTimeout.ts` sit alongside the shell.

The sign-in shell loads before the staff console bundle. The renderer warms the shared bundle after the login screen paints. The incident report listener stays mounted at shell level across role switches. The shell uses the sidebar order in `consoleNavigation.ts` to animate staff-initiated workspace navigation. If Terminal access is revoked during focus refresh, the shell returns to Users & roles.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-45 | — | Imports and declarations |
| 2 | 46-118 | function AppShell | function AppShell |
| 3 | 119-202 | const handleSignOut | Confirm manual sign-out before clearing the session |
| 4 | 203-253 | const handleLogin | const handleLogin |
| 5 | 254-339 | const handleManualReplay | const handleManualReplay |
| 6 | 340-357 | <LoginScreen | <LoginScreen |
| 7 | 358-369 | <Sidebar | <Sidebar |
| 8 | 370-460 | <TopBar | <TopBar |
| 9 | 461-584 | <IncidentReportModal | <IncidentReportModal |
| 10 | 585-591 | export default function App | export default function App |
