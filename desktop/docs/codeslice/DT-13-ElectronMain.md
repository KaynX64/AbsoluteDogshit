# DT-13 · main.cjs

[Desktop slice index](../CODESLICE.md)

## DT-13 · desktop/electron/main.cjs

Window and permissions in `window.cjs` and `certificatePolicy.cjs`; storage and IPC in `offline/`; updater, printing, and notifications have dedicated modules.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-12 | — | Imports and declarations |
| 2 | 13-16 | removeSwitch | Remove launch flags that disable GPU acceleration |
| 3 | 18-28 | requestSingleInstanceLock | Lock the profile and log changes to unavailable hardware compositing |
| 4 | 30-34 | setAppUserModelId | Set the installed or development Windows app ID and register shared handlers |
| 5 | 36-40 | app.whenReady | Register offline IPC and open the window. The first signed-in account opens encrypted storage. |
| 6 | 42-44 | window-all-closed | Quit when all windows close, except on macOS |
