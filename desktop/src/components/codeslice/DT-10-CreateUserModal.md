# DT-10 · CreateUserModal.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-10 · desktop/src/components/CreateUserModal.tsx
**LOC:** 731 · **Anchor commit:** 4a14140 · **Role:** Admin create-user modal: role-specific fields, super/limited admin archetypes, permission codes, qualified-responder flag
**Mounted by:** AdminConsole (users tab)
**API surface:** GET /api/admin/permissions (L126), POST /api/admin/users (L194), PUT /api/admin/users/:id/qualified-responder (L230)
**Socket events:** none
**State / key fields:** identity: firstName, lastName, email, phone, password, showPassword, isActive, roleCode · role-specific: studentNo/course/yearLevel, facultyNo, employeeNo, licenseNo, adminNo, specialty/department/position · admin: adminArchetype(super/limited), adminPerms, permCatalog, callerIsSuper, callerPermCodes · qualified responder: qualifiedResponder, qrNote, callerCanQr · ui: isSaving, feedback

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-11 | CreateUserModalProps | imports (theme, api config, Icon); props isOpen/onClose/onCreated |
| 2 | 13-22 | ROLE_OPTIONS | ROLE_OPTIONS: 8 role codes STUDENT..ADMIN |
| 3 | 24-33 | ADMIN_PERMISSION_CATALOG | fallback permission catalog (6 codes; live server catalog wins when reachable) |
| 4 | 35-49 | generateSecurePassword | random 12-char password generator: charset picks + Fisher-Yates shuffle |
| 5 | 51-87 | export default function CreateUserModal | state: identity, credentials, access, role-specific, admin perms, responder flag, ui |
| 6 | 89-150 | admin/permissions | on-open state reset; GET /api/admin/permissions → live catalog + caller archetype |
| 7 | 152-162 | togglePerm | derived isAdminRole/grantableCodes/allSelected; togglePerm permission checkbox toggle |
| 8 | 164-189 | handleSubmit | validation: pw>=8, student/faculty numbers, super-only ADMIN creation, limited needs perms |
| 9 | 190-259 | qualified-responder | POST /api/admin/users payload; then PUT qualified-responder flag step; onCreated + auto-close |
| 10 | 261-272 | sectionLabel | style helpers fieldLabel/sectionLabel; showStaffFields role list |
| 11 | 274-298 | modal-backdrop | modal shell: header Create user account, close button, form open |
| 12 | 299-325 | Identity & contact | identity grid: first/last name, institutional email, phone |
| 13 | 327-371 | showPassword | temp password field: inline SVG eye/eye-off toggle, regenerate button, secure-channel hint |
| 14 | 373-410 | Assigned RBAC role | role select (ADMIN option disabled for non-super), account status Active/Suspended |
| 15 | 412-433 | Role-specific details | STUDENT block: student number, course, year level |
| 16 | 435-473 | Faculty number | FACULTY + NON_TEACHING blocks: id numbers, department, position |
| 17 | 475-513 | showStaffFields | clinical staff fields (PRC ID, specialty, dept) + ADMIN fields (adminNo, scope, dept) |
| 18 | 515-561 | Emergency response | Qualified Responder card: checkbox + note (150 chars), shown when callerCanQr |
| 19 | 563-694 | Admin archetype | super/limited archetype buttons; select-all; perm checkboxes locked beyond caller codes |
| 20 | 696-706 | feedback.text | success/error feedback banner |
| 21 | 708-731 | Create account | footer: Cancel / Create account submit (disabled while isSaving) |
