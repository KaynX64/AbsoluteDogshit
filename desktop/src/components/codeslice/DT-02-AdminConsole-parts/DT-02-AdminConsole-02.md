<!-- split from desktop/src/components/codeslice/DT-02-AdminConsole.md — part 02 of 02 -->
| 22 | 715-751 | admin_permissions | PUT users/:id/permissions (super-only, admin_permissions); refetch users + health; close modal |
| 23 | 752-779 | handleAdminResetPassword | handleAdminResetPassword: POST users/:id/reset-password (newPassword, min 8 chars) |
| 24 | 780-829 | fetchDbTables | fetchDbTables GET db/tables; fetchTableData GET db/tables/:table (page,limit,search); 300ms debounce effect |
| 25 | 830-870 | handleSaveDbRow | handleSaveDbRow: POST (insert) / PUT (update) db/tables/:table/rows with primaryKey + updates |
| 26 | 871-897 | handleDeleteDbRow | handleDeleteDbRow: DELETE db/tables/:table/rows with confirm; refetch current page |
| 27 | 898-1029 | activeUsersCount | render start; page header and Active accounts/Archived accounts tab strip |
| 28 | 1030-1111 | Add account | USERS tab gate USERS_MANAGE; search input, account counters, Add account button (opens CreateUserModal) |
| 29 | 1112-1150 | userSortKey | role filter chips, status chips, Qualified responders QR-only chip, userSortKey select |
| 30 | 1151-1398 | processedUsers.map | Active users table: QR + SUPER/LIMITED pills, status, Edit/View and permission-gated Archive actions; archived-account table with loading/error/empty states |
| 31 | 1399-1436 | auditSubTab | AUDIT tab gate AUDIT_VIEW; PHI access vs SHA-256 mutation ledger sub-tab pills (auditSubTab) |
| 32 | 1437-1577 | phiSearchTerm | PHI sub-tab: RA 10173 banner, phiSearchTerm/table/role filters, access-log table (viewer, patient, IP) |
| 33 | 1578-1711 | mutationSearchTerm | mutation ledger sub-tab: hash-chain banner, search+action filters, table with SHA-256 hash, timestamps |
| 34 | 1712-1767 | Socket.IO gateway | TELEMETRY gate; KPI cards: MySQL, Redis, Socket.IO gateway, hash-chain ledger (telemetry data) |
| 35 | 1768-1854 | ServerPingMonitor | ServerPingMonitor embed; retention governance header + stats grid (consents, encounters, past period) |
| 36 | 1855-1907 | Sweep outcome | retention breakdown table (EMR, appointments, prescriptions); Enforce sweep button; fallback panel |
| 37 | 1908-1917 | AnalyticsDashboard | analytics tab gate ANALYTICS_VIEW mounts AnalyticsDashboard; incidents tab mounts IncidentRecords |
| 38 | 1918-1965 | DATABASE_MANAGE | DB Studio gate DATABASE_MANAGE; header bar with table count and read-only badge (audit/security) |
| 39 | 1966-2091 | System tables | table-list sidebar (System tables); click selects table and refetches with cleared search |
| 40 | 2092-2140 | Insert row | data grid toolbar: record count, dbSearchFilter input, refresh, Insert row button (empty-row modal) |
| 41 | 2141-2218 | tableRows.map | data grid table: schema header with PK icons, AES-256 encrypted badges, NULL/JSON cells, row actions |
| 42 | 2219-2287 | Prev | pagination Prev/Next + page counts; footer note; CreateUserModal mount (onCreated refetches users) |
| 43 | 2288-2352 | handleSaveDbRow | DB row modal: direct-write warning, per-column inputs, PK read-only, Commit to database submit |
| 44 | 2353-2422 | admin-profile-editor | profile editor modal shell (createPortal); protected-admin banner; Basic/Advanced mode toggle |
| 45 | 2423-2489 | Identity & contact | form + disabled fieldset (protected admins); identity and contact inputs (name, email, phone) |
| 46 | 2490-2549 | Assigned RBAC role | access and status: role select (ADMIN locked for limited admins), account status select |
| 47 | 2550-2576 | student_no | STUDENT professional fields: student_no, course, year_level |
| 48 | 2577-2605 | license_no | clinical staff fields (DOCTOR/DENTIST/NURSE/RESPONDER): license_no, specialty, department |
| 49 | 2606-2637 | admin_no | ADMIN fields: admin_no, specialty/scope, department |
| 50 | 2638-2759 | Admin archetype | admin archetype editor: super/limited toggle, permCatalog checkboxes; super-only, no self-modify |
| 51 | 2760-2841 | faculty_no | FACULTY fields (faculty_no, department, position); NON_TEACHING fields (employee_no, office) |
| 52 | 2842-2893 | is_qualified_responder | Qualified Responder card: RESPONDERS_MANAGE-gated checkbox, note, since; sos_via_role hint |
| 53 | 2894-3004 | Health record | Advanced HEALTH_PROFILES editor: blood type, sex, DOB, height/weight, BMI preview, contacts, allergies |
| 54 | 3005-3055 | integrity metadata | Advanced read-only metadata: account/health versions, timestamps, staff signature status |
| 55 | 3056-3134 | adminUserVaccines | vaccination card: adminUserVaccines badge list with remove, add-vaccine input + button |
| 56 | 3135-3224 | Password admin override | password override: limited-admin lockout notice vs Force reset form (handleAdminResetPassword) |
| 57 | 3225-3244 | Save profile changes | fieldset close; modalFeedback banner; Close and Save profile changes buttons (isSavingUser) |
| 58 | 3245-3277 | Role-specific fields | right info pane: per-role field descriptions (student, faculty, doctor, nurse, dentist, responder) |
| 59 | 3278-3282 | document.body | modal + portal close (document.body); root div close; component end |
