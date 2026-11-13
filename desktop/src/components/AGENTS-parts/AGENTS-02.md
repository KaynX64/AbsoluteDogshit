<!-- split from desktop/src/components/AGENTS.md — part 02 of 04 -->

### DoctorConsole.tsx — Consultations, EMR, e-Rx, clearances, immunizations, analytics
- **Slice map:** `codeslice/DT-01-DoctorConsole-parts/` has the current line ranges.
- Exports: `ToothCondition` L13, `ToothRecord` L21, `DoctorViewMode` L27 (`'active'|'scheduled'|'history'|'archive'|'analytics'`), component L178.
- Sockets L351-374: `appointment:booked`, `appointment:status_changed`, `queue:updated`, `appointment:cancelled`.
- Queue & consult: `fetchAppointments` L308 (`GET /api/appointments/today?filter=active|history|scheduled` L312-314), `handleConflict` L376, `selectPatient` L407, `handleStartConsultation` L557 (status → in-progress L562), `handleFinishConsultation` L588 (complete L643 + EMR + attachments upload L662).
- Patient data: the consultation strip requests attachment metadata only. Past EMR History and the archive timeline use `usePatientHistory` for 25-record pages and the offline SQLite fallback. Patient search uses `/api/appointments/patients/search?query=`.
- `ClinicalReview` shows the values to be saved for encounters, prescriptions and clearances. Edit actions focus the corresponding input. Queue refreshes preserve the selected encounter's draft. The issuer history reads saved details even when a PDF is pending.
- On wide screens, the patient context and read-only triage vitals sit above the queue beside the editor. Patient details, record history, and long safety entries use keyboard-operable disclosures. Encounter, Documents, and the dentist-only Dental chart share one scroll area and preserve draft state across views. The encounter action bar keeps the attachment and discharge review controls together. Narrow and short windows use one vertical scroll area. Dental arches keep their horizontal scroll and tooth button sizes.
- Rx/clearance: rx history L752 (`/api/documents/prescriptions/patient/:id`), clearance history L788, print clearance L1085 (`POST /api/documents/clearances`).
- Immunizations: open modal L883, quick-add L928, custom L940, remove L961, save L965 (`GET/POST /api/profile/patient/:id/immunizations` L895/L976).
- PDFs: `handleDownloadPdf` L1009, `openIssuedPdf` L1051 (`GET /api/documents/:kind/:id/pdf`).
- BMI: consult form computes `bmi`/`bmiCategory` client-side from height/weight; header also shows appointment-supplied `bmi`/`bmi_category`.
- Layout anchors: `doctor-context`, `doctor-roster`, `doctor-workspace-switch`, `doctor-encounter-panel`, `doctor-encounter-actions`, `doctor-document-panel` and `doctor-dental-panel`.

### AdminConsole.tsx — Users, audit, telemetry, analytics, DB Studio

- The Edit account modal mounts `StaffAnalyticsPermissions.tsx` for Super Admins editing a nurse, doctor or dentist. Its save action applies analytics permissions independently of profile changes. Select Use role defaults and save to remove an override.
- **Slice map:** `codeslice/DT-02-AdminConsole-parts/` (59 slices, 2 parts, verified @ 93b4172).
- Exports: `AdminTab` L83 (`'users'|'audit'|'telemetry'|'analytics'|'db'`), component L92. Props `activeTab`/`onTabChange` (App.tsx).
- Permission gate: `fetchMyPermissions` uses `GET /api/admin/my-permissions` on mount and window focus. Restricted tabs render `NoPermissionPanel`. `INCIDENT_RECORDS_VIEW` controls the Incident Records view and its sidebar entry. Server Policy requires a Super Admin.
- Users tab L805: list `fetchUsers` L174 (now also returns `is_qualified_responder`, `qualified_responder_since`, `qualified_responder_note`, `sos_via_role`), edit modal `handleOpenEditModal` L400, save profile L530 (identity + sub-profile + immunizations + optional `health_profile`), reset password L680. Filter chips include a Qualified-Responders toggle (`userQrOnly`).
- Edit modal has a **Basic/Advanced switch** (toggle L2076): Basic = the everyday fields. Advanced lazily fetches `GET /api/admin/users/:id/health-profile` (`fetchEditHealthProfile` L463, switch handler L508) and renders EVERY HEALTH_PROFILES column — sex, date of birth, blood type, height/weight, live BMI preview (generated column, read-only), encrypted allergies/chronic-conditions textareas, emergency contacts (section L2481) — plus read-only account/signature metadata (L2592). `health_profile` is only sent on save when Advanced was loaded; Basic saves never touch the health record.
- **Qualified Responder section (Basic tab, every role) L2574**: toggle + note (≤150) + read-only since-date. Disabled without `RESPONDERS_MANAGE`, or for ADMIN targets unless the caller is a Super Admin. `sos_via_role` renders an "also receives SOS through role X" hint. On save, flag/note diffs (snapshot `editQrOriginal` L136) call `PUT /api/admin/users/:id/qualified-responder` as a separate partial-success step (`qrWarning`), exactly like permissions.
- Audit tab: mutation logs L240, PHI access logs L252, retention L264, sweep `handleExecuteSweep` L284 (`POST /api/privacy/retention/sweep`).
- Telemetry tab: telemetry L274. Analytics tab L1590 → `AnalyticsDashboard`. DB Studio tab L1595: tables L660/L679, save row L710, delete row L751 (writes to arbitrary tables — `DATABASE_MANAGE` protected; keep it that way).
