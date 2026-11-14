import express from 'express';
import cors from 'cors';
import { loginUser, loginRateLimit } from './auth/login.js';
import { authenticateToken } from './auth/middleware.js';
import { changePassword } from './auth/password.js';
import { logoutUser } from './auth/logout.js';
import privacyRouter from './routes/privacy.js';
import profileRoutes from './routes/profile/index.js';
import healthPassRoutes from './routes/healthPass.js';
import appointmentRoutes from './routes/appointments/index.js';
import emergencyRouter from './routes/emergency/index.js';
import inventoryRoutes from './routes/inventory/index.js';
import documentRoutes from './routes/documents/index.js';
import adminRoutes from './routes/admin/index.js';
import analyticsRoutes from './routes/analytics/index.js';
import syncRoutes from './routes/sync/index.js';
import interactionsRoutes from './routes/interactions.js';
import signatureRoutes from './routes/signature.js';

// ── SEC-10 Remediation (CORS allow-list) ──────────────────────────────
// cors() (allow-everything) let ANY website reach the API from a
// student's or clinician's browser. Browser origins are now restricted
// to the known clinic clients: the Electron desktop console's Vite dev
// server and its packaged file:// build (which sends the opaque origin
// "null"), plus anything explicitly listed in CORS_ALLOWED_ORIGINS
// (e.g. a campus web portal). Non-browser clients — the Flutter mobile
// app, curl, service integrations — send no Origin header and are
// unaffected. The public verify.html page is served by this same
// origin and needs no cross-origin entry.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://localhost:5173',
  'https://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'file://',
  'null',
];
export function createOriginCheck() {
  const configuredAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredAllowedOrigins]);
  return origin => allowedOrigins.has(origin);
}

export function createApp({ isOriginAllowed = createOriginCheck() } = {}) {
  const app = express();

  // ── SEC-10 Remediation (trust proxy) ──────────────────────────────────
  // Behind Nginx/HAProxy/a load balancer, req.ip must honor the
  // X-Forwarded-For header set by that proxy — otherwise every client
  // shares the proxy's IP and a single rate-limit quota (audit SEC-10).
  // Opt in with TRUST_PROXY=true when the API runs behind a reverse
  // proxy; the default (unset) keeps direct-exposure behavior so clients
  // cannot spoof X-Forwarded-For against the per-IP limiters.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || isOriginAllowed(origin)) return callback(null, true);
        console.warn(`⚠️ [CORS] Cross-origin request from unauthorized origin blocked: ${origin}`);
        return callback(null, false);
      },
    })
  );
  app.use(express.json());

  // =============================================================================
  // R.A. 10173 ENCRYPTION IN TRANSIT & HTTP SECURITY HEADERS
  // =============================================================================
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // ── SEC-14 Remediation (Content-Security-Policy) ──────────────────────
    // Defense in depth against cross-site scripting on the HTML this API
    // serves — chiefly the public /api/documents/verify/:qrToken page
    // (verify.html), which renders patient-facing document data. The policy
    // is calibrated to that page's real asset needs:
    //   • script-src 'unsafe-inline' — verify.html ships an inline <script>
    //     and inline onclick handlers. External/CDN scripts stay forbidden
    //     ('self' only). Once the page's script is externalized to a
    //     same-origin asset, drop 'unsafe-inline' to harden this further.
    //   • style-src 'unsafe-inline' — the page's inline <style> block and
    //     style="" attributes.
    //   • img-src data: + https://api.qrserver.com — the inline SVG favicon
    //     and the third-party QR seal renderer the page depends on.
    //   • object-src 'none' / base-uri 'self' / form-action 'self' /
    //     frame-ancestors 'none' — hardening: no plugin content, no <base>
    //     or form hijacking, and no embedding (matches X-Frame-Options).
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://api.qrserver.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    );
    next();
  });

  return app;
}

export function mountApiRoutes(app, io, { restart } = {}) {
  app.post('/api/auth/login', loginRateLimit, loginUser);
  app.post('/api/auth/logout', authenticateToken, (req, res) => logoutUser(req, res, io));
  app.put('/api/auth/change-password', authenticateToken, changePassword);

  app.use('/api/privacy', privacyRouter);
  app.use('/api/profile', profileRoutes);
  app.use('/api/health-pass', healthPassRoutes);
  app.use('/api/appointments', appointmentRoutes(io));
  app.use('/api/emergency', emergencyRouter(io));
  app.use('/api/inventory', inventoryRoutes(io));
  app.use('/api/documents', documentRoutes(io));
  app.use('/api/admin', adminRoutes(io, restart));
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/interactions', interactionsRoutes);
  app.use('/api/signature', signatureRoutes);

  // ── Lightweight liveness probe for the desktop ping monitor ──────
  // Intentionally unauthenticated and DB-free so it measures pure
  // network + server-loop latency, not MySQL query time.
  app.get('/api/ping', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, t: Date.now() });
  });
}
