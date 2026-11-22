const { API_BASE_URL, VITE_URL } = require('./config.cjs');

// ── Local API / loopback detection for certificate handling ─────────
// app-config.json points the desktop client at the API server. The repo's
// Node server serves TLS with a self-signed certificate
// (server/certs/cert.pem — not issued by any public CA), which Chromium
// rejects under strict validation. Dev builds already bypass certificate
// errors for the dev server and the API; without the same allowance a
// PACKAGED build (.exe / installer) can never reach a local server: every
// renderer fetch() and socket.io connection dies as a TLS error and the
// app reports the server as unreachable although it is running.
//
// The allowance is deliberately scoped: certificate errors are accepted
// ONLY for the configured API origin (https + wss) and ONLY while that
// API host is a loopback address — i.e. the client was deliberately
// pointed at a local server for workstation testing. Any other origin —
// and any non-loopback API configuration (a real deployment behind a
// CA-signed certificate) — keeps full strict validation.
const isLoopbackHostname = (hostname) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';

let API_IS_LOOPBACK = false;
try {
  API_IS_LOOPBACK = isLoopbackHostname(new URL(API_BASE_URL).hostname);
} catch (_) {
  /* malformed apiBaseUrl — stay strict */
}

// Exact-origin match (protocol + hostname + port). Safer than
// url.startsWith(...), which a URL like 'https://localhost:5000@evil/'
// (userinfo trick, host is actually evil) would fool. Accepts both the
// http(s) and ws(s) form of the base origin so one check covers fetch()
// and socket.io connections.
const isSameOrigin = (url, base) => {
  try {
    const u = new URL(url);
    const b = new URL(base);
    const wsProto = b.protocol === 'https:' ? 'wss:' : b.protocol === 'http:' ? 'ws:' : b.protocol;
    return (u.protocol === b.protocol || u.protocol === wsProto) && u.host === b.host;
  } catch (_) {
    return false;
  }
};

const isLocalApiUrl = (url) => isSameOrigin(url, API_BASE_URL);
const isDevServerUrl = (url) =>
  isSameOrigin(url, VITE_URL) ||
  isSameOrigin(url, 'https://localhost:5173') ||
  isSameOrigin(url, 'https://127.0.0.1:5173');

// 3. TLS CERTIFICATE ERRORS (LOCAL DEV + LOOPBACK API TESTING ONLY)
function handleCertificateError(isPackaged, event, url, callback) {
  // Dev builds: trust the Vite dev server and the local API — both run
  // with the repo's self-signed development certificates.
  if (!isPackaged && (isLocalApiUrl(url) || isDevServerUrl(url))) {
    event.preventDefault();
    callback(true);
    return;
  }

  // Packaged builds: allow the self-signed certificate ONLY for the
  // configured LOOPBACK API server (https + wss origins). This is what
  // lets an installed .exe talk to the local Node server during
  // workstation testing. Everything else stays strictly validated.
  if (isPackaged && API_IS_LOOPBACK && isLocalApiUrl(url)) {
    event.preventDefault();
    callback(true);
    return;
  }

  // Everything else: strict TLS (default Chromium behavior).
  callback(false);
}

function registerCertificatePolicy(app) {
  app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
    handleCertificateError(app.isPackaged, event, url, callback);
  });
}

module.exports = { registerCertificatePolicy };
