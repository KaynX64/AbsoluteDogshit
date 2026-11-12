<!-- split from desktop/src/components/codeslice/DT-02-AdminConsole.md — part 01 of 02 -->
# DT-02 · AdminConsole.tsx

Desktop component slice map · [index](../../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-02 · desktop/src/components/AdminConsole.tsx
**LOC:** 3320 · **Anchor base:** 2727901 + current changes · **Role:** Admin console: roles management, active/archived account tabs and archive actions, qualified-responder flag, profile editor, audit, telemetry, analytics, Server Policy, and DB Studio
**Mounted by:** desktop/src/App.tsx (import L5; mounted L965 when activeRoleView === 'ADMIN', controlled via adminTab/onTabChange)
**API surface:** GET /api/admin/users (L189) · GET /api/admin/users?archived=true (L202) · GET /api/admin/my-permissions (L222) · GET /api/admin/permissions (L241) · GET /api/admin/audit-logs (L284) · GET /api/admin/phi-access-logs (L296) · GET /api/privacy/retention/status (L307) · GET /api/admin/telemetry (L317) · POST /api/privacy/retention/sweep (L329) · GET+PUT /api/profile/patient/:id/immunizations (L521/L672) · GET /api/admin/users/:id/health-profile (L539) · DELETE /api/admin/users/:id archives account while retaining clinical/audit history (L448) · PUT /api/admin/users/:id (L645) · PUT /api/admin/users/:id/qualified-responder (L687) · PUT /api/admin/users/:id/permissions (L722) · POST /api/admin/users/:id/reset-password (L763) · GET /api/admin/db/tables (L783) · GET /api/admin/db/tables/:table (L799) · POST/PUT/DELETE /api/admin/db/tables/:table/rows (L847/L855/L880) · ServerPolicyPanel uses GET/PUT /api/admin/server-policy and POST /api/admin/server-policy/preview
**Socket events:** none (SOCKET_URL imported L8 but never used; L1483 is only a static KPI label Socket.IO gateway)
**State / key fields:** users: usersList, archivedUsers/loadingArchivedUsers/archivedUsersError, searchTerm, userRoleFilter, userStatusFilter, userQrOnly, userSortKey, editingUser, showCreateUserModal, isSavingUser, archivingUserId, userActionFeedback ·
perms: myPerms, permCatalog, editAdminArchetype, editAdminPerms, adminPasswordInput, modalFeedback ·
profile editor: editMode, editHealth (+Loaded/Loading/Exists), editAccountMeta, editQrOriginal, adminUserVaccines, adminNewVaccine ·
audit: auditSubTab, phiLogs, mutationLogs, loadingLogs, phi/mutation search+filter+sort vars ·
ops: telemetry, retentionInfo, sweeping ·
db studio: dbTablesList, selectedDbTable, tableSchema, tableRows, tablePage/TotalPages/TotalRows, isTableReadOnly, tableReadOnlyReason, dbRowModal, dbSearchFilter

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-12 | — | imports: React, createPortal, AnalyticsDashboard, IncidentRecords, CreateUserModal, theme, api config, Icon |
| 2 | 13-28 | inline, no dependency | inline SVG icon set I (Users, Shield, Activity, Database, Search, Refresh, Pencil, Trash, Lock, Check) |
| 3 | 30-52 | modeBtnStyle | advanced-editor styles: advLabel, advTextarea, modeBtnStyle segmented Basic/Advanced toggle |
| 4 | 54-87 | NoPermissionPanel | NoPermissionPanel: shared restricted-archetype banner for missing permissions, with optional section-specific description |
| 5 | 88-108 | AdminTab | AdminTab type, controlled and internal tab state, and sidebar capability callback. |
| 6 | 109-174 | showCreateUserModal | state: active and archived users, logs, editingUser; myPerms+permCatalog; editMode/editHealth/editQrOriginal; DB studio state |
| 7 | 175-189 | userRoleFilter | state: retentionInfo, sweeping, telemetry; user/phi/mutation filter and sort variables |
| 8 | 190-250 | fetchUsers | fetchUsers GET active /api/admin/users; fetchArchivedUsers GET /users?archived=true; fetchMyPermissions GET /api/admin/my-permissions |
| 9 | 251-278 | fetchPermissionCatalog | fetchPermissionCatalog GET /api/admin/permissions; can() gate; super admins always pass |
| 10 | 279-292 | editingProtectedAdmin | limited-admin derived flags (viewingAsLimited, editingSelf, editingProtectedAdmin); live BMI preview calc |
| 11 | 293-336 | fetchMutationLogs | fetchers: GET audit-logs, phi-access-logs, privacy/retention/status, admin/telemetry (all under /api/) |
| 12 | 337-364 | handleExecuteSweep | handleExecuteSweep: POST /api/privacy/retention/sweep after confirm; reloads retention status |
| 13 | 365-401 | Refetch contextual data | mount fetches admin data; permission refresh runs on mount and window focus; activeTab loads contextual data |
| 14 | 402-424 | processedUsers | processedUsers: filter by search/role/status/QR-only, sort by id, name, role (userSortKey) |
| 15 | 425-462 | processedPhiLogs | processedPhiLogs + processedMutationLogs: search/table/role/action filters, time+patient sorts |
| 16 | 463-532 | handleArchiveUser | handleArchiveUser: confirmed DELETE /api/admin/users/:id; keeps audit/clinical history and updates list feedback; handleOpenEditModal seeds profile editor |
| 17 | 533-607 | fetchUserVaccinesForAdmin | fetchUserVaccinesForAdmin GET immunizations; fetchEditHealthProfile GET users/:id/health-profile |
| 18 | 608-629 | handleEditModeSwitch | handleEditModeSwitch lazy-loads health record on Advanced; vaccine add/remove handlers |
| 19 | 630-680 | handleSaveUserProfile | handleSaveUserProfile: guards (protected admin, empty limited perms); builds health_profile payload |
| 20 | 681-714 | role_code | PUT /api/admin/users/:id with role_code + sub-profile fields; then PUT immunizations |
| 21 | 715-742 | qualified-responder | PUT users/:id/qualified-responder when flag/note changed; partial-success warning on failure |
