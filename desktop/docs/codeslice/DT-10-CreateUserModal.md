# DT-10 · CreateUserModal.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/docs/codeslice .`

## DT-10 · desktop/src/features/admin/CreateUserModal.tsx
**LOC:** 716 · **Anchor commit:** `7233f1e` plus working-tree changes · **Role:** Admin create-user modal: role-specific fields, super/limited admin archetypes, permission codes, qualification workflow pointer
**Mounted by:** AdminConsole (users tab)
**API surface:** GET /api/admin/permissions (L143), POST /api/admin/users (L218)
**Socket events:** none
**State / key fields:** identity: firstName, lastName, email, phone, password, showPassword, isActive, roleCode · role-specific: studentNo/course/yearLevel, facultyNo, employeeNo, licenseNo, adminNo, specialty/department/position · campus: healthProfile · admin: adminArchetype(super/limited), adminPerms, permCatalog, callerIsSuper, callerPermCodes · ui: isSaving, feedback

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-20 | CreateUserModalProps | imports (theme, api config, Icon); props isOpen/onClose/onCreated |
| 2 | 21-33 | ROLE_OPTIONS | ROLE_OPTIONS: 8 role codes STUDENT..ADMIN |
| 3 | 34-49 | ADMIN_PERMISSION_CATALOG | fallback permission catalog includes scoped analytics, incident records, and Terminal access |
| 4 | 50-65 | generateSecurePassword | random 12-char password generator: charset picks + Fisher-Yates shuffle |
| 5 | 66-135 | export default function CreateUserModal | state: identity, credentials, access, role-specific, admin perms, responder flag, ui |
| 6 | 136-168 | admin/permissions | on-open state reset; GET /api/admin/permissions → live catalog + caller archetype |
| 7 | 169-174 | togglePerm | derived isAdminRole/grantableCodes/allSelected; togglePerm permission checkbox toggle |
| 8 | 175-239 | handleSubmit | validation: pw>=8, student/faculty numbers, super-only ADMIN creation, limited needs perms |
| 9 | 240-253 | onCreated | POST /api/admin/users payload; onCreated reports the result inline and closes the dialog |
| 10 | 254-262 | sectionLabel | style helpers fieldLabel/sectionLabel; showStaffFields role list |
| 11 | 263-288 | <Dialog | Dialog shell: stationary header, close button, form and single scrolling body |
| 12 | 289-322 | Identity & contact | identity grid: first/last name, institutional email, phone |
| 13 | 323-375 | showPassword | temp password field: inline SVG eye/eye-off toggle, regenerate button, secure-channel hint |
| 14 | 376-410 | Assigned RBAC role | role select (ADMIN option disabled for non-super), account status Active/Suspended |
| 15 | 411-435 | Role-specific details | STUDENT block: student number, course, year level |
| 16 | 436-474 | Faculty number | FACULTY + NON_TEACHING blocks: id numbers, department, position |
| 17 | 475-507 | Health profile (optional) | Optional sex, birth date and emergency contact inputs for campus accounts |
| 18 | 508-547 | showStaffFields | clinical staff fields (PRC ID, specialty, dept) + ADMIN fields (adminNo, scope, dept) |
| 19 | 548-549 | Responder access requires | Read-only pointer to the clinic qualification workflow |
| 20 | 550-681 | Admin archetype | Theme-aware super/limited buttons and permission cards; select-all; checkboxes locked beyond caller codes |
| 21 | 682-695 | feedback.text | success/error feedback banner |
| 22 | 696-716 | Create account | Separate footer below the scroll body: Cancel / Create account submit (disabled while isSaving) |
