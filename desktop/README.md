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

The packaged smoke test launches the unpacked app with a temporary profile, uses synthetic renderer fixtures, and reports login and role-switch timings. It checks the preload bridge, local assets, SQLite replay, encounter submission, role switching, profile saves, and staff analytics permissions. Use a recent Node.js release with native WebSocket and SQLite support.

The consoles load eagerly. In paired local packaged runs, role-level lazy loading reduced initial JavaScript from 866 KB to 336 KB but increased login readiness from about 0.85 s to 0.96 s and first switches into Nurse, Admin, and Responder from 4–42 ms to roughly 330–350 ms. The smoke test can be rerun against future builds to compare that tradeoff.

## Offline icons

The renderer bundles [Material Symbols Outlined](./src/assets/fonts/material-symbols-outlined.woff2) through the local `@font-face` in `src/shared/ui/base.css`. Vite includes the variable WOFF2 in the renderer assets, and the installer ships it with the [Apache 2.0 license](./public/licenses/material-symbols-apache-2.0.txt). The font comes from [Google's Material Design Icons repository at `10ecc147`](https://github.com/google/material-design-icons/tree/10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7/variablefont).

Feature controllers and their views live in `src/features/`. See the [code-slice index](./docs/CODESLICE.md) for entry points.
