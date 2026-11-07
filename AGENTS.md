# Valetudo HealthLink — root
PSU Lingayen Campus EMR / consultation / SOS system. Handles PHI (R.A. 10173). Monorepo, 3 apps:

| Dir | Stack | Details |
|---|---|---|
| `server/` | Node ESM, Express 5, MySQL 8, Redis, MinIO(S3), Socket.IO, FCM | `server/AGENTS.md` |
| `desktop/` | Electron + React 19 + Vite 6 + TS (clinic workstation, offline SQLite) | `desktop/AGENTS.md` |
| `mobile/` | Flutter (Dart ^3.13) patient app + responder screen | `mobile/AGENTS.md` |

Root `package.json`: devDeps only (concurrently, electron, wait-on). No scripts.

## Token rules (follow first)
1. Open only the dir you are editing + its `AGENTS.md`. Do not scan the repo.
2. Never `cat` files >300 lines. Use `grep -n` then read a line range. Biggest:
   `DoctorConsole.tsx` 4.2k, `patient_portal_screen.dart` 2.9k, `AdminConsole.tsx` 2.6k, `desktop/src/index.css` 2k,
   `routes/documents.js` 1.8k, `consultation_scheduler_screen.dart` 1.7k, `routes/appointments.js` 1.6k,
   `documents_viewer_screen.dart` 1.6k, `routes/admin.js` 1.3k, `schema.sql` 633.
3. Edit with small diffs/snippets. Do not rewrite whole files unless asked.
4. Don't re-explain code back. Answer with the change + file:line.

## Never read / edit (generated, binary, or noise)
`node_modules/ dist/ release/ build/ .dart_tool/` · `*.lock`, `package-lock.json`, `pubspec.lock` · `repomix-output.xml` · `.gitignore.backup`
· `mobile/{android,ios,linux,macos,windows,web}/` (platform scaffolding; only touch for permissions, package id, icons, Firebase)
· images/icons/`*.ogg` · `*.pbxproj`, `*.cmake`, `.postman/`, `postman/` · `.gitkeep`

## Infra (docker-compose.yml)
MySQL 8 → `127.0.0.1:3307`, Redis 7 → `127.0.0.1:6379` (password), MinIO → `127.0.0.1:9000` (console `9001`). Loopback only (SEC-12) — keep it.
Secrets live in compose / `server/.env`. Never print, log, commit, or echo them in answers.

## Cross-app contracts
- API base `https://localhost:5000` (self-signed TLS; server refuses plain HTTP). Desktop: `desktop/app-config.json`. Mobile: `mobile/lib/config/api_config.dart`.
- Auth: JWT Bearer. Roles: `ADMIN DOCTOR DENTIST NURSE EMERGENCY_RESPONDER` + patient roles (see `ROLES` in `server/schema.sql`).
- Realtime: Socket.IO, JWT-authenticated; staff/responders join room `responders` (SOS alerts).
- Offline: desktop queues mutations (`client_mutation_id`, `table_name`, `record_uuid`, `action`, `payload`) → `POST /api/sync`. Mobile has offline SOS queue.

## Hard rules (PHI/security)
- PHI fields: encrypt with `utils/cryptoVault.js`; never log PHI; use `logAudit` (writes) and `logPhiAccess` (reads).
- Every route: auth + `requireRoles(...)`; patient-data routes also `requirePrivacyConsent`.
- Schema change = edit `server/schema.sql` AND `runAutoMigrations()` in `server/src/db.js`.
- New env var = add to `server/.env.example` (+ `src/config/limits.js` if a rate limit).
- Don't weaken CORS allow-list, CSP, TLS, rate limits, or loopback bindings.

## Conventions
- Files start with a path comment, e.g. `// server/src/routes/x.js`.
- Server: ESM, `.js` extension in imports. Desktop: TS strict, no new deps without asking. Mobile: `flutter_lints`.
- Prefer existing helpers/components over new ones. Match surrounding style.
