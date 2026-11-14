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
```

The packaged smoke test launches the unpacked app with a temporary profile, uses synthetic renderer fixtures, and reports login, fixture sign-in, role-switch timings, and renderer JavaScript heap snapshots. It checks the preload bridge, local assets, SQLite replay, encounter submission, role switching, profile saves, and staff analytics permissions. Use a recent Node.js release with native WebSocket and SQLite support.

## Desktop interaction

Hover over an analytics line graph to highlight the nearest reporting day and see its count. Use **View data** to read the same values with the keyboard.

Use the sidebar to change workspaces. In tab groups, use Left and Right Arrow to move, and Home or End to jump to the first or last tab. Doctor/Dentist and Analytics activate local panels as focus moves. Account and Inventory views activate with Enter or Space.

Modal dialogs keep the keyboard inside and return focus when dismissed. Read-only previews support clicking outside. Editable dialogs use their Close, Cancel, or Return to form actions. During a save, wait for the result. For a failed save, use the action again after reviewing the error. SOS incident documentation still supports **Skip for now**.

Controls lift or press by 1 px, with 90 ms press feedback and a 140 ms release. Tabs enter in 220 ms and slide 4 px in the direction of selection. Main sidebar views slide 8 px and fade in over 240 ms. Later destinations enter from the right and earlier ones from the left. Switching roles uses a fade. SOS messages and analytics access changes appear immediately. Windows reduced-motion settings and print disable these effects.

The packaged smoke suite exercises native keyboard input, review draft retention, pending and failed saves, analytics revocation, reduced motion, and narrow dialog layout.

The consoles load eagerly. QR decoding loads on first use, and the updater module loads after the window is shown. Audit and system-health reads start when staff open the corresponding view. In paired local packaged runs, role-level lazy loading reduced initial JavaScript from 866 KB to 336 KB but increased login readiness from about 0.85 s to 0.96 s and first switches into Nurse, Admin, and Responder from 4–42 ms to roughly 330–350 ms. The smoke test can be rerun against future builds to compare that tradeoff.

## Offline icons and fonts

The renderer bundles [Material Symbols Outlined](./src/img_icons/material-symbols-outlined.woff2), [Inter](https://fonts.google.com/specimen/Inter), and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) from `src/img_icons/`. The Material Symbols font contains the icon set as ligatures. Inline SVG icons and the favicon are already local.

Vite reads the checked-in font files during the build and packages them with their [licenses](./public/licenses/). Once npm dependencies are installed, `npm run build` and renderer icon and font loading work without Google or internet access. The icon font comes from [Google's Material Design Icons repository at `10ecc147`](https://github.com/google/material-design-icons/tree/10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7/variablefont).

Feature controllers and their views live in `src/features/`. See the [code-slice index](./docs/CODESLICE.md) for entry points.
