// server/src/routes/healthPass.js
import express from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
// Remove logAudit if you are no longer using it elsewhere in this file
// import { logAudit } from '../utils/auditLogger.js';

// Use ES module import instead of require
import { logPHIAccess } from '../utils/logger.js'; 

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
      .createHmac('sha256', 'supersecretkeyvaletudo')
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
  const { qrToken } = req.body;
  if (!qrToken) return res.status(400).json({ error: 'QR token required.' });

  const parts = qrToken.split('.');
  if (parts.length !== 4) {
    return res.status(400).json({ error: 'Invalid QR token format.' });
  }

  const [patientUserId, timestampStr, nonce, receivedSig] = parts;
  const payload = `${patientUserId}.${timestampStr}.${nonce}`;

  // Verify HMAC (Done outside the DB transaction to save resources)
  const expectedSig = crypto.createHmac('sha256', 'supersecretkeyvaletudo').update(payload).digest('hex');
  if (expectedSig !== receivedSig) {
    return res.status(401).json({ error: 'QR verification failed: Invalid signature.' });
  }

  const tokenTime = parseInt(timestampStr, 10);
  if (Date.now() - tokenTime > 15 * 60 * 1000) {
    return res.status(401).json({ error: 'QR pass expired. Ask student to refresh pass.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Retrieve patient medical data
    const [patient] = await connection.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email,
              sp.student_no, sp.course, sp.year_level,
              hp.blood_type, hp.allergies, hp.chronic_conditions
       FROM USERS u
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
       WHERE u.user_id = ? AND u.is_active = TRUE`,
      [patientUserId]
    );

    if (patient.length === 0) {
      throw new Error('Patient not found or deactivated.');
    }

    // Correct PHI logging routed to PHI_ACCESS_LOGS with specific purpose
    await logPHIAccess(
      req.user.user_id, 
      patientUserId, 
      'QR Code Clinic Check-in and Triage'
    );

    await connection.commit();
    
    res.json({
      verified: true,
      patient: patient[0],
    });
  } catch (error) {
    await connection.rollback();
    if (error.message === 'Patient not found or deactivated.') {
      return res.status(404).json({ error: error.message });
    }
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Error during verification.' });
  } finally {
    connection.release();
  }
}); // <-- Added the missing closing brackets here

export default router;