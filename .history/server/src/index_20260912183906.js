// server/src/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { loginUser, authenticateToken } from './auth.js';

// Route imports
import profileRoutes from './routes/profile.js';
import healthPassRoutes from './routes/healthPass.js';
import appointmentRoutes from './routes/appointments.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Public Auth Routes
app.post('/api/auth/login', loginUser);

// Protected Core Modules
app.use('/api/profile', profileRoutes);
app.use('/api/health-pass', healthPassRoutes);
app.use('/api/appointments', appointmentRoutes);

// Auth verification check
app.get('/api/users/me', authenticateToken, (req, res) => {
  res.json({ message: 'Authenticated', user: req.user });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Valetudo HealthLink API running on port ${PORT}`);
});