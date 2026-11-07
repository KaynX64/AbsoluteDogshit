# server/AGENTS.md — Express API (Node, ESM)

`"type":"module"` — use `import` everywhere, including scripts and tests. Entry: `src/index.js` (`npm run dev` = nodemon, `npm start` = plain node). One HTTPS server carries both REST and Socket.IO.

## Boot pipeline (src/index.js)

CORS allow-list → security headers (HSTS, nosniff, X-Frame-Options DENY, XSS, Referrer-Policy) → `express.json()` → routes → `https.createServer` from `../certs/{cert,key}.pem` (**process exits if certs are missing**, unless `ALLOW_INSECURE_HTTP=true`) → Socket.IO `io` (exported) → `listen(PORT=5000)` → async boot: `initRedis` → `ensureBucketExists` (MinIO bucket `valetudo-attachments`) → `runAutoMigrations` → `logActiveLimits` → `startReminderScheduler(io)`.

## Route map — src/routes/*.js (all mounted under /api in index.js)

| File | Mount | Owns |
|---|---|---|
| `privacy.js` | `/api/privacy` | consent records & privacy requests |
| `profile.js` | `/api/profile` | user & health profiles |
| `healthPass.js` | `/api/health-pass` | medical clearances & QR health passes |
| `appointments.js` | `/api/appointments` | booking, queue, no-shows; emits `appointment:*`, `queue:updated` |
| `emergency.js` | `/api/emergency` | SOS lifecycle; audience = Qualified Responder flag OR legacy role (`EMERGENCY_RESPONDER`/`NURSE`/`DOCTOR`/`ADMIN`), resolved live per user. Emits `emergency:*` tiered per recipient to `user:<id>` rooms; community responders get a reduced payload (no medical details) and may only acknowledge/dispatch |
| `inventory.js` | `/api/inventory` | medicines, batches, inventory logs |
| `documents.js` | `/api/documents` | EMR docs & attachments, signed one-time download tokens, public `GET /verify/:qrToken` |
| `admin.js` | `/api/admin` | user administration, granular admin permissions, advanced health-profile editor (GET `/users/:id/health-profile`, `health_profile` object on PUT `/users/:id`), PUT `/users/:id/qualified-responder` (RESPONDERS_MANAGE; Super Admin only for ADMIN targets; emits `responder:status_changed`) |
| `analytics.js` | `/api/analytics` | dashboard aggregates |
| `sync.js` | `/api/sync` | offline-client sync ingestion |
| `interactions.js` | `/api/interactions` | drug-interaction warnings |
| `signature.js` | `/api/signature` | signature enrollment / verification |

Not in `routes/`: auth endpoints are wired directly in `index.js` — `POST /api/auth/login` (rate-limited), `POST /api/auth/logout`, `PUT /api/auth/change-password`; plus `GET /api/ping` (unauthenticated, DB-free liveness probe used by the desktop ping monitor). `public/verify.html` is the QR-landing page (same-origin fetch, needs no CORS entry).

Routers that emit realtime events receive `io` as a factory argument: `appointmentRoutes(io)` pattern — keep it.

## Middleware — src/middleware/

- `rbac.js` — `requireRoles(...codes)`, `requirePermission(code)` (granular ADMIN perms), `resolveAdminPermissions(userId)`.
- `consent.js` — `requirePrivacyConsent`: RA 10173 gate in front of PHI reads.

## Auth model — src/auth.js

- Login: bcrypt `compare` with a `DUMMY_HASH` timing equalizer (unknown user ⇒ identical latency), MySQL role join, JWT `{sub, email, roles, jti}`, `expiresIn: '24h'`.
- Logout: writes `token:blacklist:<jti>` to Redis; the Socket.IO handshake checks the same denylist.
- Documents use separate short-lived **download tokens** (`DOWNLOAD_TOKEN_TTL_SECONDS`), single-use, replay-checked in Redis.

## Utils — src/utils/*.js

