<!-- split from AGENTS.md — part 02 of 02 -->

## Read before touching cross-module config

- **Desktop API URL is build-time.** `desktop/src/config/api.ts` imports `app-config.json`; Vite bakes `apiBaseUrl` into the renderer bundle. Editing `app-config.json` in a packaged exe only affects main-process checks, NOT where renderer requests go. Repoint a built exe ⇒ edit `app-config.json` → `npm run dist` again.
- Mobile API URL is hardcoded in `mobile/lib/config/api_config.dart` (Android uses the LAN IP; the Android emulator needs `10.0.2.2`).
- Server CORS is an allow-list (SEC-10): defaults cover the Vite dev origins + the packaged `file://` build (origin `null`); extend via `CORS_ALLOWED_ORIGINS` env. Non-browser clients (Flutter, curl) send no `Origin` and always pass.
- `PUBLIC_API_BASE_URL` (server `.env`) is the URL baked into generated PDFs/QR codes — it must be reachable from whatever device scans them.

## Security invariants — audit findings SEC-01…14 are remediated on this branch; do not regress

- TLS is mandatory: no `server/certs/{cert,key}.pem` ⇒ the API process exits. Plaintext only behind explicit `ALLOW_INSECURE_HTTP=true`.
- Never widen CORS to `cors()` allow-all — that was the vulnerability.
- Never log PHI or credentials; keep using the `phiLogger` / `auditLogger` patterns.
- Privileged routes keep `requireRoles(...)` / `requirePermission(...)`; PHI reads keep `requirePrivacyConsent`.
- Secrets come only from `server/.env` via `utils/secrets.js` (boot fails when crypto keys are missing). No hardcoded credentials.
- `server/serviceAccountKey.json` (Firebase) and `mobile/android/app/google-services.json` are gitignored on purpose — never commit or paste their contents.
- Electron `certificate-error` handler bypasses self-signed errors only for (a) dev builds on local/Vite URLs, (b) packaged builds when `apiBaseUrl` is a loopback host and the URL is same-origin. Keep it that way.
- Never commit key material of any kind; `server/certs/` is gitignored.

## Token-efficiency rules

- **Never read** (zero value, huge cost): any `package-lock.json`, `bun.lock`, `mobile/pubspec.lock`, `node_modules/**`, `desktop/dist/**`, `desktop/release/**`, `.git/**`, and `mobile/{android,ios,linux,macos,windows,web}/**` (generated — `mobile/AGENTS.md` lists the few editable exceptions).
- **Frontend monoliths — navigate by slice map, not by reading.** Each frontend monolith directory carries a `CODESLICE.md` index beside its `AGENTS.md`, routing to per-monolith sub-MDs in `codeslice/` (a map over the 7 KB doc cap is split into `<name>-parts/`): `desktop/src/components/` (13 maps, 384 slices) and `mobile/lib/screens/` (7 maps, 205 slices). Check the sub-MD's header first (Mounted by / API surface / Socket events / State), then `sed -n 'A,Bp' <file>` only the slice you need; re-locate by the Anchor string when lines drift. Edit a mapped file → update its sub-MD and re-run `python3 scripts/verify_codeslice.py desktop/src/components/codeslice mobile/lib/screens/codeslice .`.
- **Large files — search, don't read whole.** `rg` the symbol, then read a ±40-line window:
  `desktop/src/components/DoctorConsole.tsx` ~168 KB · `AdminConsole.tsx` ~160 KB · `InventoryManager.tsx` ~63 KB · `NurseConsole.tsx` ~76 KB · `desktop/src/index.css` ~75 KB · `QrIntakeScanner.tsx` ~51 KB · `mobile/lib/screens/patient_portal_screen.dart` ~123 KB.
- Task routing: auth/session ⇒ `server/src/auth/`; API endpoints ⇒ [server route map](../server/src/routes/AGENTS.md); desktop UI ⇒ `desktop/src/components/`; Electron window/TLS/updater ⇒ `desktop/electron/main.cjs`; mobile screen ⇒ `mobile/lib/screens/`; infra/env ⇒ `server/.env.example` + `docker-compose.yml`.
- Conventions: `server/` is ESM-only (`"type":"module"` — never `require`); Electron main is CJS (`.cjs`); renderer is TypeScript; mobile is Dart; MySQL table names are UPPERCASE.
