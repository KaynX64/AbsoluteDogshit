// server/src/routes/healthPass.js
import express from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logPhiAccess } from '../utils/phiLogger.js';
import { decrypt } from '../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../middleware/consent.js';

const router = express.Router();
const HMAC_SECRET = process.env.JWT_SECRET || 'supersecretkeyvaletudo';

// GET /api/health-pass/token
router.get('/token', authenticateToken, requirePrivacyConsent, (req, res) => {
  try {
    const userId = req.user.user_id;
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(4).toString('hex');

    const payload = `${userId}.${timestamp}.${nonce}`;
    const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');

    const qrToken = `${payload}.${hmac}`;
    res.json({ qrToken, expiresInSeconds: 300 });
  } catch (error) {
    console.error('[HealthPass] QR generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR token.' });
  }
});

// POST /api/health-pass/verify
router.post('/verify', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  const { qrToken } = req.body;
  if (!qrToken) return res.status(400).json({ error: 'QR token required.' });

  const parts = qrToken.split('.');
  if (parts.length !== 4) {
    return res.status(400).json({ error: 'Invalid QR token format.' });
  }

  const [patientUserId, timestampStr, nonce, receivedSig] = parts;
  const payload = `${patientUserId}.${timestampStr}.${nonce}`;

  // 1. Compute expected signature using consistent HMAC secret
  const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');

  // Constant-time signature verification
  const expectedBuffer = Buffer.from(expectedSig);
  const receivedBuffer = Buffer.from(receivedSig);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return res.status(401).json({ error: 'QR verification failed: Invalid signature.' });
  }

  // 2. Expiration check (15 minutes grace window)
  const tokenTime = parseInt(timestampStr, 10);
  if (isNaN(tokenTime) || Date.now() - tokenTime > 15 * 60 * 1000) {
    return res.status(401).json({ error: 'QR pass expired. Ask student to refresh pass.' });
  }

  // 3. Acquire DB connection and execute queries safely inside try/finally
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // R.A. 10173 Consent check on the scanned patient
    const [consentRows] = await connection.query(
      `SELECT is_granted FROM CONSENT_RECORDS 
       WHERE user_id = ? 
       ORDER BY consent_id DESC LIMIT 1`,
      [patientUserId]
    );

    if (consentRows.length === 0 || !Boolean(consentRows[0].is_granted)) {
      await connection.rollback();
      return res.status(403).json({
        error: 'PRIVACY_CONSENT_REVOKED',
        message: 'Student has revoked or not granted R.A. 10173 data processing consent. Intake suspended.',
      });
    }

    // Retrieve active patient records
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
      await connection.rollback();
      return res.status(404).json({ error: 'Patient not found or deactivated.' });
    }

    // Log PHI read access
    logPhiAccess({
      viewerUserId: req.user.user_id,
      patientUserId: Number(patientUserId),
      table: 'HEALTH_PROFILES',
      recordId: Number(patientUserId),
      purpose: 'Touchless Clinic Check-In Scan',
      ipAddress: req.ip,
    });

    await connection.commit();

    const patientData = {
      ...patient[0],
      allergies: decrypt(patient[0].allergies),
      chronic_conditions: decrypt(patient[0].chronic_conditions),
    };

    res.json({
      verified: true,
      patient: patientData,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[HealthPass] Verification error:', error);
    res.status(500).json({ error: 'Error during verification.' });
  } finally {
    connection.release();
  }
});

export default router;