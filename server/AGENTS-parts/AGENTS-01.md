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
| `responderQualifications.js` | `/api/responder-qualifications` | Applicant drafts/evidence, clinic reviews, reviewer designation, appointments and rollout. [Contract](../RESPONDER-QUALIFICATIONS.md). |
| `emergency/index.js` | `/api/emergency` | SOS lifecycle, live qualified/legacy responder audience, tiered per-user realtime/FCM delivery, staff-only searchable history and report worklists. Community responders may only acknowledge. Closing is atomic; report filing and draft cleanup share a transaction. Desktop-only author drafts are encrypted and revision-guarded. Targeted desktop resolution prompts, PDF storage/recovery and archive permissions remain. [Responder records](../RESPONDER-RECORDS.md). |
| `inventory/index.js` | `/api/inventory` | medicines, batches, inventory logs |
| `documents/index.js` | `/api/documents` | EMR docs, PDFs, attachments, signed one-time download tokens and public `GET /verify/:qrToken`. |
| `admin/index.js` | `/api/admin` | accounts and health profiles, audited soft archive, granular permissions, qualified responder management, audit, telemetry, connected sessions, Database Studio, Server Policy and Terminal. |
| `analytics/index.js` | `/api/analytics` | dashboard aggregates |
| `sync/index.js` | `/api/sync` | offline bootstrap, mutation replay and status |
| `interactions.js` | `/api/interactions` | drug-interaction warnings |
| `signature.js` | `/api/signature` | signature enrollment / verification |

Not in `routes/`: auth endpoints are wired directly in `app.js` — `POST /api/auth/login` (rate-limited), `POST /api/auth/logout`, `PUT /api/auth/change-password`; plus `GET /api/ping` (unauthenticated, DB-free liveness probe used by the desktop ping monitor). `public/verify.html` is the QR-landing page (same-origin fetch, needs no CORS entry).

`PUT /api/auth/change-password` accepts an optional `installation_id` or legacy `fcm_token`. Logout accepts the same device identifiers. The password update, removal of that account's matching device registration, and audit entry commit together. On success the server disconnects the calling session's sockets.

Routers that emit realtime events receive `io` as a factory argument: `appointmentRoutes(io)` pattern — keep it.

The [feature route map](../src/routes/AGENTS.md) lists the feature modules and their entry points.

The API admits 24 ordinary operations and reserves four extra SOS slots. Ordinary requests can wait in a 12-place queue for up to 100 ms. SOS has a separate 32-place priority queue with a one-second wait limit. The connection budget is eight shared connections, one for SOS requests and one for the dashboard worker. Excess requests receive HTTP 503.

`appointment:booked` is an authenticated global refresh signal with an empty object payload. Clients retrieve appointment details through authorized REST endpoints.

## Middleware — src/middleware/

- `rbac.js` — `requireRoles(...codes)`, `requirePermission(code)` (granular grants for every ADMIN, including mixed-role accounts), `resolveAdminPermissions(userId)`. Analytics resolves its own scopes from live roles, admin grants and staff overrides.
- `consent.js` — `requirePrivacyConsent`: RA 10173 gate in front of PHI reads.

The Terminal checks the live Admin role and grants on every request. Super Admins and Limited Admins with `TERMINAL_VIEW` can read bounded operational events and run built-in diagnostics. Restart requires Super Admin access. Restart requests are audited before the supervisor drains and replaces the API process. Run with `npm start` to enable restart.
