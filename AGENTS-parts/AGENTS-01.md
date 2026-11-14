<!-- split from AGENTS.md — part 01 of 02 -->
# AGENTS.md — Valetudo HealthLink

Campus clinic management system (Pangasinan State University): appointments & queueing, EMR, e-prescriptions, dental charts, medicine inventory, emergency SOS, health passes, QR document verification. Philippine RA 10173 (Data Privacy Act) is a design constraint — treat any row containing patient data as PHI.

Monorepo with three deployables. No npm workspaces, no root scripts, no submodules — each module installs and runs from its own folder.

| Path | Stack | Role | Port |
|---|---|---|---|
| `server/` | Node ESM, Express 5, mysql2, Socket.IO, Redis, MinIO | REST + WSS API; all business logic; sole DB owner | 5000 (HTTPS) |
| `desktop/` | Electron 44, Vite 6, React 19, TypeScript | Clinic-staff console, Windows NSIS exe | 5173 (dev only) |
| `mobile/` | Flutter / Dart ^3.13.3 | Patient & responder app (Android primarily) | — |
| `docker-compose.yml` | MySQL 8, Redis 7, MinIO | Local infra | 3307 / 6379 / 9000–9001 |
| `server/schema.sql` | MySQL DDL | 33 base tables. The migration runner adds its ledger. | — |

Root `package.json` only pins shared tooling (concurrently, wait-on, electron). Read the module's own `AGENTS.md` before working in that module.

## How the parts talk

- All clients → `https://<host>:5000/api/...` (self-signed TLS) + Socket.IO (WSS) on the same port.
- Session JWTs last 24 hours and carry `roles[]` and `jti`. HTTP and Socket.IO check active account status. Redis supplies the session denylist when available.
- Roles (seeded in `server/schema.sql`): `STUDENT`, `FACULTY`, `NON_TEACHING`, `NURSE`, `DOCTOR`, `DENTIST`, `EMERGENCY_RESPONDER`, `ADMIN`. A user may hold several.
- Realtime events (server → clients): `emergency:new_alert`, `emergency:status_change`, `emergency:incident_report_required`, `emergency:incident_reported`, `responder:status_changed`, `queue:updated`, `appointment:booked`, `appointment:cancelled`, `appointment:status_changed`, `prescription:status_changed`. Every authenticated socket joins its own `user:<id>` room for targeted delivery. `appointment:booked` is a global refresh signal with an empty object payload. The incident-report popup uses a per-desktop-window room so only the window that resolved an alert opens it. `join:responders` from old mobile builds is only acknowledged.
- Qualified Responder: `USERS.is_qualified_responder` is a role-independent SOS label (any role can be flagged). It is ADDITIVE to the legacy role-based audience (`EMERGENCY_RESPONDER`/`NURSE`/`DOCTOR`/`ADMIN` keep receiving alerts with the flag off). Non-clinical flagged users get a reduced alert payload (no medical details, `medicalDetailsRedacted: true`). Admins need the `RESPONDERS_MANAGE` permission code to change it.

## Bootstrap a dev machine (order matters)

1. `docker compose up -d` — MySQL is host-mapped **3307→3306**; compose only creates `root` (password `rootpassword`, DB `valetudo_healthlink`); `.env.example` expects user `valetudo_app` — grant it or use root.
2. Copy `server/.env.example` to `server/.env`. Set `ENCRYPTION_KEY`, `JWT_SECRET` and `ENCRYPTION_SALT`. Match database, Redis and S3 credentials to the local services. Use the Compose defaults only for local development.
3. Create `server/certs/`, then generate the certificate and key used by the API and Electron development:
   `openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout server/certs/key.pem -out server/certs/cert.pem -subj "/CN=valetudo" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"` — append `,IP:<LAN-IP>` to the SAN list when other devices must reach the API.
4. Provision a new, empty database with `server/schema.sql`. The script drops and recreates tables, so use `npm run migrate` from `server/` for an existing installation. See the [migration rollout guide](../server/MIGRATION-PLAN.md).
5. From `server/`, run `npm install`, then `npm run dev`. Startup applies pending migrations before the API listens.
6. From `desktop/`, set `apiBaseUrl` in `app-config.json`, run `npm install`, then `npm run dev`.
7. For mobile, set the API host in `mobile/lib/config/api_config.dart` first. See the [mobile guide](../mobile/AGENTS.md).

## Command cheat sheet

| Module | Install | Run dev | Build | Test |
|---|---|---|---|---|
| server | `npm install` | `npm run dev` (nodemon) | — (`npm start` = run prod) | `node --test tests/<name>.test.js` |
| desktop | `npm install` | `npm run dev` | `npm run build`; `npm run dist` creates the installer under `release/` | `npm test`, `npm run test:smoke` |
| mobile | `flutter pub get` | `flutter run` | `flutter build apk --release` | `flutter test` |
