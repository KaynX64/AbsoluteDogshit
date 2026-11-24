# Valetudo HealthLink desktop console

Electron staff console built with React, TypeScript, and Vite. Module-specific architecture and security guidance lives in [AGENTS.md](./AGENTS.md); repository-wide setup is in the root [AGENTS.md](../AGENTS.md).

## Development

```powershell
npm install
npm run dev
```

The desktop renderer connects to the API configured by `app-config.json`. Vite bakes that API URL into the renderer at build time; changing the URL for a packaged app requires rebuilding it.

## Build and package

```powershell
npm run build
npm run dist
```

`npm run build` checks both TypeScript projects before building the renderer. `npm run dist` creates the Windows installer and unpacked app under `release/`. Do not edit or commit generated `dist/` or `release/` output.

Windows uses `src/assets/valetudo_icon.ico` for the executable, the running window, and new taskbar pins. The installed app and its Start Menu shortcut share a Windows application ID. Development uses a separate ID so a shortcut to Electron cannot share the installed app's taskbar button. If an existing pin still shows the old icon, unpin it and pin the updated app from the Start Menu.

## Verification

```powershell
npm test
# Check clinic layouts and admin workspace scrolling
npm run build
npm run test:layout
npm run test:smoke
# To test a different unpacked Windows build
npm run test:smoke -- 'release/alternate/win-unpacked/Valetudo HealthLink.exe'
# Verify only offline migration and replay on that packaged build
npm run test:smoke -- 'release/alternate/win-unpacked/Valetudo HealthLink.exe' --offline-only
```

Packaged smoke tests use synthetic data and an isolated profile to check preload, assets, SQLite replay, encounters, roles, profiles and permissions. They report startup timings and heap snapshots. Use Node.js with native WebSocket and SQLite support.

The Console and layout check use Chromium's hardware acceleration when the workstation supports it. The Console removes the GPU, GPU compositing, and GPU rasterization disable flags at startup. Chromium can still fall back to software when the hardware or driver is unavailable. The Console logs when Chromium reports that hardware compositing is unavailable.

## Desktop interaction

The dedicated responder console shows when each SOS was reported in Philippine time (PHT).

Doctor/Dentist sections use a [compact, contained layout](docs/COMPACT-CLINIC.md). See [consultation documents](docs/CONSULTATION-DOCUMENTS.md) for prescribing, read-only History, and EMR workflows.

Choose **Sign out** in the sidebar and confirm to end your session.

Super Admins can grant **Use server Terminal** when creating or editing a Limited Admin. The grant enables server events and built-in diagnostics. Restart Server is available to Super Admins.

Student, Faculty and Non-Teaching account creation includes optional sex, date of birth and emergency contact details.

Database Studio, account lists, Privacy & audit, and Incident Records keep their controls visible at desktop window sizes. Scroll within a table, the System tables list, or the incident list to see more records. Database Studio's pagination stays below the table.

The Admin Terminal focuses its command prompt as soon as the tab opens. Press Enter to run a command and keep typing in the prompt. New output stays in view while the terminal is following the latest line. Requests time out without locking the prompt.

Hover over an analytics line graph to highlight the nearest reporting day and see its count. Use **View data** to read the same values with the keyboard. Expanded tables scroll within the workspace.

