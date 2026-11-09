<!-- split from desktop/src/components/codeslice/DT-02-AdminConsole.md — part 02 of 02 -->
| 22 | 684-720 | admin_permissions | PUT users/:id/permissions (super-only, admin_permissions); refetch users + health; close modal |
| 23 | 721-748 | handleAdminResetPassword | handleAdminResetPassword: POST users/:id/reset-password (newPassword, min 8 chars) |
| 24 | 749-798 | fetchDbTables | fetchDbTables GET db/tables; fetchTableData GET db/tables/:table (page,limit,search); 300ms debounce effect |
| 25 | 799-839 | handleSaveDbRow | handleSaveDbRow: POST (insert) / PUT (update) db/tables/:table/rows with primaryKey + updates |
| 26 | 840-866 | handleDeleteDbRow | handleDeleteDbRow: DELETE db/tables/:table/rows with confirm; refetch current page |
| 27 | 867-955 | activeUsersCount | render start; page header with per-tab title and subtitle (users, audit, telemetry, analytics, db) |
| 28 | 956-1037 | Add account | USERS tab gate USERS_MANAGE; search input, account counters, Add account button (opens CreateUserModal) |
| 29 | 1038-1076 | userSortKey | role filter chips, status chips, Qualified responders QR-only chip, userSortKey select |
| 30 | 1077-1257 | processedUsers.map | users table: QR + SUPER/LIMITED archetype pills, status pill, Edit/View and permission-gated Archive actions; feedback and empty state |
| 31 | 1258-1295 | auditSubTab | AUDIT tab gate AUDIT_VIEW; PHI access vs SHA-256 mutation ledger sub-tab pills (auditSubTab) |
| 32 | 1296-1436 | phiSearchTerm | PHI sub-tab: RA 10173 banner, phiSearchTerm/table/role filters, access-log table (viewer, patient, IP) |
| 33 | 1437-1570 | mutationSearchTerm | mutation ledger sub-tab: hash-chain banner, search+action filters, table with SHA-256 hash, timestamps |
| 34 | 1571-1626 | Socket.IO gateway | TELEMETRY gate; KPI cards: MySQL, Redis, Socket.IO gateway, hash-chain ledger (telemetry data) |
| 35 | 1627-1713 | ServerPingMonitor | ServerPingMonitor embed; retention governance header + stats grid (consents, encounters, past period) |
| 36 | 1714-1766 | Sweep outcome | retention breakdown table (EMR, appointments, prescriptions); Enforce sweep button; fallback panel |
| 37 | 1767-1776 | AnalyticsDashboard | analytics tab gate ANALYTICS_VIEW mounts AnalyticsDashboard; incidents tab mounts IncidentRecords |
| 38 | 1777-1824 | DATABASE_MANAGE | DB Studio gate DATABASE_MANAGE; header bar with table count and read-only badge (audit/security) |
| 39 | 1825-1950 | System tables | table-list sidebar (System tables); click selects table and refetches with cleared search |
| 40 | 1951-1999 | Insert row | data grid toolbar: record count, dbSearchFilter input, refresh, Insert row button (empty-row modal) |
| 41 | 2000-2077 | tableRows.map | data grid table: schema header with PK icons, AES-256 encrypted badges, NULL/JSON cells, row actions |
| 42 | 2078-2146 | Prev | pagination Prev/Next + page counts; footer note; CreateUserModal mount (onCreated refetches users) |
| 43 | 2147-2211 | handleSaveDbRow | DB row modal: direct-write warning, per-column inputs, PK read-only, Commit to database submit |
| 44 | 2212-2281 | admin-profile-editor | profile editor modal shell (createPortal); protected-admin banner; Basic/Advanced mode toggle |
| 45 | 2282-2348 | Identity & contact | form + disabled fieldset (protected admins); identity and contact inputs (name, email, phone) |
| 46 | 2349-2408 | Assigned RBAC role | access and status: role select (ADMIN locked for limited admins), account status select |
| 47 | 2409-2435 | student_no | STUDENT professional fields: student_no, course, year_level |
| 48 | 2436-2464 | license_no | clinical staff fields (DOCTOR/DENTIST/NURSE/RESPONDER): license_no, specialty, department |
| 49 | 2465-2496 | admin_no | ADMIN fields: admin_no, specialty/scope, department |
| 50 | 2497-2618 | Admin archetype | admin archetype editor: super/limited toggle, permCatalog checkboxes; super-only, no self-modify |
| 51 | 2619-2700 | faculty_no | FACULTY fields (faculty_no, department, position); NON_TEACHING fields (employee_no, office) |
| 52 | 2701-2752 | is_qualified_responder | Qualified Responder card: RESPONDERS_MANAGE-gated checkbox, note, since; sos_via_role hint |
| 53 | 2753-2863 | Health record | Advanced HEALTH_PROFILES editor: blood type, sex, DOB, height/weight, BMI preview, contacts, allergies |
| 54 | 2864-2914 | integrity metadata | Advanced read-only metadata: account/health versions, timestamps, staff signature status |
| 55 | 2915-2993 | adminUserVaccines | vaccination card: adminUserVaccines badge list with remove, add-vaccine input + button |
| 56 | 2994-3083 | Password admin override | password override: limited-admin lockout notice vs Force reset form (handleAdminResetPassword) |
| 57 | 3084-3103 | Save profile changes | fieldset close; modalFeedback banner; Close and Save profile changes buttons (isSavingUser) |
| 58 | 3104-3136 | Role-specific fields | right info pane: per-role field descriptions (student, faculty, doctor, nurse, dentist, responder) |
| 59 | 3137-3141 | document.body | modal + portal close (document.body); root div close; component end |