`secrets.js` env validation (boot-fatal when crypto keys missing) · `cryptoVault.js` AES field encryption · `redisClient.js` (`initRedis`, `isRedisActive()`) · `s3Vault.js` MinIO/S3 · `phiLogger.js` + `auditLogger.js` structured logging (no PHI) · `documentService.js` / `signatory.js` / `signatureVault.js` / `pdfVault.js` document chain · `mailer.js` nodemailer SMTP · `interactionChecker.js` drug interactions · `reminderWorker.js` scheduler: reminders + auto no-show after `NOSHOW_GRACE_MINUTES`, emits `appointment:status_changed`, `prescription:status_changed`, `queue:updated` · `fcmNotifier.js` Firebase push · `passwordPolicy.js` · `dentalValidator.js` · `analyticsStats.js` · `dbStudioGuard.js`.

## Database — src/db.js + schema.sql

- mysql2 pool; `runAutoMigrations()` runs at boot and is additive — never destructive.
- `schema.sql` is the source of truth: 29 tables, UPPERCASE names. Groups: identity (`USERS`, `ROLES`, `USER_ROLES`, `ADMIN_PERMISSIONS`, `USER_ADMIN_PERMISSIONS`), profiles (`STUDENT_`, `FACULTY_`, `NON_TEACHING_`, `STAFF_PROFILES`, `HEALTH_PROFILES`, `DEVICE_TOKENS`), consent (`CONSENT_RECORDS`), care flow (`APPOINTMENTS`, `QUEUE`, `EMR_RECORDS`, `EMR_ATTACHMENTS`, `DENTAL_CHARTS`, `VITAL_SIGNS`, `MEDICAL_CLEARANCES`), pharmacy (`MEDICINES`, `MEDICINE_BATCHES`, `DRUG_INTERACTIONS`, `INVENTORY_LOGS`, `PRESCRIPTIONS`, `PRESCRIPTION_ITEMS`), safety (`EMERGENCY_ALERTS`), audit (`AUDIT_LOGS`, `PHI_ACCESS_LOGS`, `LOCAL_SYNC_LOGS`).
- Role seed rows (ids 1–8) live at the bottom of `schema.sql`.

## Env — copy `.env.example` → `.env` (never commit it)

Crypto: `ENCRYPTION_KEY`, `JWT_SECRET`, `ENCRYPTION_SALT` (required) · DB: host 127.0.0.1, port **3307** (host-mapped) · Redis (password required with the repo compose) · MinIO/S3 endpoint 127.0.0.1:9000 · SMTP · `PUBLIC_API_BASE_URL` (baked into PDFs/QR) · rate limits `LOGIN_/SOS_/BOOKING_/VERIFY_RATE_LIMIT_{MAX,WINDOW}` · `NOSHOW_GRACE_MINUTES` · `CORS_ALLOWED_ORIGINS` (comma-separated override).

## Tests & scripts

`node --test tests/<file>.test.js` from `server/` — available: `cryptoVault` (12), `analyticsStats` (4), `dbStudioGuard` (35), `bmi` (2), `signatory` (2). The cryptoVault suite spawns isolated child processes so a real `.env` is never loaded; the other suites inject a throwaway ENCRYPTION_KEY + ENCRYPTION_SALT before importing (analyticsStats also sets a dummy DB_PASSWORD — mysql2 pools connect lazily, so no MySQL is touched). `reencrypt.test.js` was removed with its module (the v1→v2 migration is complete; the vault is v2-only). `scripts/encrypt-plaintext-health-profiles.js` is a one-off tool for encrypting legacy plaintext rows.

## Do not regress (remediated audit findings live in this code)

CORS allow-list only · TLS mandatory · timing-equalized login · jti denylist on logout & socket handshake · RBAC on every privileged route · consent gate before PHI · no PHI/credentials in logs · match the existing hardened patterns when adding endpoints.

## Efficiency

Never read `package-lock.json`. `routes/documents.js` (~64 KB), `appointments.js` (~60 KB) and `admin.js` (~67 KB) are large — `rg` the endpoint, then read a narrow window.
