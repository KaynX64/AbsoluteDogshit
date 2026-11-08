<!-- split from desktop/src/components/codeslice/DT-02-AdminConsole.md — part 02 of 02 -->
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
