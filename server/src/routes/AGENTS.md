# server/src/routes/
One file per `/api/<name>` area. Exports: `appointments emergency inventory documents` → factory `(io)`; rest → `Router`.

| File | Area | Size |
|---|---|---|
| documents.js | EMR docs, attachments, PDFs, QR verify, S3 | ~1.8k lines |
| appointments.js | booking, queue, no-show, rules | ~1.6k |
| admin.js | users, roles, admin permissions | ~1.3k |
| serverPolicy.js | Super Admin policy read, impact preview and versioned save under `/api/admin/server-policy` | |
| inventory.js | medicines, batches, logs | |
| emergency.js | SOS alerts, responders (Socket.IO + FCM); incident reports (~700 lines — status PATCH L314, pending L444, report GET/POST L492/L575) | |
| analytics.js | stats/export (uses `utils/analyticsStats.js`) | |
| healthPass.js | dynamic QR health pass (HMAC) | |
| profile.js | user/health profile | |
| privacy.js | consent records | |
| sync.js | offline mutation sync from desktop | |
| interactions.js | drug-interaction check | |
| signature.js | e-signature enroll/use | |

## Workflow
- Locate: `grep -n "router\.\(get\|post\|put\|patch\|delete\)" routes/<file>.js` → read only that handler.
- Don't open `documents.js` / `appointments.js` / `admin.js` whole.

## Handler checklist
1. Auth (`authenticateToken` — check file top for `router.use` vs per-route) + `requireRoles(...)`.
2. Patient data → `requirePrivacyConsent`; reads → `logPhiAccess`; writes → `logAudit` (inside the transaction).
3. PHI columns → `encrypt`/`decrypt`.
4. Validate input; `?` placeholders only; return `{ error }` + proper status.
5. Realtime/notify: use authorized per-user rooms for patient data. `appointment:booked` broadcasts an empty refresh payload. FCM goes through `utils/fcmNotifier.js`.
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
