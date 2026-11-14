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

## Verification

```powershell
npm test
npm run test:smoke
# To test a different unpacked Windows build
npm run test:smoke -- 'release/alternate/win-unpacked/Valetudo HealthLink.exe'
# Verify only offline migration and replay on that packaged build
npm run test:smoke -- 'release/alternate/win-unpacked/Valetudo HealthLink.exe' --offline-only
```

The packaged smoke test launches the unpacked app with a temporary profile, uses synthetic renderer fixtures, and reports login, fixture sign-in, role-switch timings, and renderer JavaScript heap snapshots. It checks the preload bridge, local assets, SQLite replay, encounter submission, role switching, profile saves, and staff analytics permissions. Use a recent Node.js release with native WebSocket and SQLite support.

## Desktop interaction

Super Admins can grant **Use server Terminal** when creating or editing a Limited Admin. The grant enables server events and built-in diagnostics. Restart Server is available to Super Admins.

Student, Faculty and Non-Teaching account creation includes optional sex, date of birth and emergency contact details.

The Admin Terminal focuses its command prompt as soon as the tab opens. Press Enter to run a command and keep typing in the prompt. New output stays in view while the terminal is following the latest line. Requests time out without locking the prompt.

Hover over an analytics line graph to highlight the nearest reporting day and see its count. Use **View data** to read the same values with the keyboard.

Use the sidebar to change workspaces. In tab groups, use Left and Right Arrow to move, and Home or End to jump to the first or last tab. Doctor/Dentist and Analytics activate local panels as focus moves. Account and Inventory views activate with Enter or Space.

Modal dialogs keep the keyboard inside and return focus when dismissed. Read-only previews support clicking outside. Editable dialogs use their Close, Cancel, or Return to form actions. During a save, wait for the result. For a failed save, use the action again after reviewing the error. SOS incident documentation still supports **Skip for now**.

Controls lift or press by 1 px, with 90 ms press feedback and a 140 ms release. Tabs enter in 220 ms and slide 4 px in the direction of selection. Main sidebar views slide 8 px and fade in over 240 ms. Later destinations enter from the right and earlier ones from the left. Switching roles uses a fade. SOS messages and analytics access changes appear immediately. Windows reduced-motion settings and print disable these effects.

The packaged smoke suite exercises native keyboard input, review draft retention, pending and failed saves, analytics revocation, reduced motion, and narrow dialog layout.

The sign-in screen loads first. The renderer starts loading a single shared staff console bundle during idle time after rendering sign-in. If staff sign in while that bundle is still loading, the form waits for it before opening the workspace. Role switches then use the loaded bundle. QR decoding loads on first use, and the updater loads after the window is shown. Audit and system-health reads start when staff open the corresponding view.

Offline storage opens on the first signed-in account. The first sign-in after upgrading may need to migrate the legacy SQLite database before offline actions become available.

In three alternating packaged smoke runs with temporary profiles, initial JavaScript fell from 770 KB to 336 KB and median time to the sign-in form went from 731 ms to 675 ms. Individual startup times varied.

## Offline storage

Electron stores cached patient and encounter data and queued changes in `userData/valetudo_data/valetudo_offline_encrypted.db` using the SQLCipher mode of SQLite3 Multiple Ciphers. Electron's `safeStorage` protects the database key with Windows DPAPI. Keep the encrypted database and its wrapped key together for recovery under the same Windows profile. The application preserves queued changes when key access fails. Applications running under the same Windows user share that OS trust boundary.

The upgrade copies and verifies the old SQLite database, then removes the old file and its SQLite sidecars. On sign-in it imports the previous `localStorage` mirror by mutation ID before clearing that key. It preserves legacy rows whose owner is unknown. For unowned encounter creations, the server verifies appointment assignment before the desktop associates the row with the signed-in clinician. Other unassigned entries stay in encrypted storage for supervised recovery. Deleting the legacy files and clearing browser storage removes live references. Earlier backups and underlying storage remnants need their own retention or cleanup process.

Replaying after reconnection sends only the signed-in account's queued work. Acknowledged payloads are removed from the queue, and conflicts and rejected changes stay encrypted for review. Offline encounter saves require working encrypted storage. Attachment uploads still require a server connection.

## Offline icons and fonts

The renderer bundles [Material Symbols Outlined](./src/img_icons/material-symbols-outlined.woff2), [Inter](https://fonts.google.com/specimen/Inter), and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) from `src/img_icons/`. The Material Symbols font contains the icon set as ligatures. Inline SVG icons and the favicon are already local.

Vite reads the checked-in font files during the build and packages them with their [licenses](./public/licenses/). Once npm dependencies are installed, `npm run build` and renderer icon and font loading work without Google or internet access. The icon font comes from [Google's Material Design Icons repository at `10ecc147`](https://github.com/google/material-design-icons/tree/10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7/variablefont).

Feature controllers and their views live in `src/features/`. See the [code-slice index](./docs/CODESLICE.md) for entry points.
