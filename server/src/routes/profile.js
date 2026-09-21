// server/src/routes/profile.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { logAudit } from '../utils/auditLogger.js';
import { encryptPHI, decryptPHI } from '../utils/encryption.js';
import { logPHIAccess } from '../utils/logger.js';
import { requireRoles } from '../middleware/rbac.js'; 

const router = express.Router();

// GET /api/profile/me - Fetch authenticated user's profile and medical history
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // 1. Fetch user baseline info + student profile (if student)
    const [userRows] = await pool.query(
      `SELECT u.user_id, u.email, u.first_name, u.last_name, u.phone,
              sp.student_no, sp.course, sp.year_level
       FROM USERS u
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       WHERE u.user_id = ?`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // 2. Fetch or initialize Health Profile
    const [healthRows] = await pool.query(
      `SELECT profile_id, blood_type, allergies, chronic_conditions,
              emergency_contact_name, emergency_contact_phone, height, weight, updated_at
       FROM HEALTH_PROFILES
       WHERE user_id = ?`,
      [userId]
    );

    let healthProfile = null;

    if (healthRows.length > 0) {
      const rawProfile = healthRows[0];

      // 3. Strictly log read access before exposing decrypted PHI
      await logPHIAccess(
        userId, 
        userId, 
        'Patient Self-Access of Mobile Health Profile',
        'HEALTH_PROFILES',
        rawProfile.profile_id
      );

      // 4. FIX: Decrypt ALL sensitive PHI fields on read under RA 10173
      healthProfile = {
        ...rawProfile,
        blood_type: decryptPHI(rawProfile.blood_type),
        allergies: decryptPHI(rawProfile.allergies),
        chronic_conditions: decryptPHI(rawProfile.chronic_conditions),
        emergency_contact_name: decryptPHI(rawProfile.emergency_contact_name),
        emergency_contact_phone: decryptPHI(rawProfile.emergency_contact_phone),
      };
    }

    res.json({
      user: userRows[0],
      healthProfile,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to retrieve profile data.' });
  }
});

// PUT /api/profile/me - Update static health indicators with RA 10173 Audit Logging
router.put('/me', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;
  const {
    blood_type, allergies, chronic_conditions,
    emergency_contact_name, emergency_contact_phone, height, weight,
  } = req.body;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock and fetch the old data before changing it
    const [existing] = await connection.query(
      'SELECT * FROM HEALTH_PROFILES WHERE user_id = ? FOR UPDATE',
      [userId]
    );

    let oldData = null;
    let action = 'CREATE';
    let recordId = null;

    // FIX: Encrypt ALL sensitive PHI/PII fields uniformly before saving at-rest
    const encryptedBloodType = encryptPHI(blood_type);
    const encryptedAllergies = encryptPHI(allergies);
    const encryptedConditions = encryptPHI(chronic_conditions);
    const encryptedContactName = encryptPHI(emergency_contact_name);
    const encryptedContactPhone = encryptPHI(emergency_contact_phone);

    if (existing.length > 0) {
      oldData = existing[0];
      action = 'UPDATE';
      recordId = oldData.profile_id;

      // Update existing record with encrypted fields
      await connection.query(
        `UPDATE HEALTH_PROFILES 
         SET blood_type = ?, allergies = ?, chronic_conditions = ?,
             emergency_contact_name = ?, emergency_contact_phone = ?,
             height = ?, weight = ?, version = version + 1
         WHERE user_id = ?`,
        [
          encryptedBloodType, 
          encryptedAllergies, 
          encryptedConditions, 
          encryptedContactName, 
          encryptedContactPhone, 
          height, 
          weight, 
          userId
        ]
      );
    } else {
      // Insert new record if none exists
      const [result] = await connection.query(
        `INSERT INTO HEALTH_PROFILES 
         (user_id, blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, height, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, 
          encryptedBloodType, 
          encryptedAllergies, 
          encryptedConditions, 
          encryptedContactName, 
          encryptedContactPhone, 
          height, 
          weight
        ]
      );
      recordId = result.insertId;
    }

    const newData = { 
      blood_type: encryptedBloodType, 
      allergies: encryptedAllergies, 
      chronic_conditions: encryptedConditions, 
      emergency_contact_name: encryptedContactName, 
      emergency_contact_phone: encryptedContactPhone, 
      height, 
      weight 
    };

    // 2. Append to Global Cryptographic Audit Trail
    await logAudit(connection, {
      userId: req.user.user_id,
      action: action,
      table: 'HEALTH_PROFILES',
      recordId: recordId,
      oldValue: oldData,
      newValue: newData,
      ipAddress: req.ip
    });

    await connection.commit();
    res.json({ message: 'Health profile successfully updated under RA 10173 standards.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating health profile:', error);
    res.status(500).json({ error: 'Failed to update health profile.' });
  } finally {
    connection.release();
  }
});

// POST /api/profile/consent - Record user privacy consent
router.post('/consent', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;
  const { consent_version = 'v1.0-2026' } = req.body;

  try {
    await pool.query(
      `UPDATE USERS 
       SET consent_given = TRUE, 
           consent_timestamp = CURRENT_TIMESTAMP, 
           consent_version = ?
       WHERE user_id = ?`,
      [consent_version, userId]
    );

    res.json({ message: 'Data Privacy Consent recorded successfully.', consent_given: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record consent.' });
  }
});

// DELETE /api/profile/user/:id - Soft delete a user account (Triggers RA 10173 5-Year Retention Cron)
router.delete('/user/:id', authenticateToken, requireRoles('ADMIN'), async (req, res) => {
  const targetUserId = req.params.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `UPDATE USERS SET deleted_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE user_id = ?`,
      [targetUserId]
    );

    if (result.affectedRows === 0) {
      throw new Error('User not found.');
    }

    await connection.query(
      `UPDATE EMR_RECORDS SET deleted_at = CURRENT_TIMESTAMP WHERE patient_user_id = ?`,
      [targetUserId]
    );

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'DELETE',
      table: 'USERS',
      recordId: targetUserId,
      oldValue: { user_id: targetUserId, status: 'active' },
      newValue: { deleted_at: 'CURRENT_TIMESTAMP' },
      ipAddress: req.ip
    });

    await connection.commit();
    res.json({ message: 'User and associated medical records soft-deleted. Scheduled for 5-year RA 10173 retention cycle.' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ error: error.message || 'Failed to soft-delete user.' });
  } finally {
    connection.release();
  }
});

export default router;