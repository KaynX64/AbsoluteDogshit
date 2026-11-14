<!-- split from AGENTS.md — part 02 of 02 -->

## Read before touching cross-module config

- **Desktop API URL is build-time.** Vite bundles `apiBaseUrl` from `desktop/app-config.json` into renderer REST and Socket.IO requests. Electron main also reads the packaged config for certificate checks. To retarget the packaged renderer, edit the config and run `npm run dist` again.
- Mobile API URL is hardcoded in `mobile/lib/config/api_config.dart` (Android uses the LAN IP; the Android emulator needs `10.0.2.2`).
- Server CORS is an allow-list (SEC-10): defaults cover the Vite dev origins + the packaged `file://` build (origin `null`); extend via `CORS_ALLOWED_ORIGINS` env. Requests without an `Origin` header pass the origin check and still face the route's authentication and authorization checks.
- `PUBLIC_API_BASE_URL` (server `.env`) is the URL baked into generated PDFs/QR codes — it must be reachable from whatever device scans them.

## Security invariants

See [the historical audit](../audit.md) for earlier findings. Confirm current behavior from the implementation.

- TLS is required by default. Keep `ALLOW_INSECURE_HTTP=true` for isolated local testing.
- Never widen CORS to `cors()` allow-all — that was the vulnerability.
- Never log PHI or credentials; keep using the `phiLogger` / `auditLogger` patterns.
- Privileged routes keep `requireRoles(...)` / `requirePermission(...)`; PHI reads keep `requirePrivacyConsent`.
- Set runtime secrets through the environment or the ignored `server/.env`. `server/src/utils/secrets.js` and `cryptoVault.js` validate required crypto settings. Keep deployment credentials out of the repository.
- `server/serviceAccountKey.json` (Firebase) and `mobile/android/app/google-services.json` are gitignored on purpose — never commit or paste their contents.
- Electron `certificate-error` handler bypasses self-signed errors only for (a) dev builds on local/Vite URLs, (b) packaged builds when `apiBaseUrl` is a loopback host and the URL is same-origin. Keep it that way.
- Keep TLS key material outside version control. The runtime uses the ignored `server/certs/` directory. The tracked `server/server/certs/key.pem` is outside the runtime path. Its contents and deployment use are unverified.

## Token-efficiency rules

- Skip lockfiles, dependencies and generated output during source navigation. Inspect a specific file when it is needed to diagnose installation, packaging or platform configuration. Use Git commands for history. The [mobile guide](../mobile/AGENTS.md) lists platform files routinely maintained by hand.
- Use the [desktop slice index](../desktop/docs/CODESLICE.md) and [mobile slice index](../mobile/lib/screens/CODESLICE.md) to locate sections of large files. Prefer symbol searches with `rg -n` when line numbers drift. After a mapped source edit, update its slice map and run `python scripts/verify_codeslice.py desktop/docs/codeslice mobile/lib/screens/codeslice .` from the repository root.
- **Large files — search, don't read whole.** `rg` the symbol, then read a ±40-line window:
  `DoctorConsole.tsx` · `AdminConsole.tsx` · `InventoryManager.tsx` · `NurseConsole.tsx` · `QrIntakeScanner.tsx` (paths in the desktop slice index) · `mobile/lib/screens/patient_portal_screen.dart` ~123 KB.
- Task routing: auth/session ⇒ `server/src/auth/`; API endpoints ⇒ [server route map](../server/src/routes/AGENTS.md); desktop UI ⇒ `desktop/src/features/`; Electron window, TLS and updates ⇒ `desktop/electron/window.cjs`, `certificatePolicy.cjs` and `updates.cjs`; offline queue ⇒ [desktop storage guide](../desktop/AGENTS.md#offline-storage) and [server route map](../server/src/routes/AGENTS.md); mobile screen ⇒ `mobile/lib/screens/`; infra/env ⇒ `server/.env.example` + `docker-compose.yml`.
- Conventions: `server/` is ESM-only (`"type":"module"` — never `require`); Electron main is CJS (`.cjs`); renderer is TypeScript; mobile is Dart; MySQL table names are UPPERCASE.
