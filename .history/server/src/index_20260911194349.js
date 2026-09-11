import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { loginUser, authenticateToken } from './auth.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Public Routes
app.post('/api/auth/login', loginUser);

// Protected Test Route (Returns current user from JWT)
app.get('/api/users/me', authenticateToken, (req, res) => {
  res.json({
    message: 'Protected route accessed successfully.',
    user: req.user,
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Valetudo HealthLink API listening on port ${PORT}`);
});