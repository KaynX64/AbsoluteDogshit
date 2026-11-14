# DT-02 · AdminConsole.tsx

[Desktop slice index](../CODESLICE.md)

## DT-02 · desktop/src/features/admin/AdminConsole.tsx

Presentation: `HealthProfileEditor.tsx`, `ActiveAccounts.tsx`, `ArchivedAccounts.tsx`, `AuditPanels.tsx`, `DatabaseStudio.tsx`. The controller owns account edits, permissions, and request state. Terminal navigation follows the live admin grant.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-93 | — | Imports and declarations |
| 2 | 94-194 | export default function | export default function |
| 3 | 195-227 | const fetchUsers | const fetchUsers |
| 4 | 228-303 | const fetchMyPermissions | const fetchMyPermissions |
| 5 | 304-483 | const viewFetch | const viewFetch |
| 6 | 484-519 | const handleArchiveUser | const handleArchiveUser |
| 7 | 520-649 | const handleOpenEditModal | const handleOpenEditModal |
| 8 | 650-806 | const handleSaveUserProfile | const handleSaveUserProfile |
| 9 | 807-840 | const handleAdminResetPassword | const handleAdminResetPassword |
| 10 | 841-1065 | const fetchDbTables | const fetchDbTables |
| 11 | 1066-1097 | <ActiveAccounts | <ActiveAccounts |
| 12 | 1098-1112 | <ArchivedAccounts | <ArchivedAccounts |
| 13 | 1113-1377 | <AuditPanels | <AuditPanels |
| 14 | 1378-1755 | <DatabaseStudio | <DatabaseStudio |
| 15 | 1756-2056 | <StaffAnalyticsPermissions | <StaffAnalyticsPermissions |
| 16 | 2057-2347 | <HealthProfileEditor | <HealthProfileEditor |
