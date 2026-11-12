<!-- split from desktop/src/components/codeslice/DT-02-AdminConsole.md — part 02 of 02 -->
| 22 | 743-779 | admin_permissions | PUT users/:id/permissions (super-only, admin_permissions); refetch users + health; close modal |
| 23 | 780-807 | handleAdminResetPassword | handleAdminResetPassword: POST users/:id/reset-password (newPassword, min 8 chars) |
| 24 | 808-857 | fetchDbTables | fetchDbTables GET db/tables; fetchTableData GET db/tables/:table (page,limit,search); 300ms debounce effect |
| 25 | 858-898 | handleSaveDbRow | handleSaveDbRow: POST (insert) / PUT (update) db/tables/:table/rows with primaryKey + updates |
| 26 | 899-925 | handleDeleteDbRow | handleDeleteDbRow: DELETE db/tables/:table/rows with confirm; refetch current page |
| 27 | 926-1067 | activeUsersCount | Page header, Super Admin-gated ServerPolicyPanel mount, and Active/Archived account tabs. |
| 28 | 1068-1143 | Add account | USERS tab gate USERS_MANAGE; search input, account counters, Add account button (opens CreateUserModal) |
| 29 | 1144-1182 | userSortKey | role filter chips, status chips, Qualified responders QR-only chip, userSortKey select |
| 30 | 1183-1430 | processedUsers.map | Active users table: QR + SUPER/LIMITED pills, status, Edit/View and permission-gated Archive actions; archived-account table with loading/error/empty states |
| 31 | 1431-1468 | auditSubTab | AUDIT tab gate AUDIT_VIEW; PHI access vs SHA-256 mutation ledger sub-tab pills (auditSubTab) |
| 32 | 1469-1609 | phiSearchTerm | PHI sub-tab: RA 10173 banner, phiSearchTerm/table/role filters, access-log table (viewer, patient, IP) |
| 33 | 1610-1743 | mutationSearchTerm | mutation ledger sub-tab: hash-chain banner, search+action filters, table with SHA-256 hash, timestamps |
| 34 | 1744-1799 | Socket.IO gateway | TELEMETRY gate; KPI cards: MySQL, Redis, Socket.IO gateway, hash-chain ledger (telemetry data) |
| 35 | 1800-1886 | ServerPingMonitor | ServerPingMonitor embed; retention governance header + stats grid (consents, encounters, past period) |
| 36 | 1887-1939 | Sweep outcome | retention breakdown table (EMR, appointments, prescriptions); Enforce sweep button; fallback panel |
| 37 | 1940-1949 | AnalyticsDashboard | analytics tab gate ANALYTICS_VIEW mounts AnalyticsDashboard; INCIDENT_RECORDS_VIEW gates the incident archive and sidebar |
| 38 | 1950-1997 | DATABASE_MANAGE | DB Studio gate DATABASE_MANAGE; header bar with table count and read-only badge (audit/security) |
| 39 | 1998-2123 | System tables | table-list sidebar (System tables); click selects table and refetches with cleared search |
| 40 | 2124-2172 | Insert row | data grid toolbar: record count, dbSearchFilter input, refresh, Insert row button (empty-row modal) |
| 41 | 2173-2250 | tableRows.map | data grid table: schema header with PK icons, AES-256 encrypted badges, NULL/JSON cells, row actions |
| 42 | 2251-2319 | Prev | pagination Prev/Next + page counts; footer note; CreateUserModal mount (onCreated refetches users) |
| 43 | 2320-2384 | handleSaveDbRow | DB row modal: direct-write warning, per-column inputs, PK read-only, Commit to database submit |
| 44 | 2385-2454 | admin-profile-editor | profile editor modal shell (createPortal); protected-admin banner; Basic/Advanced mode toggle |
| 45 | 2455-2521 | Identity & contact | form + disabled fieldset (protected admins); identity and contact inputs (name, email, phone) |
| 46 | 2522-2581 | Assigned RBAC role | access and status: role select (ADMIN locked for limited admins), account status select |
| 47 | 2582-2608 | student_no | STUDENT professional fields: student_no, course, year_level |
| 48 | 2609-2637 | license_no | clinical staff fields (DOCTOR/DENTIST/NURSE/RESPONDER): license_no, specialty, department |
| 49 | 2638-2669 | admin_no | ADMIN fields: admin_no, specialty/scope, department |
| 50 | 2670-2791 | Admin archetype | admin archetype editor: super/limited toggle, permCatalog checkboxes; super-only, no self-modify |
| 51 | 2792-2873 | faculty_no | FACULTY fields (faculty_no, department, position); NON_TEACHING fields (employee_no, office) |
| 52 | 2874-2925 | is_qualified_responder | Qualified Responder card: RESPONDERS_MANAGE-gated checkbox, note, since; sos_via_role hint |
| 53 | 2926-3036 | Health record | Advanced HEALTH_PROFILES editor: blood type, sex, DOB, height/weight, BMI preview, contacts, allergies |
| 54 | 3037-3087 | integrity metadata | Advanced read-only metadata: account/health versions, timestamps, staff signature status |
| 55 | 3088-3166 | adminUserVaccines | vaccination card: adminUserVaccines badge list with remove, add-vaccine input + button |
| 56 | 3167-3256 | Password admin override | password override: limited-admin lockout notice vs Force reset form (handleAdminResetPassword) |
| 57 | 3257-3276 | Save profile changes | fieldset close; modalFeedback banner; Close and Save profile changes buttons (isSavingUser) |
| 58 | 3277-3309 | Role-specific fields | right info pane: per-role field descriptions (student, faculty, doctor, nurse, dentist, responder) |
| 59 | 3310-3320 | document.body | modal + portal close (document.body); root div close; component end |
