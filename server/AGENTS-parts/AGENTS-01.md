<!-- split from server/AGENTS.md — part 01 of 02 -->
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
| `appointments.js` | `/api/appointments` | booking, queue, no-shows; emits `appointment:*`, `queue:updated` (~1.7k lines) |
| `emergency.js` | `/api/emergency` | SOS lifecycle; audience = Qualified Responder flag OR legacy role (`EMERGENCY_RESPONDER`/`NURSE`/`DOCTOR`/`ADMIN`), resolved live per user. Emits `emergency:*` tiered per recipient to `user:<id>` rooms; community responders get a reduced payload (no medical details) but ALL tiers may acknowledge/dispatch/resolve/false-alarm (closing is an atomic conditional UPDATE — second closer gets 409 `ALERT_ALREADY_CLOSED`, so exactly one `status_change` event). The incident-documentation popup is triggered only for the specific desktop window that resolved an alert via `emergency:incident_report_required`; `POST` emits `emergency:incident_reported` so other consoles dismiss; automatically generates and stores official incident report PDFs in MinIO S3 (`/incident-reports/incident-<id>-<hex>.pdf`); serves archived incident records via `GET /incident-reports` and `GET /incident-reports/:id/pdf` |
| `inventory.js` | `/api/inventory` | medicines, batches, inventory logs |
| `documents.js` | `/api/documents` | EMR docs & attachments, signed one-time download tokens, public `GET /verify/:qrToken` (~1.9k lines) |
| `admin.js` | `/api/admin` | user administration and archived-user listing via GET `/users?archived=true`; audited soft archive via DELETE `/users/:id` (retains clinical/audit history; blocks self-archive and the last active Super Admin), granular admin permissions, advanced health-profile editor (GET `/users/:id/health-profile`, `health_profile` object on PUT `/users/:id`), PUT `/users/:id/qualified-responder` (RESPONDERS_MANAGE; Super Admin only for ADMIN targets; emits `responder:status_changed`) (~1.9k lines) |
| `analytics.js` | `/api/analytics` | dashboard aggregates |
| `sync.js` | `/api/sync` | offline-client sync ingestion |
| `interactions.js` | `/api/interactions` | drug-interaction warnings |
| `signature.js` | `/api/signature` | signature enrollment / verification |

Not in `routes/`: auth endpoints are wired directly in `index.js` — `POST /api/auth/login` (rate-limited), `POST /api/auth/logout`, `PUT /api/auth/change-password`; plus `GET /api/ping` (unauthenticated, DB-free liveness probe used by the desktop ping monitor). `public/verify.html` is the QR-landing page (same-origin fetch, needs no CORS entry).

Routers that emit realtime events receive `io` as a factory argument: `appointmentRoutes(io)` pattern — keep it.

## Middleware — src/middleware/

- `rbac.js` — `requireRoles(...codes)`, `requirePermission(code)` (granular ADMIN perms), `resolveAdminPermissions(userId)`.
- `consent.js` — `requirePrivacyConsent`: RA 10173 gate in front of PHI reads.
