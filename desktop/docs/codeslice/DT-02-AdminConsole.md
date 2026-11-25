# DT-02 · AdminConsole.tsx

[Desktop slice index](../CODESLICE.md)

## DT-02 · desktop/src/features/admin/AdminConsole.tsx

Presentation: `HealthProfileEditor.tsx`, `ActiveAccounts.tsx`, `ArchivedAccounts.tsx`, `AuditPanels.tsx`, `DatabaseStudio.tsx`. The controller owns account edits, permissions, and request state. Terminal navigation follows the live admin grant.

The account editor shows a read-only Qualified Responder badge. Applications and appointments are managed in the shared qualification workspace.

Admin archetype buttons and permission cards use theme-aware surfaces, text and selection colors, matching account creation.

Anchor commit: `a32c1d9`; ranges include working-tree changes. The account workspace uses compact heading/tab chrome and labelled dropdown filters; the shared controller retains ownership of filter state.

The render wrapper at L972 lets the desktop record views share the shell's available height. Database Studio, account lists, audit tables, and the incident list scroll within their own regions.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-94 | — | Imports and declarations |
| 2 | 95-191 | export default function | export default function |
| 3 | 192-224 | const fetchUsers | const fetchUsers |
| 4 | 225-300 | const fetchMyPermissions | const fetchMyPermissions |
| 5 | 301-480 | const viewFetch | const viewFetch |
| 6 | 481-516 | const handleArchiveUser | const handleArchiveUser |
| 7 | 517-642 | const handleOpenEditModal | const handleOpenEditModal |
| 8 | 643-768 | const handleSaveUserProfile | const handleSaveUserProfile |
| 9 | 769-802 | const handleAdminResetPassword | const handleAdminResetPassword |
| 10 | 803-1028 | const fetchDbTables | const fetchDbTables |
| 11 | 1029-1060 | <ActiveAccounts | <ActiveAccounts |
| 12 | 1061-1075 | <ArchivedAccounts | <ArchivedAccounts |
| 13 | 1076-1340 | <AuditPanels | <AuditPanels |
| 14 | 1341-1718 | <DatabaseStudio | <DatabaseStudio |
| 15 | 1719-1941 | <StaffAnalyticsPermissions | <StaffAnalyticsPermissions |
| 16 | 1942-2232 | <HealthProfileEditor | <HealthProfileEditor |
