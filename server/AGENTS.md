# server/ — Node ESM API (`valetudo-backend`)
Express 5 · MySQL (mysql2 pool) · Redis (ioredis) · MinIO via AWS S3 SDK · Socket.IO · Firebase Admin (FCM) · pdfkit · exceljs · nodemailer · multer.

## Commands (run in `server/`)
- `npm install` · `npm run dev` (nodemon) · `npm start`
- Tests (Node built-in runner): `node --test tests/<name>.test.js`
  (`analyticsStats`, `cryptoVault`, `dbStudioGuard`, `reencrypt`)
- Needs: `cp .env.example .env` and fill; `certs/cert.pem` + `certs/key.pem` (else server exits — no plain HTTP).
- Infra first: `docker compose up -d` from repo root.
- `JWT_SECRET`, `ENCRYPTION_KEY` are mandatory (≥32 chars, checked in `utils/secrets.js`).

## Map
- `src/index.js` — boot: CORS allow-list, security headers/CSP, Socket.IO auth (+Redis token-revocation check), route mounting, `startReminderScheduler(io)`, `runAutoMigrations()`.
- `src/auth.js` — `loginUser`, `authenticateToken`, `changePassword`, `logoutUser`, `loginRateLimit`, attachment download tokens.
- `src/db.js` — `pool`, `runAutoMigrations()`.
- `src/routes/` → `routes/AGENTS.md` · `src/utils/` → `utils/AGENTS.md`
- `src/middleware/` — `rbac.js` (`requireRoles`, `requirePermission(code)`, admin permission codes), `consent.js` (`requirePrivacyConsent`).
- `src/config/` — `limits.js` (rate limits, env-overridable), `appointmentRules.js`.
- `schema.sql` — tables: USERS ROLES USER_ROLES ADMIN_PERMISSIONS USER_ADMIN_PERMISSIONS STUDENT/FACULTY/NON_TEACHING/STAFF_PROFILES DEVICE_TOKENS HEALTH_PROFILES CONSENT_RECORDS APPOINTMENTS QUEUE EMR_RECORDS EMR_ATTACHMENTS DENTAL_CHARTS VITAL_SIGNS MEDICINES MEDICINE_BATCHES DRUG_INTERACTIONS INVENTORY_LOGS PRESCRIPTIONS PRESCRIPTION_ITEMS MEDICAL_CLEARANCES EMERGENCY_ALERTS AUDIT_LOGS PHI_ACCESS_LOGS LOCAL_SYNC_LOGS. Grep `CREATE TABLE X` instead of reading it all.
- `public/verify.html` — public QR document-verify page (CSP-restricted; inline script).
- `scripts/encrypt-plaintext-health-profiles.js` — one-off migration to encrypt old rows.
- `.postman/`, `postman/` — ignore. `valetudo_healthlink` (extensionless, purpose unclear) — don't open unless asked.

## Mount table (`/api/…`)
`auth/*` (in index.js) · `privacy` · `profile` · `health-pass` · `appointments(io)` · `emergency(io)` · `inventory(io)` · `documents(io)` · `admin` · `analytics` · `sync` · `interactions` · `signature` · `ping`
`(io)` = route file exports a factory `(io) => router`; others export a router.

## Rules
- Add endpoint: edit one `routes/*.js`; mount new file in `index.js`. Don't create parallel routers.
- Always parameterized SQL (`?`). Use transactions for multi-write ops; pass the connection to `logAudit`.
- Rate limits: `config/limits.js` + env keys (`LOGIN_/SOS_/BOOKING_/VERIFY_RATE_LIMIT_{MAX,WINDOW}`, `NOSHOW_GRACE_MINUTES`).
- Redis optional at runtime (`isRedisActive()`): code must degrade gracefully.
- Comments tagged `SEC-nn` / `S-nn` / `B-nn` refer to audit items — keep them when editing nearby.
