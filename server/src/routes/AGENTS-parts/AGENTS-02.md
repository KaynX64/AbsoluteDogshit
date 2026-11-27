<!-- Authoritative server route guidance; see ../AGENTS.md for the index. -->

# Route policies and handler contracts

The dashboard serves snapshots at most five seconds old. `X-Analytics-As-Of` marks source time. A missing fresh snapshot returns HTTP 503 after a bounded wait. Encounter and SOS graphs use 14 MySQL calendar days. Today is partial. `emergencyMetrics.timedClosures` separates zero-second closures from no sample. Empty diagnosis and department results are arrays.

Live grants gate all analytics routes. Mixed-role admins use admin grants. Doctors and dentists get Operations, Clinical, Dispensing and Export. Nurses get Operations, Surveillance, Pharmacy and Export. Clinical includes Surveillance. Pharmacy includes Dispensing. Diagnosis ranks require Clinical, stock alerts and reorder ranks require Pharmacy, and department details require Operations. Export needs an eligible section and covers both downloads and print. Super Admins manage staff scopes at GET/PUT `/api/admin/users/:id/analytics-permissions`. Null inherits staff defaults, an explicit list replaces them, and an empty list denies analytics.

Use `rg -n '<route path>' server/src/routes/<area>` to locate a handler. Feature registrars attach to the same router in the order set by `index.js`. Admin applies authentication and the ADMIN role gate before registering its routes. The server-policy router applies its own Super Admin gate.

The admin directory lists archived accounts with `GET /users?archived=true`. Its audited soft archive retains clinical and audit history and blocks self-archive and archiving the last active Super Admin. The advanced health-profile editor reads `GET /users/:id/health-profile` and saves through `PUT /users/:id`. The retired flag endpoint requires `RESPONDERS_MANAGE` and returns HTTP 409. Review applications and manage appointments through the [responder qualification workflow](../../../docs/workflows/RESPONDER-QUALIFICATIONS.md).

Super Admins can grant `INCIDENT_RECORDS_VIEW` during Limited Admin creation or by editing grants. The incident archive and both PDF routes enforce the grant for administrators. The document PDF route also serves patients their own report. Pending-report reads, report prefill and filing require live responder access followed by `requireClinicalResponder`; the community tier may only acknowledge active incidents. Responder prefill returns the filed report ID so the popup can close when someone has already filed it.

## Handler checklist
1. Auth (`authenticateToken` — check file top for `router.use` vs per-route) + `requireRoles(...)`.
2. Patient data → `requirePrivacyConsent`; reads → `logPhiAccess`; writes → `logAudit` (inside the transaction).
3. PHI columns → `encrypt`/`decrypt`.
4. Validate input; `?` placeholders only; return `{ error }` + proper status.
5. Realtime/notify: use authorized per-user rooms for patient data. `appointment:booked` broadcasts an empty refresh payload. FCM goes through `utils/fcmNotifier.js`.
   `GET /api/emergency/responder-access` returns live eligibility for the signed-in user. The active-alert list still enforces live responder authorization.
6. Cache via `getCache/setCache/invalidateCache` (Redis, TTL 120s default) — invalidate on writes.
7. Release the connection before post-commit pool work. Booking and cancellation emails run after the response. Issuance waits for `pdfAvailable` after release.
8. Booked arrivals and walk-ins reserve the daily ticket before checking for an existing active ticket. Keep the reservation and queue insert in the same transaction.

## Appointment read queries

- Booking locks the practitioner and reads the current and preceding hour via `idx_app_doctor_datetime` under READ COMMITTED. Availability reads the requested day. Check-in releases its connection before queue invalidation and events.
- The roster selects the latest live EMR and prescription by date and ID and returns one row per appointment. Arrival and no-show counts use date ranges backed by `idx_app_status_datetime`.
- `GET /api/appointments/patient/:patientId/history?limit=25` returns `{ records, nextCursor }`. Pass the returned cursor as `before` with the same limit to load older encounters. The limit accepts 1–50. A request without paging parameters returns the legacy array.
- History is ordered by encounter date and ID, newest first. The encounter query joins the dental chart for dentists. Vitals, attachment metadata and prescriptions are loaded in one batch query each. The consultation attachment strip uses `?view=attachments` and reads only live attachment metadata.

## Clinical inputs and issuer history

- Finalization and offline replay share encounter text validation. Complaint and diagnosis require entered text. Optional fields accept blanks. The check-in note contains only readings recorded for that visit.
- Online completion and replay lock the appointment before writing the EMR, vitals and queue status. The caller owns the transaction and audit entry. Queue status writes lock the linked appointment before the ticket. Repeat status changes are idempotent.
- Prescription issuance validates medication directions and quantities before starting a transaction. Optional instructions and notes stay blank when omitted. Clearance issuance requires a purpose, clinical statement and expiry.
- `documents/prescriptions/issuePrescription.js` owns the transaction and post-commit PDF orchestration. The `inventory/prescriptionStock.js` helper locks FEFO lots, applies deductions, and links them to prescription items using the same connection. The route validates HTTP input and maps the workflow result to the existing response. Cancellation and expiry sit beside issuance. Cancellation restores lots and appends the return ledger through the inventory helper in the same transaction. Clearance issuance and revocation use `documents/clearanceMutations.js`. Formulary writes use `inventory/formularyMutations.js`.
- Issuer history reads saved prescription items and clearance remarks independently of PDF availability. Prescription items are loaded in one batch for the signed-in clinician's records.
- Issuer history exposes `appointment_id` from the verified V2 snapshot, legacy EMR, or new clearance metadata. Keep older unlinked documents separate; never infer a visit from its date.
- V2 prescribing uses `documents/prescriptions/structuredContract.js` for shared review/issue validation and safety, `structuredIssuance.js` for request locking and the stock transaction, and `structuredRead.js` for integrity-checked immutable snapshots. Failed known-pair checks cannot become an empty success. [Contract](../../../docs/workflows/STRUCTURED-PRESCRIBING.md) · [rollout](../../../docs/workflows/PRESCRIBING-ROLLOUT.md).
- `public/verify.html` renders a status-only prescription summary from the public API. Never add clinical fields, dose fallbacks, third-party QR generation or certification claims. Escape displayed values and token/error text. V2 expiry follows the full Asia/Manila validity date in readers and the expiry worker; keep cancellation precedence and legacy semantics.
