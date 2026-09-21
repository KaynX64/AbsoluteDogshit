// server/src/routes/profile.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { logAudit } from '../utils/auditLogger.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../middleware/consent.js';

const router = express.Router();

// GET /api/profile/me
router.get('/me', authenticateToken, requirePrivacyConsent, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const [userRows] = await pool.query(
      `SELECT u.user_id, u.email, u.first_name, u.last_name, u.phone,
              sp.student_no, sp.course, sp.year_level
       FROM USERS u
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       WHERE u.user_id = ?`,
      [userId]
    );

    if (userRows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const [healthRows] = await pool.query(
      `SELECT profile_id, blood_type, allergies, chronic_conditions,
              emergency_contact_name, emergency_contact_phone, height, weight, updated_at
       FROM HEALTH_PROFILES
       WHERE user_id = ? AND deleted_at IS NULL`,
      [userId]
    );

    let healthProfile = healthRows.length > 0 ? healthRows[0] : null;

    if (healthProfile) {
      // Decrypt sensitive medical indicators before sending over TLS
      healthProfile.allergies = decrypt(healthProfile.allergies);
      healthProfile.chronic_conditions = decrypt(healthProfile.chronic_conditions);
    }

    res.json({
      user: userRows[0],
      healthProfile,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve profile data.' });
  }
});

// PUT /api/profile/me
router.put('/me', authenticateToken, requirePrivacyConsent, async (req, res) => {
  const userId = req.user.user_id;
  const {
    blood_type, allergies, chronic_conditions,
    emergency_contact_name, emergency_contact_phone, height, weight,
  } = req.body;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT * FROM HEALTH_PROFILES WHERE user_id = ? FOR UPDATE',
      [userId]
    );

    // Encrypt confidential indicators with AES-256 before writing to MySQL
    const encryptedAllergies = encrypt(allergies);
    const encryptedConditions = encrypt(chronic_conditions);

    let oldData = null;
    let action = 'CREATE';
    let recordId = null;

    if (existing.length > 0) {
      oldData = { ...existing[0] };
      action = 'UPDATE';
      recordId = oldData.profile_id;

      await connection.query(
        `UPDATE HEALTH_PROFILES 
         SET blood_type = ?, allergies = ?, chronic_conditions = ?,
             emergency_contact_name = ?, emergency_contact_phone = ?,
             height = ?, weight = ?, version = version + 1
         WHERE user_id = ?`,
        [blood_type, encryptedAllergies, encryptedConditions, emergency_contact_name, emergency_contact_phone, height, weight, userId]
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO HEALTH_PROFILES 
         (user_id, blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, height, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, blood_type, encryptedAllergies, encryptedConditions, emergency_contact_name, emergency_contact_phone, height, weight]
      );
      recordId = result.insertId;
    }

    // Cryptographic audit log (records hash without exposing plaintext)
    await logAudit(connection, {
      userId: req.user.user_id,
      action,
      table: 'HEALTH_PROFILES',
      recordId,
      oldValue: null,
      newValue: { blood_type, height, weight, encrypted: true },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({ message: 'Health profile encrypted & saved successfully.' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: 'Failed to update health profile.' });
  } finally {
    connection.release();
  }
});

export default router;