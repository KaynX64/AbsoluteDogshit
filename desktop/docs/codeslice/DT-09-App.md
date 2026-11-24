# DT-09 · App.tsx

[Desktop slice index](../CODESLICE.md)

## DT-09 · desktop/src/app/App.tsx

`LoginScreen.tsx`, `Sidebar.tsx`, `TopBar.tsx`, and `useSessionTimeout.ts` sit alongside the shell.

The sign-in shell loads before the staff console bundle. The renderer warms the shared bundle after the login screen paints. The incident report provider/editor stays mounted at shell level. Staff qualification/history/report navigation keeps clinical console drafts mounted and pauses their realtime subscription while hidden. The shell marks its main/content nodes with the active records/console workspace kind so hidden consoles cannot impose their layout on records. The shell uses the sidebar order in `consoleNavigation.ts` to animate staff-initiated workspace navigation. If Terminal access is revoked during focus refresh, the shell returns to Users & roles. Anchor commit: `4e79e9b`; ranges include working-tree changes.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-46 | — | Imports and declarations |
| 2 | 47-125 | function AppShell | function AppShell |
| 3 | 126-210 | const handleSignOut | Confirm manual sign-out before clearing the session |
| 4 | 211-261 | const handleLogin | const handleLogin |
| 5 | 262-347 | const handleManualReplay | const handleManualReplay |
| 6 | 348-367 | <LoginScreen | <LoginScreen |
| 7 | 368-379 | <Sidebar | <Sidebar |
| 8 | 380-476 | <TopBar | <TopBar |
| 9 | 477-602 | <IncidentReportModal | <IncidentReportModal |
| 10 | 603-609 | export default function App | export default function App |