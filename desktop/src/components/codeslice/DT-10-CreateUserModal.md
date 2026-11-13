# DT-10 · CreateUserModal.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-10 · desktop/src/components/CreateUserModal.tsx
**LOC:** 743 · **Anchor commit:** 4a14140 · **Role:** Admin create-user modal: role-specific fields, super/limited admin archetypes, permission codes, qualified-responder flag
**Mounted by:** AdminConsole (users tab)
**API surface:** GET /api/admin/permissions (L126), POST /api/admin/users (L194), PUT /api/admin/users/:id/qualified-responder (L230)
**Socket events:** none
**State / key fields:** identity: firstName, lastName, email, phone, password, showPassword, isActive, roleCode · role-specific: studentNo/course/yearLevel, facultyNo, employeeNo, licenseNo, adminNo, specialty/department/position · admin: adminArchetype(super/limited), adminPerms, permCatalog, callerIsSuper, callerPermCodes · qualified responder: qualifiedResponder, qrNote, callerCanQr · ui: isSaving, feedback

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-11 | CreateUserModalProps | imports (theme, api config, Icon); props isOpen/onClose/onCreated |
| 2 | 13-22 | ROLE_OPTIONS | ROLE_OPTIONS: 8 role codes STUDENT..ADMIN |
| 3 | 24-34 | ADMIN_PERMISSION_CATALOG | fallback permission catalog including View incident records ( live server catalog wins when reachable) |
| 4 | 36-50 | generateSecurePassword | random 12-char password generator: charset picks + Fisher-Yates shuffle |
| 5 | 52-88 | export default function CreateUserModal | state: identity, credentials, access, role-specific, admin perms, responder flag, ui |
| 6 | 90-151 | admin/permissions | on-open state reset; GET /api/admin/permissions → live catalog + caller archetype |
| 7 | 153-163 | togglePerm | derived isAdminRole/grantableCodes/allSelected; togglePerm permission checkbox toggle |
| 8 | 165-190 | handleSubmit | validation: pw>=8, student/faculty numbers, super-only ADMIN creation, limited needs perms |
| 9 | 191-260 | qualified-responder | POST /api/admin/users payload; then PUT qualified-responder flag step; onCreated + auto-close |
| 10 | 262-273 | sectionLabel | style helpers fieldLabel/sectionLabel; showStaffFields role list |
| 11 | 275-299 | modal-backdrop | modal shell: header Create user account, close button, form open |
| 12 | 300-326 | Identity & contact | identity grid: first/last name, institutional email, phone |
| 13 | 328-372 | showPassword | temp password field: inline SVG eye/eye-off toggle, regenerate button, secure-channel hint |
| 14 | 374-411 | Assigned RBAC role | role select (ADMIN option disabled for non-super), account status Active/Suspended |
| 15 | 413-434 | Role-specific details | STUDENT block: student number, course, year level |
| 16 | 436-474 | Faculty number | FACULTY + NON_TEACHING blocks: id numbers, department, position |
| 17 | 476-514 | showStaffFields | clinical staff fields (PRC ID, specialty, dept) + ADMIN fields (adminNo, scope, dept) |
| 18 | 516-562 | Emergency response | Qualified Responder card: checkbox + note (150 chars), shown when callerCanQr |
| 19 | 564-695 | Admin archetype | super/limited archetype buttons; select-all; perm checkboxes locked beyond caller codes |
| 20 | 707-718 | feedback.text | success/error feedback banner |
| 21 | 719-743 | Create account | footer: Cancel / Create account submit (disabled while isSaving) |
