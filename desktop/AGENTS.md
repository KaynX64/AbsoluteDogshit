# desktop/ — Electron + React 19 + Vite 6 + TypeScript 5.7 (`valetudo-desktop`)
Clinic workstation: Admin / Doctor / Nurse / Responder consoles, QR intake, prescriptions, inventory, analytics. Works offline.

## Commands (run in `desktop/`)
- `npm install` · `npm run dev` (Vite `127.0.0.1:5173` + Electron) · `npm run build` (`tsc && vite build`; use as the type-check) · `npm run dist` (electron-builder, Windows x64 NSIS → `release/`)
- No test runner, no lint script (`eslint.config.js` exists). Verify with `npm run build`.

## Map
- `electron/main.cjs` — main process: window, self-signed TLS trust for loopback API, embedded SQLite (`node:sqlite`, `userData/valetudo_data/valetudo_offline.db`), IPC handlers, auto-updater. CommonJS (`.cjs`).
- `electron/preload.cjs` — contextBridge API. `src/electron.d.ts` — its TS types. **New IPC = update main.cjs + preload.cjs + electron.d.ts together.**
- `src/App.tsx` (~900 lines) — shell, login, role routing/navigation (no router lib).
- `src/components/` → `components/AGENTS.md`
- `src/config/api.ts` — `API_BASE_URL`, `SOCKET_URL` from `app-config.json` (`apiBaseUrl`, default `https://localhost:5000`). Never hardcode URLs.
- `src/services/` — `offlineSync.ts` (mutation queue: IPC→SQLite, localStorage mirror/fallback), `interactionService.ts` (drug interactions).
- `src/hooks/` — `useServerPing`, `useBookingBadge`.
- `src/theme/` — `index.ts` + `tokens.css`: use tokens/semantic tones, no ad-hoc colors.
- `src/index.css` (~2k lines), `App.css` — grep a class before reading.
- `src/assets/`, `public/` — images; ignore. `src/pages/`, `.gitkeep` — empty.

## Rules
- Every API call goes through `API_BASE_URL` with `Authorization: Bearer <jwt>`; write ops while offline → enqueue via `offlineSync`.
- Icons: `<Icon name=… tone=… size=… fill weight=… />` (Material Symbols font). No inline SVG icon sets.
- Realtime: `socket.io-client` against `SOCKET_URL`; SOS via `EmergencyAlertBanner`.
- Don't add dependencies without asking. Keep types strict (avoid new `any`; existing `payload: any` is legacy).
- Never log PHI to the console.
