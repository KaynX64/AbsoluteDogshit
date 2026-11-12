<!-- split from desktop/src/components/codeslice/DT-02-AdminConsole.md — part 02 of 02 -->
| 22 | 716-752 | admin_permissions | PUT users/:id/permissions (super-only, admin_permissions); refetch users + health; close modal |
| 23 | 753-780 | handleAdminResetPassword | handleAdminResetPassword: POST users/:id/reset-password (newPassword, min 8 chars) |
| 24 | 781-830 | fetchDbTables | fetchDbTables GET db/tables; fetchTableData GET db/tables/:table (page,limit,search); 300ms debounce effect |
| 25 | 831-871 | handleSaveDbRow | handleSaveDbRow: POST (insert) / PUT (update) db/tables/:table/rows with primaryKey + updates |
| 26 | 872-898 | handleDeleteDbRow | handleDeleteDbRow: DELETE db/tables/:table/rows with confirm; refetch current page |
| 27 | 899-1040 | activeUsersCount | Page header, Super Admin-gated ServerPolicyPanel mount, and Active/Archived account tabs. |
| 28 | 1035-1116 | Add account | USERS tab gate USERS_MANAGE; search input, account counters, Add account button (opens CreateUserModal) |
| 29 | 1117-1155 | userSortKey | role filter chips, status chips, Qualified responders QR-only chip, userSortKey select |
| 30 | 1156-1403 | processedUsers.map | Active users table: QR + SUPER/LIMITED pills, status, Edit/View and permission-gated Archive actions; archived-account table with loading/error/empty states |
| 31 | 1404-1441 | auditSubTab | AUDIT tab gate AUDIT_VIEW; PHI access vs SHA-256 mutation ledger sub-tab pills (auditSubTab) |
| 32 | 1442-1582 | phiSearchTerm | PHI sub-tab: RA 10173 banner, phiSearchTerm/table/role filters, access-log table (viewer, patient, IP) |
| 33 | 1583-1716 | mutationSearchTerm | mutation ledger sub-tab: hash-chain banner, search+action filters, table with SHA-256 hash, timestamps |
| 34 | 1717-1772 | Socket.IO gateway | TELEMETRY gate; KPI cards: MySQL, Redis, Socket.IO gateway, hash-chain ledger (telemetry data) |
| 35 | 1773-1859 | ServerPingMonitor | ServerPingMonitor embed; retention governance header + stats grid (consents, encounters, past period) |
| 36 | 1860-1912 | Sweep outcome | retention breakdown table (EMR, appointments, prescriptions); Enforce sweep button; fallback panel |
| 37 | 1913-1922 | AnalyticsDashboard | analytics tab gate ANALYTICS_VIEW mounts AnalyticsDashboard; incidents tab mounts IncidentRecords |
| 38 | 1923-1970 | DATABASE_MANAGE | DB Studio gate DATABASE_MANAGE; header bar with table count and read-only badge (audit/security) |
| 39 | 1971-2096 | System tables | table-list sidebar (System tables); click selects table and refetches with cleared search |
| 40 | 2097-2145 | Insert row | data grid toolbar: record count, dbSearchFilter input, refresh, Insert row button (empty-row modal) |
| 41 | 2146-2223 | tableRows.map | data grid table: schema header with PK icons, AES-256 encrypted badges, NULL/JSON cells, row actions |
| 42 | 2224-2292 | Prev | pagination Prev/Next + page counts; footer note; CreateUserModal mount (onCreated refetches users) |
| 43 | 2293-2357 | handleSaveDbRow | DB row modal: direct-write warning, per-column inputs, PK read-only, Commit to database submit |
| 44 | 2358-2427 | admin-profile-editor | profile editor modal shell (createPortal); protected-admin banner; Basic/Advanced mode toggle |
| 45 | 2428-2494 | Identity & contact | form + disabled fieldset (protected admins); identity and contact inputs (name, email, phone) |
| 46 | 2495-2554 | Assigned RBAC role | access and status: role select (ADMIN locked for limited admins), account status select |
| 47 | 2555-2581 | student_no | STUDENT professional fields: student_no, course, year_level |
| 48 | 2582-2610 | license_no | clinical staff fields (DOCTOR/DENTIST/NURSE/RESPONDER): license_no, specialty, department |
| 49 | 2611-2642 | admin_no | ADMIN fields: admin_no, specialty/scope, department |
| 50 | 2643-2764 | Admin archetype | admin archetype editor: super/limited toggle, permCatalog checkboxes; super-only, no self-modify |
| 51 | 2765-2846 | faculty_no | FACULTY fields (faculty_no, department, position); NON_TEACHING fields (employee_no, office) |
| 52 | 2847-2898 | is_qualified_responder | Qualified Responder card: RESPONDERS_MANAGE-gated checkbox, note, since; sos_via_role hint |
| 53 | 2899-3009 | Health record | Advanced HEALTH_PROFILES editor: blood type, sex, DOB, height/weight, BMI preview, contacts, allergies |
| 54 | 3010-3060 | integrity metadata | Advanced read-only metadata: account/health versions, timestamps, staff signature status |
| 55 | 3061-3139 | adminUserVaccines | vaccination card: adminUserVaccines badge list with remove, add-vaccine input + button |
| 56 | 3140-3229 | Password admin override | password override: limited-admin lockout notice vs Force reset form (handleAdminResetPassword) |
| 57 | 3230-3249 | Save profile changes | fieldset close; modalFeedback banner; Close and Save profile changes buttons (isSavingUser) |
| 58 | 3250-3282 | Role-specific fields | right info pane: per-role field descriptions (student, faculty, doctor, nurse, dentist, responder) |
| 59 | 3283-3287 | document.body | modal + portal close (document.body); root div close; component end |
