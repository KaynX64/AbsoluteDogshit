// server/src/routes/profile.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { logAudit } from '../utils/auditLogger.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../middleware/consent.js';

const router = express.Router();

// 1. GET /api/profile/me (Provides health profile data to mobile & desktop)
router.get('/me', authenticateToken, requirePrivacyConsent, async (req, res) => {
  const userId = req.user.user_id;
  try {
    const [users] = await pool.query(
      `SELECT u.user_id, u.email, u.first_name, u.last_name, u.phone,
              sp.student_no, sp.course, sp.year_level,
              fp.department, fp.position
       FROM USERS u
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
       WHERE u.user_id = ? AND u.deleted_at IS NULL`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User record not found.' });
    }

    const [healthProfiles] = await pool.query(
      `SELECT profile_id, blood_type, allergies, chronic_conditions, immunization_history,
              emergency_contact_name, emergency_contact_phone, height, weight, updated_at
       FROM HEALTH_PROFILES
       WHERE user_id = ? AND deleted_at IS NULL`,
      [userId]
    );

    const hp = healthProfiles[0] || {};
    const decryptedProfile = {
      ...hp,
      allergies: decrypt(hp.allergies) || '',
      chronic_conditions: decrypt(hp.chronic_conditions) || '',
    };

    res.json({
      user: users[0],
      healthProfile: decryptedProfile,
    });
  } catch (error) {
    console.error('[Profile Fetch Error]:', error);
    res.status(500).json({ error: 'Failed to load user health profile.' });
  }
});

// 2. PUT /api/profile/me
router.put('/me', authenticateToken, requirePrivacyConsent, async (req, res) => {
  const userId = req.user.user_id;
  const {
    blood_type, allergies, chronic_conditions,
    emergency_contact_name, emergency_contact_phone, height, weight, phone
  } = req.body;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (phone !== undefined) {
      await connection.query('UPDATE USERS SET phone = ? WHERE user_id = ?', [phone, userId]);
    }

    const [existing] = await connection.query(
      'SELECT * FROM HEALTH_PROFILES WHERE user_id = ? FOR UPDATE',
      [userId]
    );

    let oldData = null;
    let action = 'CREATE';
    let recordId = null;

    if (existing.length > 0) {
      oldData = { ...existing[0] };
      action = 'UPDATE';
      recordId = oldData.profile_id;

      const finalAllergies = allergies !== undefined ? encrypt(allergies) : oldData.allergies;
      const finalConditions = chronic_conditions !== undefined ? encrypt(chronic_conditions) : oldData.chronic_conditions;
      const finalBloodType = blood_type !== undefined ? blood_type : oldData.blood_type;
      const finalEmName = emergency_contact_name !== undefined ? emergency_contact_name : oldData.emergency_contact_name;
      const finalEmPhone = emergency_contact_phone !== undefined ? emergency_contact_phone : oldData.emergency_contact_phone;
      const finalHeight = height !== undefined ? height : oldData.height;
      const finalWeight = weight !== undefined ? weight : oldData.weight;

      await connection.query(
        `UPDATE HEALTH_PROFILES 
         SET blood_type = ?, allergies = ?, chronic_conditions = ?,
             emergency_contact_name = ?, emergency_contact_phone = ?,
             height = ?, weight = ?, version = version + 1
         WHERE user_id = ?`,
        [finalBloodType, finalAllergies, finalConditions, finalEmName, finalEmPhone, finalHeight, finalWeight, userId]
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO HEALTH_PROFILES 
         (user_id, blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, height, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          blood_type || null,
          encrypt(allergies || ''),
          encrypt(chronic_conditions || ''),
          emergency_contact_name || null,
          emergency_contact_phone || null,
          height || null,
          weight || null,
        ]
      );
      recordId = result.insertId;
    }

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
    console.error('[Profile Update Error]:', error);
    res.status(500).json({ error: 'Failed to update health profile.' });
  } finally {
    connection.release();
  }
});

export default router;