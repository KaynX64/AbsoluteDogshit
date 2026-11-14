# DT-09 · App.tsx

[Desktop slice index](../CODESLICE.md)

## DT-09 · desktop/src/app/App.tsx

`LoginScreen.tsx`, `Sidebar.tsx`, `TopBar.tsx`, and `useSessionTimeout.ts` sit alongside the shell.

The incident report listener stays mounted at shell level across role switches. The shell uses the sidebar order in `consoleNavigation.ts` to animate staff-initiated workspace navigation. If Terminal access is revoked during focus refresh, the shell returns to Users & roles.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-40 | — | Imports and declarations |
| 2 | 41-101 | function AppShell | function AppShell |
| 3 | 102-182 | const handleSignOut | const handleSignOut |
| 4 | 183-227 | const handleLogin | const handleLogin |
| 5 | 228-313 | const handleManualReplay | const handleManualReplay |
| 6 | 314-330 | <LoginScreen | <LoginScreen |
| 7 | 331-342 | <Sidebar | <Sidebar |
| 8 | 343-432 | <TopBar | <TopBar |
| 9 | 433-556 | <IncidentReportModal | <IncidentReportModal |
| 10 | 557-563 | export default function App | export default function App |
