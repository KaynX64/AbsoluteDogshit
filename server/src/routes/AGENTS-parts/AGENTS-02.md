<!-- Authoritative server route guidance; see ../AGENTS.md for the index. -->

# Route policies and handler contracts

Analytics summary reports fourteen MySQL calendar days for both encounter and SOS timelines. The current day is partial. `emergencyMetrics.timedClosures` distinguishes a measured zero-second closure from an empty sample. Empty diagnosis and department datasets are returned as empty arrays.

Analytics reads current roles and admin grants together on each request. Administrators with other roles use their admin grants. Clinical includes aggregate Surveillance, and Pharmacy includes Dispensing. Doctors and dentists receive Operations, Clinical, Dispensing with availability, and Export. Nurses receive Operations, Surveillance, Pharmacy, and Export. A diagnosis ranking is loaded only for Clinical. Batch alerts and reorder rankings require Pharmacy. Department detail requires Operations. Downloads and print authorization require Export and at least one authorized section.

Super Admins manage per-account staff overrides through GET and PUT `/api/admin/users/:id/analytics-permissions`. A null override inherits the current staff role defaults. An explicit list replaces those defaults, with independent controls for diagnosis, surveillance, dispensing and inventory. An empty list denies analytics. The same settings apply to the summary, department detail, exports and print authorization.

Use `rg -n '<route path>' server/src/routes/<area>` to locate a handler. Feature registrars attach to the same router in the order set by `index.js`. Admin applies authentication and the ADMIN role gate before registering its routes. The server-policy router applies its own Super Admin gate.

The admin directory lists archived accounts with `GET /users?archived=true`. Its audited soft archive retains clinical and audit history and blocks self-archive and archiving the last active Super Admin. The advanced health-profile editor reads `GET /users/:id/health-profile` and saves through `PUT /users/:id`. The qualified responder endpoint requires `RESPONDERS_MANAGE`, requires a Super Admin for ADMIN targets, and emits `responder:status_changed`.

Super Admins can grant `INCIDENT_RECORDS_VIEW` during Limited Admin creation or by editing grants. The incident archive and both PDF routes enforce the grant for administrators. The document PDF route also serves patients their own report. Responder prefill returns the filed report ID so the popup can close when someone has already filed it.

## Handler checklist
1. Auth (`authenticateToken` — check file top for `router.use` vs per-route) + `requireRoles(...)`.
2. Patient data → `requirePrivacyConsent`; reads → `logPhiAccess`; writes → `logAudit` (inside the transaction).
3. PHI columns → `encrypt`/`decrypt`.
4. Validate input; `?` placeholders only; return `{ error }` + proper status.
5. Realtime/notify: use authorized per-user rooms for patient data. `appointment:booked` broadcasts an empty refresh payload. FCM goes through `utils/fcmNotifier.js`.
   `GET /api/emergency/responder-access` returns live eligibility for the signed-in user. The active-alert list still enforces live responder authorization.
6. Cache via `getCache/setCache/invalidateCache` (Redis, TTL 120s default) — invalidate on writes.
7. Release the transaction connection before post-commit work that uses the pool. Booking confirmation runs after the response. Issuance waits for the PDF and returns `pdfAvailable` after releasing the connection.
8. Booked arrivals and walk-ins reserve the daily ticket before checking for an existing active ticket. Keep the reservation and queue insert in the same transaction.

## Appointment read queries

- Booking and availability compare `date_time` directly to the clinic day's bounds so MySQL can use `idx_app_doctor_datetime`.
- The roster selects the latest live EMR and prescription by date and ID and returns one row per appointment. Arrival and no-show counts use date ranges backed by `idx_app_status_datetime`.
- `GET /api/appointments/patient/:patientId/history?limit=25` returns `{ records, nextCursor }`. Pass the returned cursor as `before` with the same limit to load older encounters. The limit accepts 1–50. A request without paging parameters returns the legacy array.
- History is ordered by encounter date and ID, newest first. The encounter query joins the dental chart for dentists. Vitals, attachment metadata and prescriptions are loaded in one batch query each. The consultation attachment strip uses `?view=attachments` and reads only live attachment metadata.

## Clinical inputs and issuer history

- Finalization and offline replay share encounter text validation. Complaint and diagnosis require entered text. Optional fields accept blanks. The check-in note contains only readings recorded for that visit.
- Online completion and replay lock the appointment before writing the EMR, vitals and queue status. The caller owns the transaction and audit entry. Queue status writes lock the linked appointment before the ticket. Repeat status changes are idempotent.
- Prescription issuance validates medication directions and quantities before starting a transaction. Optional instructions and notes stay blank when omitted. Clearance issuance requires a purpose, clinical statement and expiry.
- `documents/prescriptions/issuePrescription.js` owns the transaction and post-commit PDF orchestration. The `inventory/prescriptionStock.js` helper locks FEFO lots, applies deductions, and links them to prescription items using the same connection. The route validates HTTP input and maps the workflow result to the existing response. Cancellation and expiry sit beside issuance. Cancellation restores lots and appends the return ledger through the inventory helper in the same transaction. Clearance issuance and revocation use `documents/clearanceMutations.js`. Formulary writes use `inventory/formularyMutations.js`.
- Issuer history reads saved prescription items and clearance remarks independently of PDF availability. Prescription items are loaded in one batch for the signed-in clinician's records.
