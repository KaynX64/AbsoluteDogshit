# DT-13 · main.cjs

[Desktop slice index](../CODESLICE.md)

## DT-13 · desktop/electron/main.cjs

Window and permissions in `window.cjs` and `certificatePolicy.cjs`; storage and IPC in `offline/`; updater, printing, and notifications have dedicated modules.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-11 | — | Imports and declarations |
| 2 | 12-17 | requestSingleInstanceLock | Lock the profile and register shared handlers |
| 3 | 18-28 | app.whenReady | Open and migrate encrypted storage before opening the window |
| 4 | 29-31 | window-all-closed | window-all-closed |
