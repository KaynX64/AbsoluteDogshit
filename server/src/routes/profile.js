// server/src/routes/profile.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { logAudit } from '../utils/auditLogger.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../middleware/consent.js';

const router = express.Router();

// GET /api/profile/me - Dynamically retrieves role-aware profile & clinical data
router.get('/me', authenticateToken, requirePrivacyConsent, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Join identity with role tables (Student, Staff, Faculty, Admin)
    const [userRows] = await pool.query(
      `SELECT u.user_id, u.email, u.first_name, u.last_name, u.phone,
              COALESCE(r.code, 'STUDENT') AS primary_role,
              COALESCE(r.name, 'Student Patient') AS role_name,
              sp.student_no, sp.course, sp.year_level,
              st.license_no, st.specialty,
              COALESCE(st.department, fp.department, sp.course, 'PSU Lingayen Campus') AS department,
              fp.position
       FROM USERS u
       LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
       LEFT JOIN ROLES r ON ur.role_id = r.role_id
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
       LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
       WHERE u.user_id = ? AND u.deleted_at IS NULL
       LIMIT 1`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Fetch clinical profile from HEALTH_PROFILES
    const [healthRows] = await pool.query(
      `SELECT profile_id, blood_type, allergies, chronic_conditions, immunization_history,
              emergency_contact_name, emergency_contact_phone, height, weight, updated_at
       FROM HEALTH_PROFILES
       WHERE user_id = ? AND deleted_at IS NULL`,
      [userId]
    );

    let healthProfile = healthRows.length > 0 ? healthRows[0] : null;

    if (healthProfile) {
      healthProfile.allergies = decrypt(healthProfile.allergies) || '';
      healthProfile.chronic_conditions = decrypt(healthProfile.chronic_conditions) || '';
    }

    res.json({
      user: userRows[0],
      healthProfile,
    });
  } catch (error) {
    console.error('[Profile API Error]:', error);
    res.status(500).json({ error: 'Failed to retrieve profile data from database.' });
  }
});

