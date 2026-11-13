<!-- split from desktop/src/components/codeslice/DT-02-AdminConsole.md — part 01 of 02 -->
# DT-02 · AdminConsole.tsx

Desktop component slice map · [index](../../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-02 · desktop/src/components/AdminConsole.tsx
**LOC:** 3374 · **Anchor base:** 2727901 + current changes · **Role:** Admin console: roles management, active/archived account tabs and archive actions, staff analytics permissions, qualified-responder flag, profile editor, audit, telemetry, analytics, Server Policy, and DB Studio
**Mounted by:** desktop/src/App.tsx (import L5; mounted L976 when activeRoleView === 'ADMIN', controlled via adminTab/onTabChange)
**API surface:** GET /api/admin/users (L198) · GET /api/admin/users?archived=true (L211) · GET /api/admin/my-permissions (L232) · GET /api/admin/permissions (L259) · GET /api/admin/audit-logs (L302) · GET /api/admin/phi-access-logs (L314) · GET /api/privacy/retention/status (L325) · GET /api/admin/telemetry (L335) · POST /api/privacy/retention/sweep (L347) · GET+PUT /api/profile/patient/:id/immunizations (L561/L716) · GET /api/admin/users/:id/health-profile (L579) · DELETE /api/admin/users/:id archives account while retaining clinical/audit history (L488) · PUT /api/admin/users/:id (L689) · PUT /api/admin/users/:id/qualified-responder (L731) · PUT /api/admin/users/:id/permissions (L766) · POST /api/admin/users/:id/reset-password (L813) · GET /api/admin/db/tables (L833) · GET /api/admin/db/tables/:table (L849) · POST/PUT/DELETE /api/admin/db/tables/:table/rows (L897/L905/L930) · ServerPolicyPanel uses GET/PUT /api/admin/server-policy and POST /api/admin/server-policy/preview
**Socket events:** none (SOCKET_URL imported L9 but never used; L1800 is only a static KPI label Socket.IO gateway)
**State / key fields:** users: usersList, archivedUsers/loadingArchivedUsers/archivedUsersError, searchTerm/archivedSearchTerm, userRoleFilter, userStatusFilter, userQrOnly, userSortKey, editingUser, showCreateUserModal, isSavingUser, archivingUserId, userActionFeedback ·
perms: myPerms, permCatalog, editAdminArchetype, editAdminPerms, adminPasswordInput, modalFeedback ·
profile editor: editMode, editHealth (+Loaded/Loading/Exists), editAccountMeta, editQrOriginal, adminUserVaccines, adminNewVaccine ·
audit: auditSubTab, phiLogs, mutationLogs, loadingLogs, phi/mutation search+filter+sort vars ·
ops: telemetry, retentionInfo, sweeping ·
db studio: dbTablesList, selectedDbTable, tableSchema, tableRows, tablePage/TotalPages/TotalRows, isTableReadOnly, tableReadOnlyReason, dbRowModal, dbSearchFilter

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-14 | — | imports: React, createPortal, AnalyticsDashboard, IncidentRecords, CreateUserModal, theme, api config, Icon, AdminConsole.css, StaffAnalyticsPermissions |
| 2 | 15-31 | inline, no dependency | inline SVG icon set I (Users, Shield, Activity, Database, Search, Refresh, Pencil, Trash, Lock, Check) |
| 3 | 32-55 | modeBtnStyle | advanced-editor styles: advLabel, advTextarea, modeBtnStyle segmented Basic/Advanced toggle |
| 4 | 56-86 | NoPermissionPanel | NoPermissionPanel: shared restricted-archetype banner for missing permissions, with optional section-specific description |
| 5 | 87-107 | AdminTab | AdminTab type includes serverPolicy. Controlled and internal tab state plus change callback. |
| 6 | 108-173 | showCreateUserModal | state: active and archived users, logs, editingUser; myPerms+permCatalog; editMode/editHealth/editQrOriginal; DB studio state |
| 7 | 174-188 | userRoleFilter | state: retentionInfo, sweeping, telemetry; user/phi/mutation filter and sort variables |
| 8 | 189-240 | fetchUsers | fetchUsers GET active /api/admin/users; fetchArchivedUsers GET /users?archived=true; fetchMyPermissions GET /api/admin/my-permissions |
| 9 | 241-268 | fetchPermissionCatalog | fetchPermissionCatalog GET /api/admin/permissions; can() gate; super admins always pass |
| 10 | 269-297 | editingProtectedAdmin | limited-admin derived flags (viewingAsLimited, editingSelf, editingProtectedAdmin); live BMI preview calc |
| 11 | 298-341 | fetchMutationLogs | fetchers: GET audit-logs, phi-access-logs, privacy/retention/status, admin/telemetry (all under /api/) |
| 12 | 342-371 | handleExecuteSweep | handleExecuteSweep: POST /api/privacy/retention/sweep after confirm; reloads retention status |
| 13 | 372-406 | Refetch contextual data | mount effect runs fetchers; activeTab effect loads archived accounts and refetches audit, telemetry, DB tables |
| 14 | 407-435 | processedUsers | processedUsers sorting plus archived-account search by ID, name, email, and role |
| 15 | 436-473 | processedPhiLogs | processedPhiLogs + processedMutationLogs: search/table/role/action filters, time+patient sorts |
| 16 | 474-543 | handleArchiveUser | handleArchiveUser: confirmed DELETE /api/admin/users/:id; keeps audit/clinical history and updates list feedback; handleOpenEditModal seeds profile editor |
| 17 | 544-618 | fetchUserVaccinesForAdmin | fetchUserVaccinesForAdmin GET immunizations; fetchEditHealthProfile GET users/:id/health-profile |
| 18 | 619-640 | handleEditModeSwitch | handleEditModeSwitch lazy-loads health record on Advanced; vaccine add/remove handlers |
| 19 | 641-695 | handleSaveUserProfile | handleSaveUserProfile: guards (pending temporary-password confirmation, protected admin, empty limited perms); builds health_profile payload |
| 20 | 696-729 | role_code | PUT /api/admin/users/:id with role_code + sub-profile fields; then PUT immunizations |
| 21 | 730-757 | qualified-responder | PUT users/:id/qualified-responder when flag/note changed; partial-success warning on failure |