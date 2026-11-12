<!-- split from desktop/src/components/AGENTS.md — part 04 of 04 -->

### PrescriptionGenerator.tsx — e-Prescription form
- **Slice map:** `codeslice/DT-07-PrescriptionGenerator.md` has the current line ranges.
- Props: `patientUserId`, `appointmentId?`, `verifiedPatient {first_name,last_name,student_no,course,allergies,date_of_birth?,age?,sex?}`, `initialNotes?`, `isArchived?`, `onPrescriptionIssued?`, `onPrescriptionError?`.
- The selected catalog entry supplies the read-only Dosage, Dosage Type, and Generic active ingredient from `strength`, `form`, and `generic_name`. Outside pharmacy prescriptions retain manual dosage. `handleSaveAndPrintPrescription` reviews the draft and posts to `/api/documents/prescriptions` after stock and interaction checks.

### AnalyticsDashboard.tsx — read-only dashboard and exports
- **Slice map:** `codeslice/DT-06-AnalyticsDashboard.md`.
- Overview, Clinical Activity, Campus Health, and Pharmacy share one summary response. The dashboard preserves the last successful response during transient refresh failures. The diagnosis chart shows ten categories, with searchable and paginated access to all returned categories.
- Excel and PDF use the server export endpoints. Print dashboard renders all sections from the current snapshot. Shared chart and table components, sections, and scoped styles live in `analytics/`.
### CreateUserModal.tsx — 726 lines. Create account (+ optional Qualified Responder label)
- **Slice map:** `codeslice/DT-10-CreateUserModal.md` (21 slices, verified @ 93b4172).
- Permission catalog L118, submit L164 → `POST /api/admin/users` L186 (returns `userId`). `togglePerm` L150.
- Qualified Responder section L511 (shown only when `callerCanQr` L84 — Super Admin or `RESPONDERS_MANAGE`): checkbox + note; on success it calls `PUT /api/admin/users/:userId/qualified-responder` L228 as a second step and reports its failure separately (partial success).

### IncidentRecords.tsx — 1,001 lines. Admin incident-record archive
- Mounted by AdminConsole (incidents tab). Searchable list of documented SOS incidents with server-side PDF preview, save, and print (MinIO archive).
- **Slice map:** `codeslice/DT-08-IncidentRecords.md` (22 slices, verified @ 93b4172).

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
