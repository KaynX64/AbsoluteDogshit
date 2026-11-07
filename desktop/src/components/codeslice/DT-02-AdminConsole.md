# DT-02 · AdminConsole.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-02 · desktop/src/components/AdminConsole.tsx
**LOC:** 3053 · **Anchor commit:** 93b4172 · **Role:** Admin console: roles mgmt, qualified-responder flag, profile editor, audit, telemetry, analytics, DB Studio
**Mounted by:** desktop/src/App.tsx (import L5; mounted L777 when activeRoleView === 'ADMIN', controlled via adminTab/onTabChange)
**API surface:** GET /api/admin/users (L178) · GET /api/admin/my-permissions (L189) · GET /api/admin/permissions (L208) · GET /api/admin/audit-logs (L251) · GET /api/admin/phi-access-logs (L263) · GET /api/privacy/retention/status (L274) · GET /api/admin/telemetry (L284) · POST /api/privacy/retention/sweep (L296) · GET+PUT /api/profile/patient/:id/immunizations (L450/L601) · GET /api/admin/users/:id/health-profile (L468) · PUT /api/admin/users/:id (L574) · PUT /api/admin/users/:id/qualified-responder (L616) · PUT /api/admin/users/:id/permissions (L651) · POST /api/admin/users/:id/reset-password (L692) · GET /api/admin/db/tables (L712) · GET /api/admin/db/tables/:table (L728) · POST/PUT/DELETE /api/admin/db/tables/:table/rows (L776/L784/L809)
**Socket events:** none (SOCKET_URL imported L8 but never used; L1483 is only a static KPI label Socket.IO gateway)
**State / key fields:** users: usersList, searchTerm, userRoleFilter, userStatusFilter, userQrOnly, userSortKey, editingUser, showCreateUserModal, isSavingUser ·
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
| 16 | 400-446 | handleOpenEditModal | handleOpenEditModal: seeds editingUser, editQrOriginal snapshot; resets editMode/editHealth; seeds perms |
| 17 | 447-507 | fetchUserVaccinesForAdmin | fetchUserVaccinesForAdmin GET immunizations; fetchEditHealthProfile GET users/:id/health-profile |
| 18 | 509-530 | handleEditModeSwitch | handleEditModeSwitch lazy-loads health record on Advanced; vaccine add/remove handlers |
| 19 | 531-571 | handleSaveUserProfile | handleSaveUserProfile: guards (protected admin, empty limited perms); builds health_profile payload |
| 20 | 572-605 | role_code | PUT /api/admin/users/:id with role_code + sub-profile fields; then PUT immunizations |
| 21 | 607-637 | qualified-responder | PUT users/:id/qualified-responder when flag/note changed; partial-success warning on failure |
| 22 | 638-679 | admin_permissions | PUT users/:id/permissions (super-only, admin_permissions); refetch users + health; close modal |
| 23 | 681-707 | handleAdminResetPassword | handleAdminResetPassword: POST users/:id/reset-password (newPassword, min 8 chars) |
| 24 | 709-757 | fetchDbTables | fetchDbTables GET db/tables; fetchTableData GET db/tables/:table (page,limit,search); 300ms debounce effect |
| 25 | 759-798 | handleSaveDbRow | handleSaveDbRow: POST (insert) / PUT (update) db/tables/:table/rows with primaryKey + updates |
| 26 | 800-821 | handleDeleteDbRow | handleDeleteDbRow: DELETE db/tables/:table/rows with confirm; refetch current page |
| 27 | 823-851 | activeUsersCount | render start; page header with per-tab title and subtitle (users, audit, telemetry, analytics, db) |
| 28 | 853-919 | Add account | USERS tab gate USERS_MANAGE; search input, account counters, Add account button (opens CreateUserModal) |
| 29 | 921-1014 | userSortKey | role filter chips, status chips, Qualified responders QR-only chip, userSortKey select |
| 30 | 1016-1159 | processedUsers.map | users table: QR + SUPER/LIMITED archetype pills, status pill, Edit/View buttons; empty state + RBAC footer |
| 31 | 1160-1182 | auditSubTab | AUDIT tab gate AUDIT_VIEW; PHI access vs SHA-256 mutation ledger sub-tab pills (auditSubTab) |
| 32 | 1184-1323 | phiSearchTerm | PHI sub-tab: RA 10173 banner, phiSearchTerm/table/role filters, access-log table (viewer, patient, IP) |
| 33 | 1325-1449 | mutationSearchTerm | mutation ledger sub-tab: hash-chain banner, search+action filters, table with SHA-256 hash, timestamps |
| 34 | 1453-1536 | Socket.IO gateway | TELEMETRY gate; KPI cards: MySQL, Redis, Socket.IO gateway, hash-chain ledger (telemetry data) |
| 35 | 1538-1607 | ServerPingMonitor | ServerPingMonitor embed; retention governance header + stats grid (consents, encounters, past period) |
| 36 | 1609-1671 | Sweep outcome | retention breakdown table (EMR, appointments, prescriptions); Enforce sweep button; fallback panel |
| 37 | 1675-1684 | AnalyticsDashboard | analytics tab gate ANALYTICS_VIEW mounts AnalyticsDashboard; incidents tab mounts IncidentRecords |
| 38 | 1686-1719 | DATABASE_MANAGE | DB Studio gate DATABASE_MANAGE; header bar with table count and read-only badge (audit/security) |
| 39 | 1721-1778 | System tables | table-list sidebar (System tables); click selects table and refetches with cleared search |
| 40 | 1780-1867 | Insert row | data grid toolbar: record count, dbSearchFilter input, refresh, Insert row button (empty-row modal) |
| 41 | 1869-1971 | tableRows.map | data grid table: schema header with PK icons, AES-256 encrypted badges, NULL/JSON cells, row actions |
| 42 | 1973-2025 | Prev | pagination Prev/Next + page counts; footer note; CreateUserModal mount (onCreated refetches users) |
| 43 | 2027-2118 | handleSaveDbRow | DB row modal: direct-write warning, per-column inputs, PK read-only, Commit to database submit |
| 44 | 2120-2188 | admin-profile-editor | profile editor modal shell (createPortal); protected-admin banner; Basic/Advanced mode toggle |
| 45 | 2190-2251 | Identity & contact | form + disabled fieldset (protected admins); identity and contact inputs (name, email, phone) |
| 46 | 2253-2308 | Assigned RBAC role | access and status: role select (ADMIN locked for limited admins), account status select |
| 47 | 2310-2339 | student_no | STUDENT professional fields: student_no, course, year_level |
| 48 | 2341-2366 | license_no | clinical staff fields (DOCTOR/DENTIST/NURSE/RESPONDER): license_no, specialty, department |
| 49 | 2368-2398 | admin_no | ADMIN fields: admin_no, specialty/scope, department |
| 50 | 2400-2521 | Admin archetype | admin archetype editor: super/limited toggle, permCatalog checkboxes; super-only, no self-modify |
| 51 | 2523-2580 | faculty_no | FACULTY fields (faculty_no, department, position); NON_TEACHING fields (employee_no, office) |
| 52 | 2582-2663 | is_qualified_responder | Qualified Responder card: RESPONDERS_MANAGE-gated checkbox, note, since; sos_via_role hint |
| 53 | 2665-2774 | Health record | Advanced HEALTH_PROFILES editor: blood type, sex, DOB, height/weight, BMI preview, contacts, allergies |
| 54 | 2776-2811 | integrity metadata | Advanced read-only metadata: account/health versions, timestamps, staff signature status |
| 55 | 2813-2890 | adminUserVaccines | vaccination card: adminUserVaccines badge list with remove, add-vaccine input + button |
| 56 | 2891-2966 | Password admin override | password override: limited-admin lockout notice vs Force reset form (handleAdminResetPassword) |
| 57 | 2968-2999 | Save profile changes | fieldset close; modalFeedback banner; Close and Save profile changes buttons (isSavingUser) |
| 58 | 3001-3045 | Role-specific fields | right info pane: per-role field descriptions (student, faculty, doctor, nurse, dentist, responder) |
| 59 | 3046-3053 | document.body | modal + portal close (document.body); root div close; component end |
