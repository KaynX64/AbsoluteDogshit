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
