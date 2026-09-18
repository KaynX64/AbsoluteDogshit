// server/src/routes/profile.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { logAudit } from '../utils/auditLogger.js';

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

    const healthProfile = healthRows.length > 0 ? healthRows[0] : null;

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

    // 1. Lock and fetch the old data before we change it
    const [existing] = await connection.query(
      'SELECT * FROM HEALTH_PROFILES WHERE user_id = ? FOR UPDATE',
      [userId]
    );

    let oldData = null;
    let action = 'CREATE';
    let recordId = null;

    if (existing.length > 0) {
      oldData = existing[0];
      action = 'UPDATE';
      recordId = oldData.profile_id;

      // Update existing record
      await connection.query(
        `UPDATE HEALTH_PROFILES 
         SET blood_type = ?, allergies = ?, chronic_conditions = ?,
             emergency_contact_name = ?, emergency_contact_phone = ?,
             height = ?, weight = ?, version = version + 1
         WHERE user_id = ?`,
        [blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, height, weight, userId]
      );
    } else {
      // Insert new record if none exists
      const [result] = await connection.query(
        `INSERT INTO HEALTH_PROFILES 
         (user_id, blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, height, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, height, weight]
      );
      recordId = result.insertId;
    }

    const newData = { blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, height, weight };

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
    res.json({ message: 'Health profile successfully updated.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating health profile:', error);
    res.status(500).json({ error: 'Failed to update health profile.' });
  } finally {
    connection.release();
  }
});

export default router;