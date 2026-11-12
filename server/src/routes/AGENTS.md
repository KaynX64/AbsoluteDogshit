# server/src/routes/
Each API area exports a router or a factory. The appointments, documents, and admin folders compose their feature modules in `index.js`. These three areas, emergency, and inventory use factories that receive `io`.

| File | Area | Size |
|---|---|---|
| documents/index.js | EMR documents, attachments, PDFs, QR verification | |
| appointments/index.js | booking, queue, intake, consultations and patient history | |
| admin/index.js | users, roles, admin permissions, audit, database studio and server policy | |
| inventory.js | medicines, batches, logs | |
| emergency.js | SOS alerts, responders (Socket.IO + FCM); incident reports (~700 lines — status PATCH L314, pending L444, report GET/POST L492/L575) | |
| analytics.js | stats/export (uses `utils/analyticsStats.js`) | |
| healthPass.js | dynamic QR health pass (HMAC) | |
| profile.js | user/health profile | |
| privacy.js | consent records | |
| sync.js | offline mutation sync from desktop | |
| interactions.js | drug-interaction check | |
| signature.js | e-signature enroll/use | |

## Feature modules

| Area | Modules |
|---|---|
| Appointments | `booking.js` for clinicians, slots, personal bookings and cancellation. `dailyQueue.js` for daily lists and queue status. `intake.js` for lookup, check-in, walk-ins and active tickets. `consultations.js` for status and finalization. `patientHistory.js` for history and patient search. |
| Documents | `prescriptions.js` and `clearances.js` for issuance, history and lifecycle. `verification.js` for public and authorized QR reads. `attachments.js` for upload and token-based download. `pdfs.js` for protected prescription, clearance and incident report PDFs. |
| Admin | `userDirectory.js`, `userUpdates.js` and `accountCredentials.js` for account operations. `permissions.js` and `responders.js` for grants and responder eligibility. `audit.js` for access logs and telemetry. `databaseStudio.js` for database tools. `serverPolicy.js` for Super Admin policy read, preview and versioned save. |

Use `rg -n '<route path>' server/src/routes/<area>` to locate a handler. Feature registrars attach to the same router in the order set by `index.js`. Admin applies authentication and the ADMIN role gate before registering its routes. The server-policy router applies its own Super Admin gate.

The admin directory lists archived accounts with `GET /users?archived=true`. Its audited soft archive retains clinical and audit history and blocks self-archive and archiving the last active Super Admin. The advanced health-profile editor reads `GET /users/:id/health-profile` and saves through `PUT /users/:id`. The qualified responder endpoint requires `RESPONDERS_MANAGE`, requires a Super Admin for ADMIN targets, and emits `responder:status_changed`.

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
- `GET /api/appointments/patient/:patientId/history?limit=25` returns `{ records, nextCursor }`. Pass the returned cursor as `before` with the same limit to load older encounters. The limit accepts 1–50. A request without paging parameters returns the legacy array.
- History is ordered by encounter date and ID, newest first. The encounter query joins the dental chart for dentists. Vitals, attachment metadata and prescriptions are loaded in one batch query each. The consultation attachment strip uses `?view=attachments` and reads only live attachment metadata.

## Clinical inputs and issuer history

- Finalization and offline replay share encounter text validation. Complaint and diagnosis require entered text. Optional fields accept blanks. The check-in note contains only readings recorded for that visit.
- Prescription issuance validates medication directions and quantities before starting a transaction. Optional instructions and notes stay blank when omitted. Clearance issuance requires a purpose, clinical statement and expiry.
- Issuer history reads saved prescription items and clearance remarks independently of PDF availability. Prescription items are loaded in one batch for the signed-in clinician's records.
