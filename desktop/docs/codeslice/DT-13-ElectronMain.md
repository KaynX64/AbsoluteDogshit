# DT-13 · main.cjs

[Desktop slice index](../CODESLICE.md)

## DT-13 · desktop/electron/main.cjs

Window and permissions in `window.cjs` and `certificatePolicy.cjs`; storage and IPC in `offline/`; updater, printing, and notifications have dedicated modules.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-12 | — | Imports and declarations |
| 2 | 13-19 | requestSingleInstanceLock | Lock the profile, set the Windows app ID, and register shared handlers |
| 3 | 20-25 | app.whenReady | Register offline IPC and open the window. The first signed-in account opens encrypted storage. |
| 4 | 26-28 | window-all-closed | window-all-closed |
