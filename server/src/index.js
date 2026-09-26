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
import { loginUser, authenticateToken } from './auth.js';
import jwt from 'jsonwebtoken';
import { ensureBucketExists } from './utils/s3Vault.js';

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
import { startReminderScheduler } from './utils/reminderWorker.js';

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
  const credentials = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  server = https.createServer(credentials, app);
  isHttps = true;
} else {
  console.warn('⚠️ [TLS Warning] Certs not found in server/certs/. Running unencrypted HTTP fallback.');
  server = http.createServer(app);
}

// Mount Secure WebSockets (WSS over HTTPS)
export const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH'],
  },
});

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeyvaletudo';

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

// 2. Connection Handler & Room Assignment
io.on('connection', (socket) => {
  const userEmail = socket.user?.email || 'Anonymous / Kiosk';
  const roles = socket.user?.roles || [];
  console.log(`⚡ [Socket.IO ${isHttps ? 'WSS' : 'WS'}] Client connected: ${socket.id} (${userEmail})`);

  const authorizedRoles = ['EMERGENCY_RESPONDER', 'DOCTOR', 'NURSE', 'ADMIN'];
  if (roles.some((r) => authorizedRoles.includes(r))) {
    socket.join('responders');
    console.log(`🛡️ [Socket.IO] Socket ${socket.id} joined 'responders' room`);
  }

  socket.on('disconnect', (reason) => {
    console.log(`🔌 [Socket.IO] Client disconnected: ${socket.id} (${reason})`);
  });
});

// 2. Public Auth Routes
app.post('/api/auth/login', loginUser);

// 3. Protected Core Modules
app.use('/api/privacy', privacyRouter);
app.use('/api/profile', profileRoutes);
app.use('/api/health-pass', healthPassRoutes);
app.use('/api/appointments', appointmentRoutes(io));
app.use('/api/emergency', emergencyRouter(io));
app.use('/api/inventory', inventoryRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/users/me', authenticateToken, (req, res) => {
  res.json({ message: 'Authenticated', user: req.user });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`✅ Valetudo HealthLink API & WebSockets running on ${isHttps ? 'HTTPS/WSS' : 'HTTP/WS'} port ${PORT}`);
  ensureBucketExists().catch(() => {});
  startReminderScheduler(io);
});