// Reads and updates the signed-in user's profile under the privacy consent gate.

import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { logAudit } from '../../utils/auditLogger.js';
import { encrypt, decrypt } from '../../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../../middleware/consent.js';
import { getBmiCategory } from '../../utils/bmi.js';

export function registerSelfProfileRead(router) {
  // GET /api/profile/me - Dynamically retrieves role-aware profile & clinical data
  router.get('/me', authenticateToken, requirePrivacyConsent, async (req, res) => {
    try {
      const userId = req.user.user_id;

      // Join identity with role tables (Student, Staff, Faculty, Non-Teaching, Admin)
      const [userRows] = await pool.query(
        `SELECT u.user_id, u.email, u.first_name, u.last_name, u.phone,
              u.is_qualified_responder,
              COALESCE(r.code, 'STUDENT') AS primary_role,
              COALESCE(r.name, 'Student Patient') AS role_name,
              sp.student_no, sp.course, sp.year_level,
              fp.faculty_no,
              ntp.employee_no,
              st.admin_no, st.license_no, st.specialty,
              COALESCE(
                st.department,
                fp.department,
                ntp.department,
                sp.course,
                'PSU Lingayen Campus'
              ) AS department,
              COALESCE(fp.position, ntp.position) AS position
       FROM USERS u
       LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
       LEFT JOIN ROLES r ON ur.role_id = r.role_id
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
       LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
       LEFT JOIN NON_TEACHING_PROFILES ntp ON u.user_id = ntp.user_id
       WHERE u.user_id = ? AND u.deleted_at IS NULL
       LIMIT 1`,
        [userId]
      );

      if (userRows.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }

      // UI hint only — the flag is a display/UX switch. Authorization for SOS
      // routes is always resolved live (requireResponderAccess reads the DB).
      userRows[0].is_qualified_responder = Boolean(userRows[0].is_qualified_responder);

      // Fetch clinical profile from HEALTH_PROFILES
      const [healthRows] = await pool.query(
        `SELECT profile_id, blood_type, allergies, chronic_conditions, immunization_history,
              emergency_contact_name, emergency_contact_phone, sex, date_of_birth,
              TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS age,
              height, weight, bmi, updated_at
       FROM HEALTH_PROFILES
       WHERE user_id = ? AND deleted_at IS NULL`,
        [userId]
      );

      let healthProfile = healthRows.length > 0 ? healthRows[0] : null;

      if (healthProfile) {
        healthProfile.allergies = decrypt(healthProfile.allergies) || '';
        healthProfile.chronic_conditions = decrypt(healthProfile.chronic_conditions) || '';
        healthProfile.bmi_category = getBmiCategory(healthProfile.bmi);
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
}

export function registerSelfProfileUpdate(router) {
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

    if (Object.prototype.hasOwnProperty.call(req.body, 'sex')) {
      return res.status(403).json({ error: 'Sex can only be updated by clinic staff.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'date_of_birth')) {
      return res.status(403).json({ error: 'Date of birth can only be updated by clinic staff.' });
    }

    // The Qualified Responder label is an administrative credential decision —
    // self-service must never flip it (PUT /users/:id/qualified-responder only).
    if (Object.prototype.hasOwnProperty.call(req.body, 'is_qualified_responder')) {
      return res.status(403).json({ error: 'The Qualified Responder label can only be changed by an administrator.' });
    }

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
}
