<!-- split from desktop/src/components/codeslice/DT-02-AdminConsole.md — part 02 of 02 -->
| 22 | 723-759 | admin_permissions | PUT users/:id/permissions (super-only, admin_permissions); refetch users + health; close modal |
| 23 | 760-787 | handleAdminResetPassword | handleAdminResetPassword: POST users/:id/reset-password (newPassword, min 8 chars) |
| 24 | 788-837 | fetchDbTables | fetchDbTables GET db/tables; fetchTableData GET db/tables/:table (page,limit,search); 300ms debounce effect |
| 25 | 838-878 | handleSaveDbRow | handleSaveDbRow: POST (insert) / PUT (update) db/tables/:table/rows with primaryKey + updates |
| 26 | 879-905 | handleDeleteDbRow | handleDeleteDbRow: DELETE db/tables/:table/rows with confirm; refetch current page |
| 27 | 906-1053 | activeUsersCount | Page header, Super Admin-gated ServerPolicyPanel mount, and Active/Archived account tabs. |
| 28 | 1042-1053 | Add account | USERS tab gate USERS_MANAGE; search input, account counters, Add account button (opens CreateUserModal) |
| 29 | 1054-1153 | admin-user-filterbar | Compact icon-led role/status groups and Qualified responders, evenly spaced on one row; sort control below |
| 30 | 1154-1435 | processedUsers.map | Active users table: QR + SUPER/LIMITED pills, status, Edit/View and permission-gated Archive actions; archived-account search, result count and table |
| 31 | 1436-1450 | auditSubTab | AUDIT tab gate AUDIT_VIEW; PHI access vs SHA-256 mutation ledger sub-tab pills (auditSubTab) |
| 32 | 1457-1595 | phiSearchTerm | PHI sub-tab: RA 10173 banner, phiSearchTerm/table/role filters with role icons, access-date and patient-name sorts, access-log table |
| 33 | 1596-1725 | mutationSearchTerm | mutation ledger sub-tab: hash-chain banner, search+action filters, created-date sorting, table with SHA-256 hash and timestamps |
| 34 | 1726-1808 | Socket.IO gateway | TELEMETRY gate; KPI cards: MySQL, Redis, Socket.IO gateway, hash-chain ledger (telemetry data) |
| 35 | 1809-1895 | ServerPingMonitor | ServerPingMonitor embed; retention governance header + stats grid (consents, encounters, past period) |
| 36 | 1896-1947 | Sweep outcome | retention breakdown table (EMR, appointments, prescriptions); Enforce sweep button; fallback panel |
| 37 | 1948-1959 | AnalyticsDashboard | analytics tab gate ANALYTICS_VIEW mounts AnalyticsDashboard; incidents tab mounts IncidentRecords |
| 38 | 1960-2006 | DATABASE_MANAGE | DB Studio gate DATABASE_MANAGE; header bar with table count and read-only badge (audit/security) |
| 39 | 2007-2132 | System tables | table-list sidebar (System tables); click selects table and refetches with cleared search |
| 40 | 2133-2181 | Insert row | data grid toolbar: record count, dbSearchFilter input, refresh, Insert row button (empty-row modal) |
| 41 | 2182-2259 | tableRows.map | data grid table: schema header with PK icons, AES-256 encrypted badges, NULL/JSON cells, row actions |
| 42 | 2260-2328 | Prev | pagination Prev/Next + page counts; footer note; CreateUserModal mount (onCreated refetches users) |
| 43 | 2329-2393 | handleSaveDbRow | DB row modal: direct-write warning, per-column inputs, PK read-only, Commit to database submit |
| 44 | 2394-2463 | admin-profile-editor | profile editor modal shell (createPortal); protected-admin banner; Basic/Advanced mode toggle |
| 45 | 2464-2530 | Identity & contact | form + disabled fieldset (protected admins); identity and contact inputs (name, email, phone) |
| 46 | 2531-2579 | Assigned RBAC role | access and status: role select (ADMIN locked for limited admins), account status select |
| 47 | 2580-2617 | student_no | STUDENT professional fields: student_no, course, year_level |
| 48 | 2618-2646 | license_no | clinical staff fields (DOCTOR/DENTIST/NURSE/RESPONDER): license_no, specialty, department |
| 49 | 2647-2678 | admin_no | ADMIN fields: admin_no, specialty/scope, department |
| 50 | 2679-2800 | Admin archetype | admin archetype editor: super/limited toggle, permCatalog checkboxes; super-only, no self-modify |
| 51 | 2801-2882 | faculty_no | FACULTY fields (faculty_no, department, position); NON_TEACHING fields (employee_no, office) |
| 52 | 2883-2943 | is_qualified_responder | Qualified Responder card: RESPONDERS_MANAGE-gated checkbox, note, since; sos_via_role hint |
| 53 | 2944-3053 | Health record | Advanced HEALTH_PROFILES editor: blood type, sex, DOB, height/weight, BMI preview, contacts, allergies |
| 54 | 3054-3096 | integrity metadata | Advanced read-only metadata: account/health versions, timestamps, staff signature status |
| 55 | 3097-3175 | adminUserVaccines | vaccination card: adminUserVaccines badge list with remove, add-vaccine input + button |
| 56 | 3176-3265 | Password admin override | password override: limited-admin lockout notice vs Force reset form (handleAdminResetPassword) |
| 57 | 3266-3285 | Save profile changes | fieldset close; modalFeedback banner; Close and Save profile changes buttons (isSavingUser) |
| 58 | 3286-3318 | Role-specific fields | right info pane: per-role field descriptions (student, faculty, doctor, nurse, dentist, responder) |
| 59 | 3319-3332 | document.body | modal + portal close (document.body); root div close; component end |
