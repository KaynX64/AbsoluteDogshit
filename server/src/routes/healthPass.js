// server/src/routes/healthPass.js
import express from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';

const router = express.Router();

// GET /api/health-pass/token - Generates dynamic QR token for mobile user
router.get('/token', authenticateToken, (req, res) => {
  try {
    const userId = req.user.user_id;
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(4).toString('hex');

    // Payload: userId.timestamp.nonce
    const payload = `${userId}.${timestamp}.${nonce}`;
    const hmac = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(payload)
      .digest('hex');

    // Signed token format: userId.timestamp.nonce.signature
    const qrToken = `${payload}.${hmac}`;

    res.json({
      qrToken,
      expiresInSeconds: 300, // Client should refresh every 5 mins
    });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR token.' });
  }
});

// POST /api/health-pass/verify - Scanned by Nurse/Doctor on Electron
router.post('/verify', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  try {
    const { qrToken } = req.body;
    if (!qrToken) return res.status(400).json({ error: 'QR token required.' });

    const parts = qrToken.split('.');
    if (parts.length !== 4) {
      return res.status(400).json({ error: 'Invalid QR token format.' });
    }

    const [userId, timestampStr, nonce, receivedSig] = parts;
    const payload = `${userId}.${timestampStr}.${nonce}`;

    // Verify HMAC
    const expectedSig = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(payload)
      .digest('hex');

    if (expectedSig !== receivedSig) {
      return res.status(401).json({ error: 'QR verification failed: Invalid cryptographic signature.' });
    }

    // Check expiration (valid for 15 minutes to allow slow connections)
    const tokenTime = parseInt(timestampStr, 10);
    if (Date.now() - tokenTime > 15 * 60 * 1000) {
      return res.status(401).json({ error: 'QR pass expired. Ask student to refresh pass.' });
    }

    // Retrieve patient medical data for the clinic staff
    const [patient] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email,
              sp.student_no, sp.course, sp.year_level,
              hp.blood_type, hp.allergies, hp.chronic_conditions
       FROM USERS u
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
       WHERE u.user_id = ? AND u.is_active = TRUE`,
      [userId]
    );

    if (patient.length === 0) {
      return res.status(404).json({ error: 'Patient not found or deactivated.' });
    }

    res.json({
      verified: true,
      patient: patient[0],
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Error during verification.' });
  }
});

export default router;