<!-- Desktop guidance, part 2 of 2. Paths in prose are relative to desktop/. -->

## Runtime ownership

- QR capture owns camera tracks, its decode loop, and uploaded image URLs in `useQrCapture.ts`. The decoder loads on demand. Document previews cancel pending reads and revoke blob URLs on replacement or unmount.
- Admin audit and telemetry requests follow the active view and its current grants. Dispatch keeps its polling fallback and gives realtime refreshes priority.
- Responder record tabs use the page-owned `RecordPageCache`: at most eight in-memory queries, 15-second freshness, shared in-flight reads and default-tab prefetch. Report/focus updates invalidate freshness; access loss and unmount clear snapshots. Keep search debounced, cancel obsolete reads, and never persist these PHI summaries in browser storage.
## Offline storage

- The first signed-in account opens or migrates the encrypted SQLite database through `electron/offline/database.cjs`. Electron `safeStorage` wraps the key for the OS profile. Keep the raw key in main and preserve the existing database when key access fails.
- `electron/offline/registerHandlers.cjs` binds queue operations to the active app account. `src/platform/offline/offlineQueue.ts` imports the legacy mirror by mutation ID before clearing it and sends only the signed-in account's pending changes. Unassigned legacy entries stay encrypted until ownership can be verified; the explicit top-bar discard action removes only unsynced unassigned rows and their orphaned drafts after confirmation. Keep clinical payloads out of browser storage.
- The encounter form clears only after the offline write succeeds. `src/platform/offline/offlineSync.ts` advances the bootstrap checkpoint only after every page is saved. See [offline storage and rollout details](../README.md#offline-storage).

## Shared desktop interaction

- Keep the shell height in `src/app/shell.css` so the workspace fits beneath the title bar. Doctor/Dentist clinic sections inherit this height and keep their forms/actions visible; scroll notes, patient lists and other long components internally. The clinic CSS enables this at 1024px × 700px and above, with an accessible flowing fallback below that. Do not restore whole-workspace scrolling for ordinary clinic sections. Run `npm run build` and `npm run test:layout` when changing these constraints.
- Database Studio, account lists, Privacy & audit, and Incident Records use the same desktop breakpoint and flowing fallback. Keep their headings and controls in the available workspace and scroll the record lists independently. Their layout rules live in `features/admin/AdminConsole.css` and `features/admin/database-studio.css` under `src/`.
- Account views use `data-account-workspace` for compact headings, tabs and desktop padding. Keep role/status dropdowns, responder filtering and sorting in a wrapping toolbar with 36px controls. The permissions explanation is expandable below the table. Allow horizontal table scrolling and wrapping role badges so email, permissions and action columns stay readable. `npm run test:layout -- --admin-only` runs the Admin layout checks without unrelated clinic workflows; add `--dark` for dark mode.
- The shell marks `.app-main` and `.app-content` with `data-workspace-kind="records"` for Alert history/Incident reports and `"console"` otherwise. Scope role-specific shell selectors to the console kind: hidden consoles remain mounted to preserve drafts. Responder records use the same desktop breakpoint, with a scrolling table and reachable pagination; smaller windows use the flowing fallback. Documentation states have an 8px vertical gap. Sidebar count text uses `--text-on-danger` with the `--danger` fill across themes.
- Keep responder record chrome compact across roles: a short heading, tabs and counts sharing a wrapping row, 36px controls, and 12px section gaps. Desktop record padding is 16px 24px 20px; table cards and rows use 12px padding. Preserve the table's remaining height rather than adding separate summary or oversized filter rows.
- Use `Dialog.tsx`, `ConfirmAction.tsx` and `feedback.tsx` in `src/shared/ui/`; keep save/draft state in the controller. Add account scrolls only `.admin-create-user__body`; its header/footer stay outside that scroller.
- Admin archetype sections in Create/Edit account use live tonal, surface and text tokens, including selected permission cards and role buttons. Avoid fixed light fills with dark-mode text.
- Responder qualifications: preserve the bounded reads, draft revisions, pinned actions and refresh behavior in the [UI guide](../docs/RESPONDER-QUALIFICATIONS-UI.md). Account badges are read-only; [workflow and authority](../../server/RESPONDER-QUALIFICATIONS.md) remain server-enforced.
- All single-select dropdowns share `src/shared/ui/selects.css`, imported last by `src/index.css`. Use Chromium's `appearance: base-select` and `::picker(select)` for rounded, themed top-layer menus; retain native select/option semantics, disabled states and keyboard handling. Keep list boxes excluded and the platform fallback for unsupported preview browsers. Menus scroll at 320px and use theme tokens for text, selection and surfaces.
- Use `data-dialog-initial` on the heading for long reviews or on the safe action for destructive confirmations. Group headings and actions with `dialog-header` and `dialog-footer`. Keep form drafts safe from outside clicks.
- Prescribing lives in `StructuredPrescriptionGenerator.tsx`, `MedicationEditor.tsx` and `StructuredPrescriptionReview.tsx`; `PrescriptionGenerator.tsx` retains the import entry. Keep drafts in memory, invalidate review on edits, and retain the exact body/UUID after uncertain issuance until a retry resolves it. Server capability detection gates issuance. [Contract](../../server/STRUCTURED-PRESCRIBING.md).
- Link every tab to a panel. Use `navigateTabs` with automatic activation for local views and manual activation for views that fetch on selection. Use `selectionMotion.ts` for selection-driven motion and `interactions.css` for hover and press feedback. Keep destination order in `app/consoleNavigation.ts`. Mark route content with `data-workspace-view` and keep sticky controls and urgent messages outside those targets. Only staff-initiated navigation starts a workspace transition.

## Commands

`npm run dev` · `npm run build` (tsc -b + Vite) · `npm run dist` (build + electron-builder) · `npm test` · `npm run test:smoke` (Windows packaged app).

## Efficiency

- Read [the code-slice index](../docs/CODESLICE.md) before opening large feature files. Re-locate anchors with `rg -n` after edits.
- Keep styles near their owners and preserve the import order in `src/index.css`. Material Symbols, Inter, and JetBrains Mono are bundled under `src/img_icons/`.
- Use renderer source when editing UI. Inspect packaged files or lockfile entries when diagnosing a build or native dependency issue.
- If the packaged app shows TLS/cert errors talking to `https://localhost:5000`, suspect `apiBaseUrl` (loopback check in main), not the renderer code.
