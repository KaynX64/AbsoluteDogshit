# DT-09 · App.tsx

[Desktop slice index](../CODESLICE.md)

## DT-09 · desktop/src/app/App.tsx

`LoginScreen.tsx`, `Sidebar.tsx`, `TopBar.tsx`, and `useSessionTimeout.ts` sit alongside the shell.

The incident report listener stays mounted at shell level across role switches. The shell uses the sidebar order in `consoleNavigation.ts` to animate staff-initiated workspace navigation. If Terminal access is revoked during focus refresh, the shell returns to Users & roles.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-44 | — | Imports and declarations |
| 2 | 45-105 | function AppShell | function AppShell |
| 3 | 106-161 | const handleSignOut | const handleSignOut |
| 4 | 162-205 | const handleLogin | const handleLogin |
| 5 | 206-288 | const handleManualReplay | const handleManualReplay |
| 6 | 289-305 | <LoginScreen | <LoginScreen |
| 7 | 306-317 | <Sidebar | <Sidebar |
| 8 | 318-405 | <TopBar | <TopBar |
| 9 | 406-529 | <IncidentReportModal | <IncidentReportModal |
| 10 | 530-536 | export default function App | export default function App |
