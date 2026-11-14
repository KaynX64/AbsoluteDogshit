// Creates the HTTPS listener from local certificates and supports explicit local HTTP mode.

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createHttpServer(app) {
  const certPath = path.join(__dirname, '../certs/cert.pem');
  const keyPath = path.join(__dirname, '../certs/key.pem');

  let server;
  let isHttps = false;

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    server = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app);
    isHttps = true;
  } else if (process.env.ALLOW_INSECURE_HTTP === 'true') {
    console.warn('⚠️ [TLS Warning] TLS disabled by explicit ALLOW_INSECURE_HTTP=true. PHI will transit in CLEARTEXT.');
    server = http.createServer(app);
  } else {
    console.error('❌ [TLS Fatal] server/certs/{cert,key}.pem not found. Refusing to serve PHI over plaintext HTTP.');
    console.error('   Set ALLOW_INSECURE_HTTP=true only for isolated local development.');
    process.exit(1);
  }

  return { server, isHttps };
}
