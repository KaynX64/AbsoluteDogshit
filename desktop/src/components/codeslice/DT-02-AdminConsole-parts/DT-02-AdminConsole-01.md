<!-- split from desktop/src/components/codeslice/DT-02-AdminConsole.md — part 01 of 02 -->
# DT-02 · AdminConsole.tsx

Desktop component slice map · [index](../../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-02 · desktop/src/components/AdminConsole.tsx
**LOC:** 3141 · **Anchor commit:** working tree · **Role:** Admin console: roles mgmt, account archive, qualified-responder flag, profile editor, audit, telemetry, analytics, DB Studio
**Mounted by:** desktop/src/App.tsx (import L5; mounted L777 when activeRoleView === 'ADMIN', controlled via adminTab/onTabChange)
**API surface:** GET /api/admin/users (L178) · GET /api/admin/my-permissions (L189) · GET /api/admin/permissions (L208) · GET /api/admin/audit-logs (L251) · GET /api/admin/phi-access-logs (L263) · GET /api/privacy/retention/status (L274) · GET /api/admin/telemetry (L284) · POST /api/privacy/retention/sweep (L296) · GET+PUT /api/profile/patient/:id/immunizations (L450/L601) · GET /api/admin/users/:id/health-profile (L468) · DELETE /api/admin/users/:id archives account while retaining clinical/audit history (L417) · PUT /api/admin/users/:id (L574) · PUT /api/admin/users/:id/qualified-responder (L616) · PUT /api/admin/users/:id/permissions (L651) · POST /api/admin/users/:id/reset-password (L692) · GET /api/admin/db/tables (L712) · GET /api/admin/db/tables/:table (L728) · POST/PUT/DELETE /api/admin/db/tables/:table/rows (L776/L784/L809)
**Socket events:** none (SOCKET_URL imported L8 but never used; L1483 is only a static KPI label Socket.IO gateway)
**State / key fields:** users: usersList, searchTerm, userRoleFilter, userStatusFilter, userQrOnly, userSortKey, editingUser, showCreateUserModal, isSavingUser, archivingUserId, userActionFeedback ·
perms: myPerms, permCatalog, editAdminArchetype, editAdminPerms, adminPasswordInput, modalFeedback ·
profile editor: editMode, editHealth (+Loaded/Loading/Exists), editAccountMeta, editQrOriginal, adminUserVaccines, adminNewVaccine ·
audit: auditSubTab, phiLogs, mutationLogs, loadingLogs, phi/mutation search+filter+sort vars ·
ops: telemetry, retentionInfo, sweeping ·
db studio: dbTablesList, selectedDbTable, tableSchema, tableRows, tablePage/TotalPages/TotalRows, isTableReadOnly, tableReadOnlyReason, dbRowModal, dbSearchFilter

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-11 | — | imports: React, createPortal, AnalyticsDashboard, IncidentRecords, CreateUserModal, theme, api config, Icon |
| 2 | 12-27 | inline, no dependency | inline SVG icon set I (Users, Shield, Activity, Database, Search, Refresh, Pencil, Trash, Lock, Check) |
| 3 | 29-51 | modeBtnStyle | advanced-editor styles: advLabel, advTextarea, modeBtnStyle segmented Basic/Advanced toggle |
| 4 | 53-83 | NoPermissionPanel | NoPermissionPanel: notice for LIMITED admins missing a permission code (super never sees it) |
| 5 | 85-99 | AdminTab | AdminTab type (users/audit/telemetry/analytics/incidents/db); props; controlled tab w/ internal fallback |
| 6 | 101-150 | showCreateUserModal | state: usersList, logs, editingUser; myPerms+permCatalog; editMode/editHealth/editQrOriginal; DB studio state |
| 7 | 152-172 | userRoleFilter | state: retentionInfo, sweeping, telemetry; user/phi/mutation filter and sort variables |
| 8 | 174-202 | fetchUsers | fetchUsers GET /api/admin/users; fetchMyPermissions GET /api/admin/my-permissions (archetype, is_super) |
| 9 | 204-221 | fetchPermissionCatalog | fetchPermissionCatalog GET /api/admin/permissions; can() gate; super admins always pass |
| 10 | 223-245 | editingProtectedAdmin | limited-admin derived flags (viewingAsLimited, editingSelf, editingProtectedAdmin); live BMI preview calc |
| 11 | 247-289 | fetchMutationLogs | fetchers: GET audit-logs, phi-access-logs, privacy/retention/status, admin/telemetry (all under /api/) |
| 12 | 291-308 | handleExecuteSweep | handleExecuteSweep: POST /api/privacy/retention/sweep after confirm; reloads retention status |
| 13 | 310-337 | Refetch contextual data | mount effect runs all fetchers; activeTab effect refetches audit, telemetry, DB tables on tab switch |
| 14 | 339-361 | processedUsers | processedUsers: filter by search/role/status/QR-only, sort by id, name, role (userSortKey) |
| 15 | 363-398 | processedPhiLogs | processedPhiLogs + processedMutationLogs: search/table/role/action filters, time+patient sorts |
| 16 | 400-473 | handleArchiveUser | handleArchiveUser: confirmed DELETE /api/admin/users/:id; keeps audit/clinical history and updates list feedback; handleOpenEditModal seeds profile editor |
| 17 | 474-548 | fetchUserVaccinesForAdmin | fetchUserVaccinesForAdmin GET immunizations; fetchEditHealthProfile GET users/:id/health-profile |
| 18 | 549-570 | handleEditModeSwitch | handleEditModeSwitch lazy-loads health record on Advanced; vaccine add/remove handlers |
| 19 | 571-621 | handleSaveUserProfile | handleSaveUserProfile: guards (protected admin, empty limited perms); builds health_profile payload |
| 20 | 622-655 | role_code | PUT /api/admin/users/:id with role_code + sub-profile fields; then PUT immunizations |
| 21 | 656-683 | qualified-responder | PUT users/:id/qualified-responder when flag/note changed; partial-success warning on failure |
