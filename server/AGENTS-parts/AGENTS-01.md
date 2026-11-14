<!-- split from server/AGENTS.md — part 01 of 02 -->
# server/AGENTS.md — Express API (Node, ESM)

`"type":"module"` — use `import` everywhere, including scripts and tests. Entry: `src/index.js` (`npm run dev` = nodemon, `npm start` = Node supervisor). One HTTPS server carries both REST and Socket.IO.

## Boot pipeline (src/index.js)

- `src/app.js` builds Express middleware in order: CORS allow-list, JSON parsing, security headers. Its `mountApiRoutes(app, io, { restart })` function attaches the API and passes the optional restart callback to Admin.
- `src/server.js` attaches Express to the HTTP(S) transport. TLS uses `server/certs/{cert,key}.pem` and exits on missing certs unless `ALLOW_INSECURE_HTTP=true`.
- `src/realtime/socket.js` attaches Socket.IO to the same server. HTTP and realtime share the origin check. `index.js` exports `io` and mounts API routes before listening.
- `src/bootstrap/dependencies.js` runs [versioned migrations](../MIGRATION-PLAN.md), loads the persisted [server policy](../src/config/SERVER-POLICY.md), and completes the Redis and MinIO startup checks before `startup.js` opens the listener. Redis and MinIO keep their existing degraded-mode behavior. Workers start after the listener opens. SIGINT and SIGTERM stop scheduling, close Socket.IO and HTTP, and wait for active jobs and requests before closing Redis, S3 and MySQL. Shutdown has a 30-second deadline.

## Route map — src/routes/ (mounted under /api in app.js)

| File | Mount | Owns |
|---|---|---|
| `privacy.js` | `/api/privacy` | consent records & privacy requests |
| `profile/index.js` | `/api/profile` | self-profile, clinical health profile, theme and device tokens |
| `healthPass.js` | `/api/health-pass` | medical clearances & QR health passes |
| `appointments/index.js` | `/api/appointments` | booking, queue, intake, consultations and patient history. Emits `appointment:*` and `queue:updated`. |
| `emergency/index.js` | `/api/emergency` | SOS lifecycle; audience = Qualified Responder flag OR legacy role (`EMERGENCY_RESPONDER`/`NURSE`/`DOCTOR`/`ADMIN`), resolved live per user. Emits `emergency:*` tiered per recipient to `user:<id>` rooms; community responders get a reduced payload (no medical details) but ALL tiers may acknowledge/dispatch/resolve/false-alarm (closing is an atomic conditional UPDATE — second closer gets 409 `ALERT_ALREADY_CLOSED`, so exactly one `status_change` event). The incident-documentation popup is triggered only for the specific desktop window that resolved an alert via `emergency:incident_report_required`; `POST` emits `emergency:incident_reported` so other consoles dismiss; automatically generates and stores official incident report PDFs in MinIO S3 (`/incident-reports/incident-<id>-<hex>.pdf`); serves archived incident records via `GET /incident-reports` and `GET /incident-reports/:id/pdf` |
| `inventory/index.js` | `/api/inventory` | medicines, batches, inventory logs |
| `documents/index.js` | `/api/documents` | EMR docs, PDFs, attachments, signed one-time download tokens and public `GET /verify/:qrToken`. |
| `admin/index.js` | `/api/admin` | accounts and health profiles, audited soft archive, granular permissions, qualified responder management, audit, telemetry, connected sessions, Database Studio, Server Policy and Terminal. |
| `analytics/index.js` | `/api/analytics` | dashboard aggregates |
| `sync/index.js` | `/api/sync` | offline bootstrap, mutation replay and status |
| `interactions.js` | `/api/interactions` | drug-interaction warnings |
| `signature.js` | `/api/signature` | signature enrollment / verification |

Not in `routes/`: auth endpoints are wired directly in `app.js` — `POST /api/auth/login` (rate-limited), `POST /api/auth/logout`, `PUT /api/auth/change-password`; plus `GET /api/ping` (unauthenticated, DB-free liveness probe used by the desktop ping monitor). `public/verify.html` is the QR-landing page (same-origin fetch, needs no CORS entry).

Routers that emit realtime events receive `io` as a factory argument: `appointmentRoutes(io)` pattern — keep it.

The [feature route map](../src/routes/AGENTS.md) lists the feature modules and their entry points.

`appointment:booked` is an authenticated global refresh signal with an empty object payload. Clients retrieve appointment details through authorized REST endpoints.

## Middleware — src/middleware/

- `rbac.js` — `requireRoles(...codes)`, `requirePermission(code)` (granular grants for every ADMIN, including mixed-role accounts), `resolveAdminPermissions(userId)`. Analytics resolves its own scopes from live roles, admin grants and staff overrides.
- `consent.js` — `requirePrivacyConsent`: RA 10173 gate in front of PHI reads.

The Terminal checks the live Admin role and grants on every request. Super Admins and Limited Admins with `TERMINAL_VIEW` can read bounded operational events and run built-in diagnostics. Restart requires Super Admin access. Restart requests are audited before the supervisor drains and replaces the API process. Run with `npm start` to enable restart.
