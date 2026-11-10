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

## Planned route split

Keep `appointments.js`, `documents.js` and `admin.js` as the router factories mounted by `src/index.js`. Extract workflows into same-named subdirectories. Each module registers handlers on the existing router, preserving route order and the middleware chain. Capture methods, paths and middleware before moving code. Land each router split separately after its checks pass.

1. **Appointments.** Move availability, bookings and cancellations to `booking.js`. Move arrival lookup, check-in, walk-ins, daily counts and queue tickets to `queue.js`. Move the clinical workspace and encounter transitions to `encounters.js`. Move patient search and history to `history.js`. Verify booking capacity, ticket allocation, the no-show race and both history response formats.
2. **Documents.** Extract `prescriptions.js`, `clearances.js`, `attachments.js`, `verification.js` and `pdfDownloads.js`. Keep upload and download guards next to the attachment routes. Verify issuance transaction boundaries, single-use tokens, public QR redaction, and resolution of the public verification HTML after moving its handler.
3. **Admin.** Extract `databaseStudio.js` first, followed by `audit.js`, `accounts.js` and `permissions.js`. Keep the admin role gate and Server Policy mount in the factory. Share the existing grant and lifecycle logic among account handlers where they already depend on it. Verify mixed-role denials, Super Admin safeguards, audit coverage and Database Studio protections.

After each phase, compare the route contract with the baseline and run the server suite and focused synthetic workflow checks. Update this route map and the server guidance as each split lands.
