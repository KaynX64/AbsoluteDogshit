// server/src/index.js
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { loginUser, authenticateToken, changePassword, loginRateLimit, logoutUser } from './auth.js';
import { logActiveLimits } from './config/limits.js';



// Route imports
import privacyRouter from './routes/privacy.js';
import profileRoutes from './routes/profile.js';
import healthPassRoutes from './routes/healthPass.js';
import appointmentRoutes from './routes/appointments.js';
import emergencyRouter from './routes/emergency.js'; 
import inventoryRoutes from './routes/inventory.js'; 
import documentRoutes from './routes/documents.js';   
import adminRoutes from './routes/admin.js';         
import analyticsRoutes from './routes/analytics.js'; 
import syncRoutes from './routes/sync.js';
import { startReminderScheduler } from './utils/reminderWorker.js';
import { JWT_SECRET } from './utils/secrets.js';
import interactionsRoutes from './routes/interactions.js';
import signatureRoutes from './routes/signature.js';


// Utilities (MinIO S3 & Redis)
import { ensureBucketExists } from './utils/s3Vault.js';
import { initRedis, redis, isRedisActive } from './utils/redisClient.js';
import { runAutoMigrations } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const CONFIGURED_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = [
  ...new Set([...DEFAULT_ALLOWED_ORIGINS, ...CONFIGURED_ALLOWED_ORIGINS]),
];

function isOriginAllowed(origin) {
  return ALLOWED_ORIGINS.includes(origin);
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

// =============================================================================
// TLS / HTTPS ENGINE INITIALIZATION
// =============================================================================
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

// Mount Secure WebSockets (WSS over HTTPS)
// ── SEC-10: the same origin allow-list as the HTTP API. Engine.IO
// aborts the handshake when the origin callback errors, so browser
// pages from unauthorized origins cannot open realtime connections
// either (non-browser clients send no Origin header and pass).
export const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || isOriginAllowed(origin)) return callback(null, true);
      console.warn(`⚠️ [Socket.IO CORS] Handshake from unauthorized origin rejected: ${origin}`);
      return callback(new Error('Origin not allowed by Socket.IO CORS policy'), false);
    },
    methods: ['GET', 'POST', 'PATCH'],
  },
});

// Socket.IO authentication middleware (asynchronous token validation)
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
  if (!token) {
    return next(new Error('Authentication required for WebSocket connection.'));
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err || !user) {
      return next(new Error('Invalid or expired WebSocket authentication token.'));
    }

    // Check Redis token revocation blacklist
    if (isRedisActive()) {
      try {
        const blacklistKey = user.jti
          ? `token:blacklist:${user.jti}`
          : `token:blacklist:${token}`;
        const isRevoked = await redis.get(blacklistKey);
        if (isRevoked) {
          return next(new Error('WebSocket session revoked. Please re-authenticate.'));
        }
      } catch (redisErr) {
        console.error('[Socket.IO Revocation Check Warning]:', redisErr.message);
      }
    }

    socket.user = user;
    next();
  });
});

io.on('connection', (socket) => {
  const userEmail = socket.user?.email || 'Authenticated User';
  const userId = socket.user?.user_id;
  const clientInstanceId = socket.handshake.auth?.clientInstanceId;
  console.log(`⚡ [Socket.IO ${isHttps ? 'WSS' : 'WS'}] Client connected: ${socket.id} (${userEmail})`);

  // ── Qualified Responder: per-user delivery rooms ─────────────────
  // EVERY authenticated socket joins its own user:<id> room. SOS alerts and
  // responder flag changes are emitted to these rooms — never to a shared
  // role room — because room membership would go stale (role edits,
  // suspensions, DB Studio edits) while the flag is always resolved live
  // from the database at dispatch time. Desktop sockets also join a
  // per-window room so actions such as incident documentation can target
  // only the renderer that initiated them.
  if (userId) {
    socket.join(`user:${userId}`);
    if (
      typeof clientInstanceId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientInstanceId)
    ) {
      socket.join(`desktop:${userId}:${clientInstanceId}`);
    }
  }

  // Legacy 'responders' room registration from older mobile builds. The
  // server no longer maintains that room (alerts are delivered per user
  // above), so this is kept purely as a harmless acknowledgement — an old
  // build emitting join:responders still receives every alert in its own
  // user room and never errors.
  socket.on('join:responders', () => {
    console.log(
      `🛡️ [Socket.IO] Legacy join:responders acknowledged for ${socket.id} (${userEmail}) — delivery now targets user:${userId}`
    );
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 [Socket.IO] Client disconnected: ${socket.id} (${reason})`);
  });
});

// =============================================================================
// API ROUTES
// =============================================================================
app.post('/api/auth/login', loginRateLimit, loginUser);
app.post('/api/auth/logout', authenticateToken, logoutUser);  
app.put('/api/auth/change-password', authenticateToken, changePassword);

app.use('/api/privacy', privacyRouter);
app.use('/api/profile', profileRoutes);
app.use('/api/health-pass', healthPassRoutes);
app.use('/api/appointments', appointmentRoutes(io));
app.use('/api/emergency', emergencyRouter(io));
app.use('/api/inventory', inventoryRoutes(io));
app.use('/api/documents', documentRoutes(io));
app.use('/api/admin', adminRoutes(io));
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

// =============================================================================
// SERVER BOOTSTRAP (SINGLE LISTEN CALL)
// =============================================================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`✅ Valetudo HealthLink API & WebSockets running on ${isHttps ? 'HTTPS/WSS' : 'HTTP/WS'} port ${PORT}`);
  await initRedis().catch(() => {});
  await ensureBucketExists().catch(() => {});
  await runAutoMigrations().catch(() => {});
  logActiveLimits();
  startReminderScheduler(io);
});