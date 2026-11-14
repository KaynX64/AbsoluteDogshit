# desktop/AGENTS.md — Electron staff console

Electron 44 (main process = CommonJS `.cjs`) + Vite 6 + React 19 + TypeScript 5.7 renderer + socket.io-client. Ships as a Windows x64 NSIS installer: `npm run dist` → `release/ValetudoHealthLink-Setup-<version>.exe` (output and `dist/` are build artifacts — never edit, never commit).

## Process model — electron/main.cjs

- **Dev** (`npm run dev`) starts Vite and then Electron. Generate `../server/certs/cert.pem` and `key.pem` before launching. Vite serves HTTP when these files are absent, while Electron loads the HTTPS `VITE_URL` from `electron/config.cjs`. The dev window can show after page load if first-paint readiness has not fired.
- **Packaged**: main loads `dist/index.html` over `file://`. This is why `vite.config.mts` sets `base: './'` — keep it or asset URLs break inside the exe.
- `app-config.json` (`apiBaseUrl`) is read by main at runtime **and** imported by the renderer at build time — see the gotcha below.
- `certificate-error` policy (security-critical, do not loosen): dev builds tolerate the self-signed cert for local-API and Vite URLs; packaged builds only when `apiBaseUrl` is a loopback host **and** the failing URL is same-origin with it (`isSameOrigin` also blocks userinfo tricks). Any other certificate error stands.
- `preload.cjs` exposes a minimal `contextBridge` surface (`window.electronAPI`) — extend it deliberately; keep `nodeIntegration: false` / `contextIsolation: true` (current settings).
- **Title bar** (Windows 11 22H2+, build 22621+): the native caption is hidden, `backgroundMaterial: 'acrylic'` makes the window translucent over the blurred desktop (system light/dark tint), and `src/app/TitleBar.tsx` draws the title strip over a transparent `titleBarOverlay` (Windows still draws min/max/close). Older Windows/modern non-Windows keeps the native caption and `--titlebar-h` stays `0`. `WINDOW_TITLE` / `TITLEBAR_HEIGHT` / `CUSTOM_TITLE_BAR` live in `electron/config.cjs`; the renderer gets them through the synchronous `window-chrome` IPC because sandboxed preloads cannot require local modules. Keep the 34px in `config.cjs` and the `--titlebar-h` CSS value in sync.
- `electron-updater` checks a generic `http://localhost:8080/` feed (campus-LAN update server) — intentional, not a bug.

## #1 gotcha — the API URL is baked at build time

`src/config/api.ts` does `import appConfig from '../../app-config.json'`; Vite inlines `apiBaseUrl` into the renderer bundle. Consequence: **editing `app-config.json` inside a packaged exe does not change where renderer fetches/sockets go** (it only affects main-process loopback checks). To retarget a packaged app: edit `app-config.json` → `npm run dist`. Dev mode picks the file up on restart.

## Renderer and Electron ownership

| Area | Location |
|---|---|
| Renderer entry, shell, login and navigation | `src/main.tsx`, `src/app/` |
| Admin accounts, audit, analytics grants, Database Studio and server policy | `src/features/admin/` |
| Doctor/Dentist encounters, patient history and odontogram | `src/features/consultations/` |
| Nurse triage, expected arrivals and SOS presentation | `src/features/nurse/` |
| QR intake and booking badge | `src/features/appointments/` |
| Prescriptions, interactions and signatures | `src/features/documents/` |
| Pharmacy, analytics and emergency workflows | `src/features/inventory/`, `src/features/analytics/`, `src/features/emergency/` |
| Reusable controls, theme, assets and ordered CSS entry | `src/shared/ui/`, `src/theme/`, `src/assets/`, `src/index.css` |
| Connectivity, realtime and offline replay | `src/platform/` |
| Electron lifecycle, window, certificate policy, offline database and IPC | `electron/` |

The shell owns session state and one authenticated Socket.IO connection per window. Feature controllers own API requests, drafts, and subscriptions. Presentation components accept data and callbacks. Server RBAC and privacy checks remain authoritative. QR intake imports the shared validator from `server/src/appointments/vitals.js`. Preload exposes the existing `window.electronAPI` surface with its types in `src/electron.d.ts`.

