import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { loginUser, authenticateToken } from './auth.js';

// Route imports
import profileRoutes from './routes/profile.js';
import healthPassRoutes from './routes/healthPass.js';
import appointmentRoutes from './routes/appointments.js';
import emergencyRouter from './routes/emergency.js'; // Feature 4
import inventoryRoutes from './routes/inventory.js'; // Feature 9

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. Create HTTP Server & Mount Socket.IO
const server = http.createServer(app);
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

// 2. Public Auth Routes
app.post('/api/auth/login', loginUser);

// 3. Protected Core Modules
// 3. Protected Core Modules
app.use('/api/profile', profileRoutes);
app.use('/api/health-pass', healthPassRoutes);
app.use('/api/appointments', appointmentRoutes(io)); // <-- Keep only this one
app.use('/api/emergency', emergencyRouter(io));
app.use('/api/inventory', inventoryRoutes);       // Feature 9 Inventory

// Auth verification check
app.get('/api/users/me', authenticateToken, (req, res) => {
  res.json({ message: 'Authenticated', user: req.user });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Valetudo HealthLink API & WebSockets running on port ${PORT}`);
});