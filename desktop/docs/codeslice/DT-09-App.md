# DT-09 · App.tsx

[Desktop slice index](../CODESLICE.md)

## DT-09 · desktop/src/app/App.tsx

`LoginScreen.tsx`, `Sidebar.tsx`, `TopBar.tsx`, and `useSessionTimeout.ts` sit alongside the shell.

The incident report listener stays mounted at shell level across role switches. The shell uses the sidebar order in `consoleNavigation.ts` to animate staff-initiated workspace navigation.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-43 | — | Imports and declarations |
| 2 | 44-99 | function AppShell | function AppShell |
| 3 | 100-154 | const handleSignOut | const handleSignOut |
| 4 | 155-198 | const handleLogin | const handleLogin |
| 5 | 199-271 | const handleManualReplay | const handleManualReplay |
| 6 | 272-291 | <LoginScreen | <LoginScreen |
| 7 | 292-303 | <Sidebar | <Sidebar |
| 8 | 304-391 | <TopBar | <TopBar |
| 9 | 392-515 | <IncidentReportModal | <IncidentReportModal |
| 10 | 516-529 | export default function App | export default function App |
