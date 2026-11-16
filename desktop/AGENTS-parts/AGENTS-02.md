<!-- Desktop guidance, part 2 of 2. Paths in prose are relative to desktop/. -->

## Runtime ownership

- QR capture owns camera tracks, its decode loop, and uploaded image URLs in `useQrCapture.ts`. The decoder loads on demand. Document previews cancel pending reads and revoke blob URLs on replacement or unmount.
- Admin audit and telemetry requests follow the active view and its current grants. Dispatch keeps its polling fallback and gives realtime refreshes priority.
## Offline storage

- The first signed-in account opens or migrates the encrypted SQLite database through `electron/offline/database.cjs`. Electron `safeStorage` wraps the key for the OS profile. Keep the raw key in main and preserve the existing database when key access fails.
- `electron/offline/registerHandlers.cjs` binds queue operations to the active app account. `src/platform/offline/offlineQueue.ts` imports the legacy mirror by mutation ID before clearing it and sends only the signed-in account's pending changes. Unassigned legacy entries stay encrypted until ownership can be verified; the explicit top-bar discard action removes only unsynced unassigned rows and their orphaned drafts after confirmation. Keep clinical payloads out of browser storage.
- The encounter form clears only after the offline write succeeds. `src/platform/offline/offlineSync.ts` advances the bootstrap checkpoint only after every page is saved. See [offline storage and rollout details](../README.md#offline-storage).

## Shared desktop interaction

- Keep the shell height in `src/app/shell.css` so the workspace fits beneath the title bar. Feature views scroll within the shell and inherit its available height.
- Use `src/shared/ui/Dialog.tsx` for modal workflows, `ConfirmAction.tsx` for destructive confirmations, and `feedback.tsx` for inline action status. Keep save and draft state in the feature controller.
- Use `data-dialog-initial` on the heading for long reviews or on the safe action for destructive confirmations. Group headings and actions with `dialog-header` and `dialog-footer`. Keep form drafts safe from outside clicks.
- Link every tab to a panel. Use `navigateTabs` with automatic activation for local views and manual activation for views that fetch on selection. Use `selectionMotion.ts` for selection-driven motion and `interactions.css` for hover and press feedback. Keep destination order in `app/consoleNavigation.ts`. Mark route content with `data-workspace-view` and keep sticky controls and urgent messages outside those targets. Only staff-initiated navigation starts a workspace transition.

## Commands

`npm run dev` · `npm run build` (tsc -b + Vite) · `npm run dist` (build + electron-builder) · `npm test` · `npm run test:smoke` (Windows packaged app).

## Efficiency

- Read [the code-slice index](../docs/CODESLICE.md) before opening large feature files. Re-locate anchors with `rg -n` after edits.
- Keep styles near their owners and preserve the import order in `src/index.css`. Material Symbols, Inter, and JetBrains Mono are bundled under `src/img_icons/`.
- Use renderer source when editing UI. Inspect packaged files or lockfile entries when diagnosing a build or native dependency issue.
- If the packaged app shows TLS/cert errors talking to `https://localhost:5000`, suspect `apiBaseUrl` (loopback check in main), not the renderer code.
