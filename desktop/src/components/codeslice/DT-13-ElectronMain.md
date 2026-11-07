# DT-13 · main.cjs

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-13 · desktop/electron/main.cjs
**LOC:** 492 · **Anchor commit:** 1a5c9d7 · **Role:** Electron main: window lifecycle, embedded SQLite offline store + IPC handlers, auto-updater, scoped TLS cert bypass
**Mounted by:** Electron runtime entry (desktop/package.json main); loads preload.cjs + renderer
**API surface:** none (main process only reads app-config.json apiBaseUrl; renderer does HTTP)
**Socket events:** none
**State / key fields:** sqliteDb handle + dbPath (userData/valetudo_data/valetudo_offline.db) · API_BASE_URL/API_WS_URL from ../app-config.json · VITE_URL https://127.0.0.1:5173 · API_IS_LOOPBACK flag

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-30 | app-config.json | imports (app, BrowserWindow, ipcMain, Notification, Menu, shell, session, updater); URL constants; SQLite boot |
| 2 | 32-89 | initLocalDatabase | initLocalDatabase: CREATE TABLE LOCAL_SYNC_LOGS, CACHED_PATIENTS, CACHED_EMR_RECORDS + indexes |
| 3 | 91-137 | offline-queue-mutation | IPC offline-queue-mutation: insert pending LOCAL_SYNC_LOGS; EMR CREATE cached as draft |
| 4 | 139-189 | offline-mark-synced | IPC offline-get-pending-mutations, offline-mark-synced, offline-mark-failed |
| 5 | 191-236 | offline-cache-bootstrap | IPC offline-cache-bootstrap: upsert CACHED_PATIENTS + CACHED_EMR_RECORDS from server payload |
| 6 | 238-272 | offline-search-patients | IPC offline-get-emr-history (per patient) + offline-search-patients (LIKE query, LIMIT 25) |
| 7 | 274-297 | setupAutoUpdater | setupAutoUpdater (packaged only): autoDownload, update-status events, 4h recheck; install-update IPC |
| 8 | 299-383 | createWindow | createWindow: 1300x880, contextIsolation + preload, camera perms, Vite/dist load, F11/F12, PDF download |
| 9 | 385-415 | print-document | IPC print-document (hidden window print) + show-notification (OS Notification) |
| 10 | 417-463 | isLoopbackHostname | loopback + exact same-origin helpers: API_IS_LOOPBACK, isSameOrigin, isLocalApiUrl, isDevServerUrl |
| 11 | 465-492 | certificate-error | app.on certificate-error: dev bypass for Vite/local API; packaged bypass only loopback API; app start |
