// server/src/routes/profile.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { logAudit } from '../utils/auditLogger.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../middleware/consent.js';
import { requireRoles } from '../middleware/rbac.js';
import { logPhiAccess } from '../utils/phiLogger.js';

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

// =============================================================================
// IMMUNIZATION RECORDS (Clinical staff only)
// =============================================================================

/**
 * GET /api/profile/:userId/immunizations
 * Retrieve a patient's immunization history JSON array for clinical review.
 * Gated to DOCTOR / DENTIST / NURSE / ADMIN.
 */
router.get(
  '/:userId/immunizations',
  authenticateToken,
  requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'),
  async (req, res) => {
    const targetUserId = Number(req.params.userId);

    if (!targetUserId || Number.isNaN(targetUserId)) {
      return res.status(400).json({ error: 'A valid numeric userId is required.' });
    }

    try {
      const [rows] = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS identifier_no,
                hp.profile_id, hp.immunization_history, hp.updated_at
         FROM USERS u
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE u.user_id = ? AND u.deleted_at IS NULL`,
        [targetUserId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found.' });
      }

      const row = rows[0];
      let immunizations = [];

      const raw = row.immunization_history;
      if (raw) {
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed)) {
            immunizations = parsed.map((v) => String(v));
          }
        } catch (_) {
          immunizations = [];
        }
      }

      // R.A. 10173: log the PHI read
      logPhiAccess({
        viewerUserId: req.user.user_id,
        patientUserId: targetUserId,
        table: 'HEALTH_PROFILES',
        recordId: row.profile_id || targetUserId,
        purpose: 'Immunization Record Review',
        ipAddress: req.ip,
      });

      res.json({
        patient: {
          user_id: row.user_id,
          first_name: row.first_name,
          last_name: row.last_name,
          identifier_no: row.identifier_no,
        },
        immunizations,
        updated_at: row.updated_at,
      });
    } catch (error) {
      console.error('[Immunization Fetch Error]:', error);
      res.status(500).json({ error: 'Failed to fetch immunization records.' });
    }
  }
);

/**
 * POST /api/profile/:userId/immunizations
 * Append one or more immunization entries to the patient's health profile.
 * Case-insensitive dedupe. Never overwrites existing entries.
 * Gated to DOCTOR / NURSE / ADMIN (the people who actually administer vaccines).
 */
router.post(
  '/:userId/immunizations',
  authenticateToken,
  requireRoles('DOCTOR', 'NURSE', 'ADMIN'),
  async (req, res) => {
    const targetUserId = Number(req.params.userId);
    const { immunizations } = req.body;

    if (!targetUserId || Number.isNaN(targetUserId)) {
      return res.status(400).json({ error: 'A valid numeric userId is required.' });
    }

    if (!Array.isArray(immunizations) || immunizations.length === 0) {
      return res.status(400).json({ error: 'At least one immunization entry is required.' });
    }

    // Sanitize: trim, enforce length cap, drop blanks
    const cleaned = immunizations
      .map((v) => String(v ?? '').trim())
      .filter((v) => v.length > 0 && v.length <= 120);

    if (cleaned.length === 0) {
      return res.status(400).json({ error: 'No valid immunization entries were provided.' });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT profile_id, immunization_history FROM HEALTH_PROFILES WHERE user_id = ? FOR UPDATE',
        [targetUserId]
      );

      let currentList = [];
      let action = 'CREATE';
      let recordId = null;
      const addedNow = [];

      if (rows.length > 0) {
        action = 'UPDATE';
        recordId = rows[0].profile_id;

        const raw = rows[0].immunization_history;
        if (raw) {
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(parsed)) currentList = parsed.map((v) => String(v));
          } catch (_) {
            currentList = [];
          }
        }

        // Case-insensitive dedupe so "Hepatitis B" and "hepatitis b" don't coexist
        const seen = new Set(currentList.map((s) => s.toLowerCase().trim()));
        for (const item of cleaned) {
          const key = item.toLowerCase();
          if (!seen.has(key)) {
            currentList.push(item);
            seen.add(key);
            addedNow.push(item);
          }
        }

        if (addedNow.length === 0) {
          await connection.rollback();
          return res.json({
            message: 'All provided immunizations were already on record. Nothing new added.',
            immunizations: currentList,
            addedCount: 0,
          });
        }

        await connection.query(
          'UPDATE HEALTH_PROFILES SET immunization_history = ?, version = version + 1 WHERE user_id = ?',
          [JSON.stringify(currentList), targetUserId]
        );
      } else {
        // No health profile yet — create one seeded with just the immunizations
        currentList = Array.from(new Set(cleaned));
        addedNow.push(...currentList);

        const [insertResult] = await connection.query(
          'INSERT INTO HEALTH_PROFILES (user_id, immunization_history) VALUES (?, ?)',
          [targetUserId, JSON.stringify(currentList)]
        );
        recordId = insertResult.insertId;
      }

      await logAudit(connection, {
        userId: req.user.user_id,
        action,
        table: 'HEALTH_PROFILES',
        recordId,
        oldValue: null,
        newValue: {
          operation: 'IMMUNIZATION_RECORDS_APPENDED',
          patient_user_id: targetUserId,
          added_immunizations: addedNow,
          total_immunizations: currentList.length,
        },
        ipAddress: req.ip,
      });

      await connection.commit();

      res.json({
        message: `Successfully added ${addedNow.length} immunization record${addedNow.length === 1 ? '' : 's'}.`,
        immunizations: currentList,
        addedCount: addedNow.length,
        addedItems: addedNow,
      });
    } catch (error) {
      await connection.rollback();
      console.error('[Immunization Add Error]:', error);
      res.status(500).json({ error: 'Failed to add immunization records.' });
    } finally {
      connection.release();
    }
  }
);

export default router;