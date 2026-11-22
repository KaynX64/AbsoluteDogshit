# DT-10 · CreateUserModal.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/docs/codeslice .`

## DT-10 · desktop/src/features/admin/CreateUserModal.tsx
**LOC:** 791 · **Anchor commit:** working tree · **Role:** Admin create-user modal: role-specific fields, super/limited admin archetypes, permission codes, qualified-responder flag
**Mounted by:** AdminConsole (users tab)
**API surface:** GET /api/admin/permissions (L143), POST /api/admin/users (L218), PUT /api/admin/users/:id/qualified-responder (L255)
**Socket events:** none
**State / key fields:** identity: firstName, lastName, email, phone, password, showPassword, isActive, roleCode · role-specific: studentNo/course/yearLevel, facultyNo, employeeNo, licenseNo, adminNo, specialty/department/position · campus: healthProfile · admin: adminArchetype(super/limited), adminPerms, permCatalog, callerIsSuper, callerPermCodes · qualified responder: qualifiedResponder, qrNote, callerCanQr · ui: isSaving, feedback

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-20 | CreateUserModalProps | imports (theme, api config, Icon); props isOpen/onClose/onCreated |
| 2 | 21-31 | ROLE_OPTIONS | ROLE_OPTIONS: 8 role codes STUDENT..ADMIN |
| 3 | 32-49 | ADMIN_PERMISSION_CATALOG | fallback permission catalog includes scoped analytics, incident records, and Terminal access |
| 4 | 50-65 | generateSecurePassword | random 12-char password generator: charset picks + Fisher-Yates shuffle |
| 5 | 66-104 | export default function CreateUserModal | state: identity, credentials, access, role-specific, admin perms, responder flag, ui |
| 6 | 105-168 | admin/permissions | on-open state reset; GET /api/admin/permissions → live catalog + caller archetype |
| 7 | 169-181 | togglePerm | derived isAdminRole/grantableCodes/allSelected; togglePerm permission checkbox toggle |
| 8 | 182-209 | handleSubmit | validation: pw>=8, student/faculty numbers, super-only ADMIN creation, limited needs perms |
| 9 | 210-279 | qualified-responder | POST /api/admin/users payload; then PUT qualified-responder flag step; onCreated reports the result inline and closes the dialog |
| 10 | 280-293 | sectionLabel | style helpers fieldLabel/sectionLabel; showStaffFields role list |
| 11 | 294-317 | <Dialog | modal shell: header Create user account, close button, form open |
| 12 | 318-346 | Identity & contact | identity grid: first/last name, institutional email, phone |
| 13 | 347-401 | showPassword | temp password field: inline SVG eye/eye-off toggle, regenerate button, secure-channel hint |
| 14 | 402-440 | Assigned RBAC role | role select (ADMIN option disabled for non-super), account status Active/Suspended |
| 15 | 441-462 | Role-specific details | STUDENT block: student number, course, year level |
| 16 | 463-502 | Faculty number | FACULTY + NON_TEACHING blocks: id numbers, department, position |
| 17 | 503-537 | Health profile (optional) | Optional sex, birth date and emergency contact inputs for campus accounts |
| 18 | 538-577 | showStaffFields | clinical staff fields (PRC ID, specialty, dept) + ADMIN fields (adminNo, scope, dept) |
| 19 | 578-625 | Emergency response | Qualified Responder card: checkbox + note (150 chars), shown when callerCanQr |
| 20 | 626-758 | Admin archetype | super/limited archetype buttons; select-all; perm checkboxes locked beyond caller codes |
| 21 | 759-770 | feedback.text | success/error feedback banner |
| 22 | 771-791 | Create account | footer: Cancel / Create account submit (disabled while isSaving) |
