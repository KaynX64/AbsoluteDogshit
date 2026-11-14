# DT-13 · main.cjs

[Desktop slice index](../CODESLICE.md)

## DT-13 · desktop/electron/main.cjs

Window and permissions in `window.cjs` and `certificatePolicy.cjs`; storage and IPC in `offline/`; updater, printing, and notifications have dedicated modules.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-11 | — | Imports and declarations |
| 2 | 12-17 | requestSingleInstanceLock | Lock the profile and register shared handlers |
| 3 | 18-23 | app.whenReady | Register offline IPC and open the window. The first signed-in account opens encrypted storage. |
| 4 | 24-26 | window-all-closed | window-all-closed |
