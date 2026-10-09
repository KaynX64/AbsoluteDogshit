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


// Utilities (MinIO S3 & Redis)
import { ensureBucketExists } from './utils/s3Vault.js';
import { initRedis } from './utils/redisClient.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
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
export const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH'],
  },
});

// Socket.IO authentication middleware (asynchronous token validation)
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err && user) {
        socket.user = user;
      }
      next();
    });
  } else {
    next();
  }
});

io.on('connection', (socket) => {
  const userEmail = socket.user?.email || 'Anonymous / Kiosk';
  const roles = socket.user?.roles || [];
  console.log(`⚡ [Socket.IO ${isHttps ? 'WSS' : 'WS'}] Client connected: ${socket.id} (${userEmail})`);

  const authorizedRoles = ['EMERGENCY_RESPONDER', 'DOCTOR', 'NURSE', 'ADMIN'];
  if (roles.some((r) => authorizedRoles.includes(r))) {
    socket.join('responders');
    console.log(`🛡️ [Socket.IO] Socket ${socket.id} joined 'responders' room`);
  }

  // Explicit registration listener for mobile responders
  socket.on('join:responders', () => {
    socket.join('responders');
    console.log(`🛡️ [Socket.IO] Socket ${socket.id} manually joined 'responders' room`);
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
app.use('/api/inventory', inventoryRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/interactions', interactionsRoutes);

app.get('/api/users/me', authenticateToken, (req, res) => {
  res.json({ message: 'Authenticated', user: req.user });
});

// =============================================================================
// SERVER BOOTSTRAP (SINGLE LISTEN CALL)
// =============================================================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`✅ Valetudo HealthLink API & WebSockets running on ${isHttps ? 'HTTPS/WSS' : 'HTTP/WS'} port ${PORT}`);
  await initRedis().catch(() => {});
  await ensureBucketExists().catch(() => {});
  logActiveLimits();
  startReminderScheduler(io);
});