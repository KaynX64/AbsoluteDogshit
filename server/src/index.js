// server/src/index.js
import express from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { loginUser, authenticateToken } from './auth.js';
import { startRetentionCron } from './utils/dataRetention.js'; // <-- 1. IMPORT THE CRON JOB

// Route imports
import profileRoutes from './routes/profile.js';
import healthPassRoutes from './routes/healthPass.js';
import appointmentRoutes from './routes/appointments.js';
import emergencyRouter from './routes/emergency.js'; 
import inventoryRoutes from './routes/inventory.js'; 
import auditRoutes from './routes/audit.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const options = {
  key: fs.readFileSync(path.join(__dirname, '../../certs/server.key')),
  cert: fs.readFileSync(path.join(__dirname, '../../certs/server.cert'))
};

const server = https.createServer(options, app);
export const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH'],
  },
});

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

app.post('/api/auth/login', loginUser);

app.use('/api/profile', profileRoutes);
app.use('/api/health-pass', healthPassRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/emergency', emergencyRouter(io)); 
app.use('/api/inventory', inventoryRoutes);  
app.use('/api/audit', auditRoutes); // <-- 3. ADD THE AUDIT ROUTE     

app.get('/api/users/me', authenticateToken, (req, res) => {
  res.json({ message: 'Authenticated', user: req.user });
});

// 2. START THE CRON JOB
startRetentionCron();

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔒 Secure HTTPS Valetudo HealthLink API & WebSockets running on port ${PORT}`);
  console.log(`Desktop/Web Test URL: https://localhost:${PORT}`);
  console.log(`Mobile Emulator Test URL: https://10.0.2.2:${PORT}`);
});