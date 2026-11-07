# desktop/src/components/AGENTS.md — component map & navigation anchors

Flat folder: one component per file, header comment `// desktop/src/components/<Name>.tsx`. All line anchors below are for commit **b7556cb** — after edits, re-derive with `rg -n "<symbol>" <File>.tsx` instead of trusting stale numbers.

**Never open a file >1k lines whole.** Use the anchors: read a ±40-line window around the line you need.

## Universal patterns (copy these; don't invent variants)

- Auth: `const token = localStorage.getItem('valetudo_token')` → `headers: { Authorization: \`Bearer ${token}\` }`. App.tsx sets the key at login (L575) and clears both `valetudo_token` + `token` at logout (L125-126).
- Base URL: `import { API_BASE_URL, SOCKET_URL } from '../config/api'` — never hardcode a host.
- HTTP: plain `fetch()` with manual `res.ok` / status-code checks; JSON via `JSON.stringify`. No axios, no react-query.
- Sockets: each realtime component opens its **own** `io(SOCKET_URL, { auth: { token } })` inside a `useEffect` and disconnects on cleanup (canonical pattern: DoctorConsole L351-374). New client-side event names need a matching server `io.emit(...)` in `server/src/routes/*` or `utils/reminderWorker.js`.
- Icons: `<Icon name tone />` only — the name registry is `IconNames` (Icon.tsx L124). Add new glyphs there, not inline SVG.
- Styling: inline `style` objects + tokens from `../theme`; `index.css` (~48 KB) is globals only.
- Role-gated UI here is cosmetic — the server enforces RBAC on every route. Never treat client checks as security.

## Mount graph (who renders what)

```
App.tsx ─ NURSE→NurseConsole · DOCTOR/DENTIST→DoctorConsole · ADMIN→AdminConsole · EMERGENCY_RESPONDER→ResponderConsole
NurseConsole    → QrIntakeScanner (L1104) · InventoryManager (L410, inventory view)
DoctorConsole   → AnalyticsDashboard (L1341) · PrescriptionGenerator (L2507) · SignatureEnrollment (L4263) · EmergencyAlertBanner (SOS banner, mounted for DOCTOR+DENTIST after the signature warning L1273) · embedded odontogram (L2079)
AdminConsole    → CreateUserModal (L1958) · ServerPingMonitor (L1450) · AnalyticsDashboard (analytics tab L1590)
PrescriptionGenerator → InteractionWarning (L829)
SignatureEnrollment   → SignaturePad
```

