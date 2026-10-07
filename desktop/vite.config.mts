// desktop/vite.config.mts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const certPath = path.resolve(__dirname, '../server/certs/cert.pem');
const keyPath = path.resolve(__dirname, '../server/certs/key.pem');

const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

export default defineConfig({
  plugins: [react()],

  // ── CRITICAL for Electron production builds ─────────────────────────────
  // Emit relative asset URLs (./assets/...) so they resolve correctly
  // when the app is loaded via file:// protocol inside the packaged .exe.
  base: './',

  server: {
    host: '127.0.0.1',
    port: 5173,
    https: hasCerts
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        }
      : undefined,
  },
});