The incident-report listener stays in the shell across role switches. Doctor and Dentist share one console instance when switching directly between those roles.

- **Admin.** Keep incident navigation gated by `INCIDENT_RECORDS_VIEW`, Database Studio by `DATABASE_MANAGE`, and server policy by the Super Admin check. Gate Terminal navigation on `TERMINAL_VIEW` or Super Admin access. Restart Server requires Super Admin access. Account creation saves optional sex, date of birth and emergency contact details for Student, Faculty and Non-Teaching accounts. System health shows per-process worker telemetry, the oldest pending PDF, and live connected users with sign-in time and connection uptime. Audit filters use the viewer’s current role list when the server provides it. Staff analytics overrides have their own save action in the account editor. The Qualified Responder grant uses its dedicated endpoint and reports failures separately from profile saves.
- **Consultations and documents.** Past EMR history and the archive timeline use the same paginated history hook and SQLite fallback. The active attachment strip requests metadata first. Keep issuer history, signature enrollment, and PDF actions wired through the existing controller callbacks.
- **Nurse and emergency.** Station counts come from live data. Keep the shared SOS band and confirmation portal on the relevant nurse views. AppShell mounts the incident report popup once. Its realtime prompt is addressed to the desktop window that resolved the alert.
- **Analytics.** Keep one scoped snapshot for all tabs. Focus refresh clears revoked data. Report authorization is rechecked before building the print portal.

## Runtime ownership

- QR capture owns camera tracks, its decode loop, and uploaded image URLs in `useQrCapture.ts`. The decoder loads on demand. Document previews cancel pending reads and revoke blob URLs on replacement or unmount.
- Admin audit and telemetry requests follow the active view and its current grants. Dispatch keeps its polling fallback and gives realtime refreshes priority.
## Offline storage

- `electron/offline/database.cjs` opens the encrypted SQLite database before the window starts. Electron `safeStorage` wraps the key for the OS profile. Keep the raw key in main and preserve the existing database when key access fails.
- `electron/offline/registerHandlers.cjs` binds queue operations to the active app account. `src/platform/offline/offlineQueue.ts` imports the legacy mirror by mutation ID before clearing it and sends only the signed-in account's pending changes. Unassigned legacy entries stay encrypted until ownership can be verified. Keep clinical payloads out of browser storage.
- The encounter form clears only after the offline write succeeds. `src/platform/offline/offlineSync.ts` advances the bootstrap checkpoint only after every page is saved. See [offline storage and rollout details](README.md#offline-storage).

## Shared desktop interaction

- Use `src/shared/ui/Dialog.tsx` for modal workflows, `ConfirmAction.tsx` for destructive confirmations, and `feedback.tsx` for inline action status. Keep save and draft state in the feature controller.
- Use `data-dialog-initial` on the heading for long reviews or on the safe action for destructive confirmations. Group headings and actions with `dialog-header` and `dialog-footer`. Keep form drafts safe from outside clicks.
- Link every tab to a panel. Use `navigateTabs` with automatic activation for local views and manual activation for views that fetch on selection. Use `selectionMotion.ts` for selection-driven motion and `interactions.css` for hover and press feedback. Keep destination order in `app/consoleNavigation.ts`. Mark route content with `data-workspace-view` and keep sticky controls and urgent messages outside those targets. Only staff-initiated navigation starts a workspace transition.

## Commands

`npm run dev` · `npm run build` (tsc -b + Vite) · `npm run dist` (build + electron-builder) · `npm test` · `npm run test:smoke` (Windows packaged app).

## Efficiency

- Read [the code-slice index](./docs/CODESLICE.md) before opening large feature files. Re-locate anchors with `rg -n` after edits.
- Keep styles near their owners and preserve the import order in `src/index.css`. Material Symbols, Inter, and JetBrains Mono are bundled under `src/img_icons/`.
- Use renderer source when editing UI. Inspect packaged files or lockfile entries when diagnosing a build or native dependency issue.
- If the packaged app shows TLS/cert errors talking to `https://localhost:5000`, suspect `apiBaseUrl` (loopback check in main), not the renderer code.