**Not mounted (don't build on them):** `DentalChart.tsx` (DoctorConsole embeds its own chart at L2079), `VaccinationInputter.tsx` (**0 bytes, empty, unreferenced — delete or implement**). `EmergencyAlertBanner.tsx` IS now mounted (DoctorConsole) — it self-hides via 403 on `/api/emergency/active` for accounts the server does not consider responders.

## Consoles

### DoctorConsole.tsx — 4,366 lines. Consultations, EMR, e-Rx, clearances, immunizations, analytics
- Exports: `ToothCondition` L13, `ToothRecord` L21, `DoctorViewMode` L27 (`'active'|'scheduled'|'history'|'archive'|'analytics'`), component L178.
- Sockets L351-374: `appointment:booked`, `appointment:status_changed`, `queue:updated`, `appointment:cancelled`.
- Queue & consult: `fetchAppointments` L308 (`GET /api/appointments/today?filter=active|history|scheduled` L312-314), `handleConflict` L376, `selectPatient` L407, `handleStartConsultation` L557 (status → in-progress L562), `handleFinishConsultation` L588 (complete L643 + EMR + attachments upload L662).
- Patient data: attachments L465 + download L507, history L469/L722/L854, patient search L816 (`/api/appointments/patients/search?query=`).
- Rx/clearance: rx history L752 (`/api/documents/prescriptions/patient/:id`), clearance history L788, print clearance L1085 (`POST /api/documents/clearances`).
- Immunizations: open modal L883, quick-add L928, custom L940, remove L961, save L965 (`GET/POST /api/profile/patient/:id/immunizations` L895/L976).
- PDFs: `handleDownloadPdf` L1009, `openIssuedPdf` L1051 (`GET /api/documents/:kind/:id/pdf`).
- BMI: consult form computes `bmi`/`bmiCategory` client-side from height/weight; header also shows appointment-supplied `bmi`/`bmi_category`.
- Render anchors: page header L1172 · queue grid L1198 · analytics L1341 · archive/EMR directory L1344 · active/scheduled/history lists L1703 · labs & attachment preview L1997 · interactive odontogram L2079 · rx history modal L3085 · clearance history modal L3308 · EMR history modal L3500 · signature enroll L4239.

### AdminConsole.tsx — 3,045 lines. Users, audit, telemetry, analytics, DB Studio
- Exports: `AdminTab` L83 (`'users'|'audit'|'telemetry'|'analytics'|'db'`), component L92. Props `activeTab`/`onTabChange` (App.tsx).
- Permission gate: `fetchMyPermissions` L179 (`GET /api/admin/my-permissions`) → `can(code)` L214; every tab renders `NoPermissionPanel` without its code (`USERS_MANAGE`, `AUDIT_VIEW`, `TELEMETRY_VIEW`/`RETENTION_MANAGE`, `ANALYTICS_VIEW`, `DATABASE_MANAGE`).
- Users tab L805: list `fetchUsers` L174 (now also returns `is_qualified_responder`, `qualified_responder_since`, `qualified_responder_note`, `sos_via_role`), edit modal `handleOpenEditModal` L400, save profile L530 (identity + sub-profile + immunizations + optional `health_profile`), reset password L680. Filter chips include a Qualified-Responders toggle (`userQrOnly`).
- Edit modal has a **Basic/Advanced switch** (toggle L2076): Basic = the everyday fields. Advanced lazily fetches `GET /api/admin/users/:id/health-profile` (`fetchEditHealthProfile` L463, switch handler L508) and renders EVERY HEALTH_PROFILES column — sex, date of birth, blood type, height/weight, live BMI preview (generated column, read-only), encrypted allergies/chronic-conditions textareas, emergency contacts (section L2481) — plus read-only account/signature metadata (L2592). `health_profile` is only sent on save when Advanced was loaded; Basic saves never touch the health record.
- **Qualified Responder section (Basic tab, every role) L2574**: toggle + note (≤150) + read-only since-date. Disabled without `RESPONDERS_MANAGE`, or for ADMIN targets unless the caller is a Super Admin. `sos_via_role` renders an "also receives SOS through role X" hint. On save, flag/note diffs (snapshot `editQrOriginal` L136) call `PUT /api/admin/users/:id/qualified-responder` as a separate partial-success step (`qrWarning`), exactly like permissions.
- Audit tab: mutation logs L240, PHI access logs L252, retention L264, sweep `handleExecuteSweep` L284 (`POST /api/privacy/retention/sweep`).
- Telemetry tab: telemetry L274. Analytics tab L1590 → `AnalyticsDashboard`. DB Studio tab L1595: tables L660/L679, save row L710, delete row L751 (writes to arbitrary tables — `DATABASE_MANAGE` protected; keep it that way).
### NurseConsole.tsx — 1,520 lines / 52 KB / 17 useState. Triage queue, expected, intake, live metrics
- Exports: `NurseViewMode` L72 (`'triage'|'expected'|'inventory'`), component L79. App.tsx owns the mode (L486; tab bar L164-166) — `viewMode` prop is controlled, falls back to internal state.
- Live stat row: queue L144 (`GET /api/appointments/queue/today`), active SOS count L160, no-shows today L214, inventory metrics L227 (`GET /api/inventory/dashboard-summary`), expected today L249.
- Sockets L270-311: `queue:updated`, `emergency:new_alert`, `emergency:status_change`, `inventory:updated`, `appointment:status_changed`, `appointment:booked` — each triggers a targeted refetch.
- Actions: `updateSosStatus` L177, `callNextPatient` L324, check-in confirm L346 / execute L371 (`POST /api/appointments/:id/checkin`).
- Views: `inventory` → renders `InventoryManager` L410; `expected` L413; SOS panel L926; `QrIntakeScanner` embedded L1104.

### ResponderConsole.tsx — 490 lines / 20 KB. SOS list & dispatch
- Poll `fetchAlerts` L28 (`GET /api/emergency/active`) + sockets `emergency:new_alert` L53, `emergency:status_change` L64. Alarm `playEmergencyAlarm` L13 (WebAudio).
- `updateStatus` L84 (`PATCH /api/emergency/:id/status`), test hooks L109/L121 (`POST /api/emergency/sos`), `statusStyle` L143.

## Feature components

### InventoryManager.tsx — 1,456 lines / 60 KB / 32 useState. Stock movements & medicine CRUD
- Loads: batches L105, medicines L115, reorder-suggestions + expiring-soon L129, movement logs L141. Socket `inventory:updated` L160 → refetch (server emits it on every deduct/receive/adjust).
- Barcode: `processScannedCode` L179, `handleBarcodeSubmit` L250. Movements: deduct L270, receive L306, adjust L338. CRUD: create medicine L386, delete L444 (`DELETE /api/inventory/medicines/:id`).

### QrIntakeScanner.tsx — 1,437 lines / 50 KB / 21 useState. Patient intake
- Props: `onPatientVerified(patient, token)` — hands verified patients to NurseConsole.
- Flow: active-ticket check L102 → health-pass verify L123 (`POST /api/health-pass/verify`) → manual search L165 (`/api/appointments/lookup`) → appointment check L239 → confirm arrival L258 (checkin) → walk-in register L297.
- Camera via jsQR: `startCamera` L338, `tickScan` L371, QR image upload L395.

### PrescriptionGenerator.tsx — 1,063 lines / 36 KB / 18 useState. e-Prescription form
- Props: `patientUserId`, `appointmentId?`, `verifiedPatient {first_name,last_name,student_no,course,allergies,date_of_birth?,age?,sex?}`, `initialNotes?`, `isArchived?`, `onPrescriptionIssued?`, `onPrescriptionError?`.
- Medicine catalog L332 (`GET /api/inventory/medicines`); `handleSelectMedicine` L383 auto-fills dosage from `strength`; `rxMode` `inventory|outside` (L392) — outside mode dosage defaults to "As per packaging"; expiry `getExpiresAtDate` L306; save+print L404 → `POST /api/documents/prescriptions` L435. Drug-interaction banner via `InteractionWarning` L829.

### AnalyticsDashboard.tsx — 1,349 lines / 42 KB. Read-only dashboards + exports
- `GET /api/analytics/summary` L594 (`fetchAnalytics` L590); exports: xlsx L610, PDF L630, excel L650, server-rendered PDF L670.
- `SvgVerticalBarChart` L267 (`niceAxisStep` L258): adaptive top-diagnoses chart — renders EVERY distinct diagnosis the server returns (the dashboard endpoint no longer slices to a top-5). Slot-width tiers (92/28/22/16 px per bar), label tiers (horizontal → -45° → -90° with every-kth thinning above 90 bars), value pills only when bars ≥ 24 px, `<title>` tooltips always, nice integer y-axis (≤ 6 gridlines), and the card scrolls sideways once the canvas exceeds 900 px.
### CreateUserModal.tsx — 726 lines. Create account (+ optional Qualified Responder label)
- Permission catalog L118, submit L164 → `POST /api/admin/users` L186 (returns `userId`). `togglePerm` L150.
- Qualified Responder section L511 (shown only when `callerCanQr` L84 — Super Admin or `RESPONDERS_MANAGE`): checkbox + note; on success it calls `PUT /api/admin/users/:userId/qualified-responder` L228 as a second step and reports its failure separately (partial success).

### SignatureEnrollment.tsx — 118 lines. Doctor signature enroll/renew
- Status L23, image L27, save L46 (`/api/signature/me*`). Uses `SignaturePad`.

## Primitives & shared

- `Icon.tsx` (367 lines) — `IconTone` L49, `IconProps` L53, `Icon` L84, **`IconNames` registry L124**, `IconName` L366. All iconography flows through this.
- `PasswordStrengthIndicator.tsx` (181 lines) — exports **pure** `evaluatePassword` L24; must stay in sync with `server/src/utils/passwordPolicy.js` (mirrors it for UX only; server re-validates).
- `InteractionWarning.tsx` (169 lines) — presentational severity banner; no logic.
- `ServerPingMonitor.tsx` (217 lines) — status chip fed by `hooks/useServerPing` (polls `GET /api/ping`); no API of its own.
- `SignaturePad.tsx` (142 lines) — `forwardRef` wrapper over `signature_pad`; imperative handle `SignaturePadHandle` L8 (clear/export). No API.
- `DentalChart.tsx` (162 lines) — standalone odontogram, currently unreferenced (DoctorConsole L2079 has the live one).

## Rules

- Reuse `Icon`, theme tokens, `InteractionWarning`, `SignaturePad`, `evaluatePassword` — don't duplicate.
- New logic goes into a NEW file here (or `services/`), not into the 1.5-4k-line consoles.
- Every fetch keeps its Bearer header + error handling; every socket keeps its cleanup.
- After adding an endpoint call, check it exists in `server/src/routes/` (map in `server/AGENTS.md`).
