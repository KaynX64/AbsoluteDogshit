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

`npm run build` type-checks and builds the renderer. `npm run dist` creates the Windows installer under `release/`. Do not edit or commit generated `dist/` or `release/` output.

## Offline icons

The renderer bundles [Material Symbols Outlined](./src/assets/fonts/material-symbols-outlined.woff2) through the local `@font-face` in `src/index.css`. Vite includes the variable WOFF2 in the renderer assets, and the installer ships it with the [Apache 2.0 license](./public/licenses/material-symbols-apache-2.0.txt). The font comes from [Google's Material Design Icons repository at `10ecc147`](https://github.com/google/material-design-icons/tree/10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7/variablefont).
