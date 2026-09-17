// server/src/routes/profile.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';

const router = express.Router();

// 1. GET /api/profile/me - Authenticated user views their own profile
router.get('/me', authenticateToken, async (req, res) => {
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

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const [healthRows] = await pool.query(
      `SELECT profile_id, blood_type, allergies, chronic_conditions,
              immunization_history, emergency_contact_name, emergency_contact_phone,
              height, weight, version, updated_at
       FROM HEALTH_PROFILES
       WHERE user_id = ?`,
      [userId]
    );

    res.json({
      user: userRows[0],
      healthProfile: healthRows.length > 0 ? healthRows[0] : null,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to retrieve profile data.' });
  }
});

// 2. PUT /api/profile/me - Student updates personal contact & emergency contact
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { phone, emergency_contact_name, emergency_contact_phone } = req.body;

    if (phone !== undefined) {
      await pool.query('UPDATE USERS SET phone = ? WHERE user_id = ?', [phone, userId]);
    }

    const [existing] = await pool.query('SELECT profile_id FROM HEALTH_PROFILES WHERE user_id = ?', [userId]);

    if (existing.length > 0) {
      await pool.query(
        `UPDATE HEALTH_PROFILES 
         SET emergency_contact_name = ?, emergency_contact_phone = ?, version = version + 1
         WHERE user_id = ?`,
        [emergency_contact_name || null, emergency_contact_phone || null, userId]
      );
    } else {
      await pool.query(
        `INSERT INTO HEALTH_PROFILES (user_id, emergency_contact_name, emergency_contact_phone)
         VALUES (?, ?, ?)`,
        [userId, emergency_contact_name || null, emergency_contact_phone || null]
      );
    }

    res.json({ message: 'Contact and emergency details updated.' });
  } catch (error) {
    console.error('Error updating contact profile:', error);
    res.status(500).json({ error: 'Failed to update contact info.' });
  }
});

// 3. PUT /api/profile/patient/:userId - Clinic staff updates verified clinical indicators
router.put('/patient/:userId', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const {
      blood_type,
      allergies,
      chronic_conditions,
      immunization_history,
      height,
      weight,
      emergency_contact_name,
      emergency_contact_phone,
    } = req.body;

    const immunizationJson = immunization_history ? JSON.stringify(immunization_history) : null;

    const [existing] = await pool.query('SELECT profile_id FROM HEALTH_PROFILES WHERE user_id = ?', [targetUserId]);

    if (existing.length > 0) {
      await pool.query(
        `UPDATE HEALTH_PROFILES 
         SET blood_type = ?, allergies = ?, chronic_conditions = ?,
             immunization_history = ?, emergency_contact_name = ?, emergency_contact_phone = ?,
             height = ?, weight = ?, version = version + 1
         WHERE user_id = ?`,
        [
          blood_type || null,
          allergies || null,
          chronic_conditions || null,
          immunizationJson,
          emergency_contact_name || null,
          emergency_contact_phone || null,
          height ? parseFloat(height) : null,
          weight ? parseFloat(weight) : null,
          targetUserId,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO HEALTH_PROFILES 
         (user_id, blood_type, allergies, chronic_conditions, immunization_history, emergency_contact_name, emergency_contact_phone, height, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          targetUserId,
          blood_type || null,
          allergies || null,
          chronic_conditions || null,
          immunizationJson,
          emergency_contact_name || null,
          emergency_contact_phone || null,
          height ? parseFloat(height) : null,
          weight ? parseFloat(weight) : null,
        ]
      );
    }

    res.json({ message: 'Patient clinical health profile updated by clinic staff.' });
  } catch (error) {
    console.error('Error updating patient profile:', error);
    res.status(500).json({ error: 'Failed to update patient clinical record.' });
  }
});

export default router;