Use the sidebar and keyboard to navigate. See [keyboard and dialog behavior](docs/COMPACT-CLINIC.md#keyboard-and-dialogs) for tab activation, focus and draft handling.

Controls lift or press by 1 px, with 90 ms press feedback and a 140 ms release. Tabs enter in 220 ms and slide 4 px in the direction of selection. Main sidebar views slide 8 px and fade in over 240 ms. Later destinations enter from the right and earlier ones from the left. Switching roles uses a fade. SOS messages and analytics access changes appear immediately. Windows reduced-motion settings and print disable these effects.

The packaged smoke suite exercises native keyboard input, review draft retention, pending and failed saves, analytics revocation, reduced motion, and narrow dialog layout.

The sign-in screen loads first. The renderer starts loading a single shared staff console bundle during idle time after rendering sign-in. If staff sign in while that bundle is still loading, the form waits for it before opening the workspace. Role switches then use the loaded bundle. QR decoding loads on first use, and the updater loads after the window is shown. Audit and system-health reads start when staff open the corresponding view.

Offline storage opens on the first signed-in account. The first sign-in after upgrading may need to migrate the legacy SQLite database before offline actions become available.

Three alternating packaged runs reduced initial JavaScript from 770 KB to 336 KB and median sign-in form paint from 731 ms to 675 ms; timings varied.

## Offline storage

Electron stores cached patient and encounter data and queued changes in `userData/valetudo_data/valetudo_offline_encrypted.db` using the SQLCipher mode of SQLite3 Multiple Ciphers. Electron's `safeStorage` protects the database key with Windows DPAPI. Keep the encrypted database and its wrapped key together for recovery under the same Windows profile. The application preserves queued changes when key access fails. Applications running under the same Windows user share that OS trust boundary.

The upgrade copies and verifies the old SQLite database, then removes the old file and its SQLite sidecars. On sign-in it imports the previous `localStorage` mirror by mutation ID before clearing that key. It preserves legacy rows whose owner is unknown. For unowned encounter creations, the server verifies appointment assignment before the desktop associates the row with the signed-in clinician. Other unassigned entries stay in encrypted storage for supervised recovery. The top-bar **Discard** action permanently removes unsynced, unassigned local changes and their orphaned drafts; use it only after confirming they are disposable test or stale data. Assigned and synced changes are not affected. Deleting the legacy files and clearing browser storage removes live references. Earlier backups and underlying storage remnants need their own retention or cleanup process.

Replaying after reconnection sends only the signed-in account's queued work. Acknowledged payloads are removed from the queue, and conflicts and rejected changes stay encrypted for review. Offline encounter saves require working encrypted storage. Attachment uploads still require a server connection.

## Offline icons and fonts

The renderer bundles [Material Symbols Outlined](./src/img_icons/material-symbols-outlined.woff2), [Inter](https://fonts.google.com/specimen/Inter), and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) from `src/img_icons/`. The Material Symbols font contains the icon set as ligatures. Inline SVG icons and the favicon are already local.

Vite reads the checked-in font files during the build and packages them with their [licenses](./public/licenses/). Once npm dependencies are installed, `npm run build` and renderer icon and font loading work without Google or internet access. The icon font comes from [Google's Material Design Icons repository at `10ecc147`](https://github.com/google/material-design-icons/tree/10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7/variablefont).

Feature controllers and their views live in `src/features/`. See the [code-slice index](./docs/CODESLICE.md) for entry points.

## SOS responder permissions

Non-clinical Qualified Responders can acknowledge an incident, view its limited details and open the map. Acknowledgment keeps the incident active. Dispatch, Resolve, False alarm and official incident reporting require authorized response staff; the Qualified Responder flag never removes existing staff permissions. Access is checked live by the API and shared across the desktop SOS controls. Deploy the server restrictions before updated clients; older clients receive a permission error for forbidden actions.

`npm run test:layout` also checks community/staff SOS buttons, live permission changes, denied closure and acknowledgment across the banner, dispatch console and nurse SOS band using synthetic fixtures in a hidden window.

Response staff can open **Alert history** and **Incident reports** from the sidebar. **Needs report** includes all unfinished work, **My drafts** resumes private desktop autosaves, and **Filed** is read-only with PDFs. **Save and return** preserves deferred work; over-24-hour items are highlighted. Draft conflicts preserve local text. Install server migration **015** before updated clients. [Workflow, permissions and API guide](../server/RESPONDER-RECORDS.md).

Returning to the app refreshes responder records in the background without clearing the visible table. Filter changes still load a new result set, and revoked permissions clear protected records. Empty SOS banners take no space above the page heading.

Report tabs prepare their default lists in the background and reuse recently loaded results when switching. Only search typing has a debounce delay. The bounded cache stays in memory, is invalidated by report updates and focus refreshes, and clears on access loss or leaving the records page; it never stores patient information in browser storage.
