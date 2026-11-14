<!-- split from server/AGENTS.md — part 02 of 02 -->

## Auth model — src/auth/

- `login.js` owns login rate limiting, the bcrypt timing equalizer, role lookup, and the 24-hour JWT with `user_id`, `email`, `roles`, and `jti`.
- `middleware.js` authenticates HTTP requests. It shares the Redis denylist key and active-account query in `session.js` with Socket.IO. `logout.js` and `password.js` write revocations using the same key.
- `attachmentTokens.js` issues short-lived, attachment-bound, single-use download tokens and checks for replays.

## Domain modules and shared utilities

- `src/appointments/` owns queue reads and transitions, shared encounter completion, vital and dental chart validation, ticket reservation, and the transactional no-show transition. `src/analytics/` owns report queries and renderers. `src/emergency/` owns responder eligibility, redaction, and the incident report filing transaction.
- `src/admin/accounts/` owns the account-update workflow, role and grant transitions, and the associated role and health-profile writes.
- `src/inventory/pharmacyAnalytics.js` serves both the nurse reorder endpoint and the analytics pharmacy card. The rolling 14-day window counts negative dispense movements and positive returns by ledger event time. Net dispensing can be negative when recent returns came from older dispenses. Prescribed quantities use issue time and exclude cancelled prescriptions. Reorder priorities include active formulary items at or below their buffer, including items with no recorded activity.
- `src/documents/` owns signing helpers, per-document generation, PDF rendering, and public links. `documentService.js` exports the generators, which persist PDFs through shared storage.
- `src/workers/` has separate jobs for appointment reminders, no-shows, prescription expiry, and PDF backfill. `scheduler.js` skips busy ticks and can run an opted-in job at startup. No-shows and prescription expiry run at startup. The expiry service locks eligible prescriptions before changing status and writes its audit entry inside the transaction.
- Inventory stock receiving, adjustments and manual deductions use `src/inventory/stockMutations.js`. Prescription issuance also uses the inventory-owned FEFO helper, with the caller’s connection. PDF recovery scans up to 20 rows per document type oldest ID first every five minutes, starting at boot, and defers failed entries for 30 minutes. A MySQL session lock serializes recovery per database. Admin telemetry shows per-process worker health and the oldest pending PDF from the latest recovery pass.
- The reminder worker holds a database-scoped MySQL session lock for a batch of up to 50 appointments ordered by time and ID. It resumes after the last attempted row and wraps to revisit failed or newly eligible reminders. Worker telemetry records attempts and persisted deliveries. It records SMTP acceptance in `reminder_sent` before attempting push and realtime notifications. A crash after SMTP acceptance and before the database update can cause another email attempt.
- `src/sync/` owns offline mutation dispatch, per-mutation transactions, conflicts, and duplicate outcomes. Keep HTTP response mapping in `src/routes/sync/`.
- Paged bootstrap uses a user-bound cursor, a MySQL time watermark for EMRs, and a maximum user ID for roster pages. Updated desktops save all pages before advancing the paged checkpoint. Older clients can still request the legacy one-page response.
- `src/utils/` retains shared infrastructure such as secrets validation, encryption, Redis, S3, SMTP, FCM, and audit logging. [Shared helper map](../src/utils/AGENTS.md)

## Database — src/db/ + schema.sql

- Import the mysql2 pool from `src/db/pool.js`. `src/db/migrate.js` applies versioned upgrades before the listener starts.
- The [migration rollout guide](../MIGRATION-PLAN.md) covers the migration command, disposable rehearsals and deployment recovery.
- `schema.sql` is the source of truth: 32 tables, UPPERCASE names. Groups: identity (`USERS`, `ROLES`, `USER_ROLES`, `ADMIN_PERMISSIONS`, `USER_ADMIN_PERMISSIONS`), profiles (`STUDENT_`, `FACULTY_`, `NON_TEACHING_`, `STAFF_PROFILES`, `HEALTH_PROFILES`, `DEVICE_TOKENS`), consent (`CONSENT_RECORDS`), care flow (`APPOINTMENTS`, `QUEUE`, `QUEUE_TICKET_COUNTERS`, `EMR_RECORDS`, `EMR_ATTACHMENTS`, `DENTAL_CHARTS`, `VITAL_SIGNS`, `MEDICAL_CLEARANCES`), pharmacy (`MEDICINES`, `MEDICINE_BATCHES`, `DRUG_INTERACTIONS`, `INVENTORY_LOGS`, `PRESCRIPTIONS`, `PRESCRIPTION_ITEMS`), safety (`EMERGENCY_ALERTS`, `INCIDENT_REPORTS` — one report per alert, `UNIQUE(alert_id)`), audit (`AUDIT_LOGS`, `PHI_ACCESS_LOGS`, `LOCAL_SYNC_LOGS`), and operational policy (`SERVER_POLICY`).
- Role seed rows (ids 1–8) live at the bottom of `schema.sql`.

## Env — copy `.env.example` → `.env` (never commit it)

Crypto: `ENCRYPTION_KEY`, `JWT_SECRET`, `ENCRYPTION_SALT` (required) · DB: host 127.0.0.1, port **3307** (host-mapped) · Redis (password required with the repo compose) · MinIO/S3 endpoint 127.0.0.1:9000 · SMTP · `PUBLIC_API_BASE_URL` (baked into PDFs/QR) · rate limits `LOGIN_/SOS_/BOOKING_/VERIFY_RATE_LIMIT_{MAX,WINDOW}` · `NOSHOW_GRACE_MINUTES` · `CORS_ALLOWED_ORIGINS` (comma-separated additions to the built-in desktop-origin allow-list).

## Tests & scripts

Run the full suite with `node --test` from `server/`. `tests/appRoutes.test.js` assembles the actual API with a fake realtime dependency and uses an ephemeral loopback port. It stubs database queries and needs no running MySQL, Redis, MinIO, or Firebase service.

Set `VALETUDO_MIGRATION_TEST_PORT` and `VALETUDO_MIGRATION_TEST_PASSWORD` for a disposable MySQL 8 instance to include the migration and concurrency tests. The concurrency suite covers startup, prescription expiry, reminder claims, and replay.

`node --test tests/<file>.test.js` from `server/` — available: `cryptoVault` (12), `analyticsStats` (4), `dbStudioGuard` (35), `bmi` (2), `signatory` (2). The cryptoVault suite spawns isolated child processes so a real `.env` is never loaded; the other suites inject a throwaway ENCRYPTION_KEY + ENCRYPTION_SALT before importing (analyticsStats also sets a dummy DB_PASSWORD — mysql2 pools connect lazily, so no MySQL is touched). `reencrypt.test.js` was removed with its module (the v1→v2 migration is complete; the vault is v2-only). `scripts/encrypt-plaintext-health-profiles.js` is a one-off tool for encrypting legacy plaintext rows.

## Do not regress (remediated audit findings live in this code)

CORS allow-list only · TLS mandatory · timing-equalized login · jti denylist on logout & socket handshake · RBAC on every privileged route · consent gate before PHI · no PHI/credentials in logs · match the existing hardened patterns when adding endpoints.

## Efficiency

Never read `package-lock.json`. Use the [feature route map](../src/routes/AGENTS.md) for appointments, documents, and admin. Search the relevant folder with `rg`, then read the endpoint's handler.