// PUT /api/profile/me - Dynamically persists updates to MySQL with AES-256 encryption
router.put('/me', authenticateToken, requirePrivacyConsent, async (req, res) => {
  const userId = req.user.user_id;
  const {
    phone,
    blood_type,
    allergies,
    chronic_conditions,
    emergency_contact_name,
    emergency_contact_phone,
    height,
    weight,
  } = req.body;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (phone !== undefined && phone !== null) {
      await connection.query('UPDATE USERS SET phone = ? WHERE user_id = ?', [phone.trim(), userId]);
    }

    const [existing] = await connection.query(
      'SELECT * FROM HEALTH_PROFILES WHERE user_id = ? FOR UPDATE',
      [userId]
    );

    let action = 'CREATE';
    let recordId = null;

    if (existing.length > 0) {
      const old = existing[0];
      action = 'UPDATE';
      recordId = old.profile_id;

      const updatedBlood = blood_type !== undefined ? blood_type : old.blood_type;
      const updatedAllergies = allergies !== undefined ? encrypt(allergies) : old.allergies;
      const updatedConditions = chronic_conditions !== undefined ? encrypt(chronic_conditions) : old.chronic_conditions;
      const updatedEmName = emergency_contact_name !== undefined ? emergency_contact_name : old.emergency_contact_name;
      const updatedEmPhone = emergency_contact_phone !== undefined ? emergency_contact_phone : old.emergency_contact_phone;
      const updatedHeight = height !== undefined ? height : old.height;
      const updatedWeight = weight !== undefined ? weight : old.weight;

      await connection.query(
        `UPDATE HEALTH_PROFILES
         SET blood_type = ?, allergies = ?, chronic_conditions = ?,
             emergency_contact_name = ?, emergency_contact_phone = ?,
             height = ?, weight = ?, version = version + 1
         WHERE user_id = ?`,
        [updatedBlood, updatedAllergies, updatedConditions, updatedEmName, updatedEmPhone, updatedHeight, updatedWeight, userId]
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO HEALTH_PROFILES
         (user_id, blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, height, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          blood_type || null,
          allergies ? encrypt(allergies) : null,
          chronic_conditions ? encrypt(chronic_conditions) : null,
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
      newValue: { blood_type, height, weight, emergency_contact_name, encrypted: true },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({ message: 'Profile updated in database successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('[Profile Update Error]:', error);
    res.status(500).json({ error: 'Failed to update database record.' });
  } finally {
    connection.release();
  }
});

// POST /api/profile/fcm-token - Register device token for background push
router.post('/fcm-token', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;
  const { fcm_token, device_type = 'android' } = req.body;

  if (!fcm_token) return res.status(400).json({ error: 'fcm_token is required.' });

  try {
    await pool.query(
      `INSERT INTO DEVICE_TOKENS (user_id, fcm_token, device_type)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), device_type = VALUES(device_type)`,
      [userId, fcm_token.trim(), device_type]
    );
    console.log(`📱 [FCM] Successfully registered device token for user #${userId} (${device_type})`);
    res.json({ message: 'Device token registered for push notifications.' });
  } catch (err) {
    console.error('[FCM Token Registration Error]:', err);
    res.status(500).json({ error: 'Failed to save device token.' });
  }
});
// ── PUT /api/profile/patient/:userId/immunizations ────────────────────────────
// Allows authorized Clinical Staff (Doctor, Dentist, Nurse, Admin) to update a patient's vaccines
router.put('/patient/:userId/immunizations', authenticateToken, async (req, res) => {
  const targetUserId = Number(req.params.userId);
  const userRoles = req.user.roles || [];
  const isAuthorized = userRoles.some((r) => ['DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'].includes(r));

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Access Denied: Only clinical staff and administrators can update vaccination history.' });
  }

  const { immunizations } = req.body;
  if (!Array.isArray(immunizations)) {
    return res.status(400).json({ error: 'immunizations must be an array of vaccine names.' });
  }

  // Sanitize: unique, non-empty trimmed strings
  const cleanedList = Array.from(new Set(immunizations.map((v) => String(v).trim()).filter(Boolean)));
  const jsonPayload = JSON.stringify(cleanedList);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT profile_id FROM HEALTH_PROFILES WHERE user_id = ? FOR UPDATE',
      [targetUserId]
    );

    let profileId;
    if (existing.length > 0) {
      profileId = existing[0].profile_id;
      await connection.query(
        `UPDATE HEALTH_PROFILES 
         SET immunization_history = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE user_id = ?`,
        [jsonPayload, targetUserId]
      );
    } else {
      const [insertRes] = await connection.query(
        `INSERT INTO HEALTH_PROFILES (user_id, immunization_history)
         VALUES (?, ?)`,
        [targetUserId, jsonPayload]
      );
      profileId = insertRes.insertId;
    }

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'UPDATE',
      table: 'HEALTH_PROFILES',
      recordId: profileId,
      oldValue: null,
      newValue: {
        operation: 'IMMUNIZATION_HISTORY_UPDATE',
        target_user_id: targetUserId,
        count: cleanedList.length,
        vaccines: cleanedList,
      },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({
      message: 'Vaccination history updated successfully.',
      immunizations: cleanedList,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[Immunization Update Error]:', error);
    res.status(500).json({ error: 'Failed to update vaccination history.' });
  } finally {
    connection.release();
  }
});

// ── GET /api/profile/patient/:userId/immunizations ────────────────────────────
router.get('/patient/:userId/immunizations', authenticateToken, async (req, res) => {
  const targetUserId = Number(req.params.userId);
  try {
    const [rows] = await pool.query(
      'SELECT immunization_history FROM HEALTH_PROFILES WHERE user_id = ? AND deleted_at IS NULL',
      [targetUserId]
    );

    if (rows.length === 0 || !rows[0].immunization_history) {
      return res.json({ immunizations: [] });
    }

    let list = rows[0].immunization_history;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch (_) { list = [list]; }
    }
    res.json({ immunizations: Array.isArray(list) ? list : [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch immunization history.' });
  }
});
export default router;