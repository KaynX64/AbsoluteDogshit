# desktop/AGENTS.md — Electron staff console

Electron 44 (main process = CommonJS `.cjs`) + Vite 6 + React 19 + TypeScript 5.7 renderer + socket.io-client. Ships as a Windows x64 NSIS installer: `npm run dist` → `release/ValetudoHealthLink-Setup-<version>.exe` (output and `dist/` are build artifacts — never edit, never commit).

## Process model — electron/main.cjs

- **Dev** (`npm run dev`): the npm script runs Vite at `https://127.0.0.1:5173` (TLS reuses `../server/certs/*.pem`; falls back to HTTP if absent) and, once the port is up, launches Electron; main loads `VITE_URL`.
- **Packaged**: main loads `dist/index.html` over `file://`. This is why `vite.config.mts` sets `base: './'` — keep it or asset URLs break inside the exe.
- `app-config.json` (`apiBaseUrl`) is read by main at runtime **and** imported by the renderer at build time — see the gotcha below.
- `certificate-error` policy (security-critical, do not loosen): dev builds tolerate the self-signed cert for local-API and Vite URLs; packaged builds only when `apiBaseUrl` is a loopback host **and** the failing URL is same-origin with it (`isSameOrigin` also blocks userinfo tricks). Any other certificate error stands.
- `preload.cjs` exposes a minimal `contextBridge` surface (`window.electronAPI`) — extend it deliberately; keep `nodeIntegration: false` / `contextIsolation: true` (current settings).
- `electron-updater` checks a generic `http://localhost:8080/` feed (campus-LAN update server) — intentional, not a bug.

## #1 gotcha — the API URL is baked at build time

`src/config/api.ts` does `import appConfig from '../../app-config.json'`; Vite inlines `apiBaseUrl` into the renderer bundle. Consequence: **editing `app-config.json` inside a packaged exe does not change where renderer fetches/sockets go** (it only affects main-process loopback checks). To retarget a packaged app: edit `app-config.json` → `npm run dist`. Dev mode picks the file up on restart.

## Renderer map — src/

- `App.tsx` — session/auth shell, role → console routing.
- `components/` — role consoles: `AdminConsole`, `DoctorConsole`, `NurseConsole`, `ResponderConsole`; feature widgets: `PrescriptionGenerator`, `DentalChart`, `SignaturePad`, `SignatureEnrollment`, `QrIntakeScanner`, `InventoryManager`, `AnalyticsDashboard`, `EmergencyAlertBanner`, `InteractionWarning`, `ServerPingMonitor`, `CreateUserModal`, `PasswordStrengthIndicator`, `Icon`, `IncidentReportModal`, `IncidentRecords`.
- `services/` — `offlineSync.ts` (offline queue + flush), `interactionService.ts`.
- `hooks/` — `useServerPing` (polls `GET /api/ping`), `useBookingBadge`.
- `theme/` — `tokens.css` design tokens, `index.ts`.
- `config/api.ts` — the single source of `API_BASE_URL` / `SOCKET_URL`.
- `electron.d.ts` — typings for the preload bridge.

## Commands

`npm run dev` · `npm run build` (tsc + vite build → `dist/`) · `npm run dist` (build + electron-builder) · `npm run preview`.

## Efficiency

- Consoles are huge single files — never read one whole; `rg` the symbol/section, then open a ±40-line window: `DoctorConsole.tsx` ~154 KB · `AdminConsole.tsx` ~124 KB · `InventoryManager.tsx` ~54 KB · `NurseConsole.tsx` ~51 KB · `QrIntakeScanner.tsx` ~46 KB · `index.css` ~48 KB.
- Never read `dist/`, `release/`, or lockfiles.
- If the packaged app shows TLS/cert errors talking to `https://localhost:5000`, suspect `apiBaseUrl` (loopback check in main), not the renderer code.
