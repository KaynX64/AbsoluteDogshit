import { pool } from '../../../db/pool.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { requireRoles } from '../../../middleware/rbac.js';
import { decrypt } from '../../../utils/cryptoVault.js';
import { getBmiCategory } from '../../../utils/bmi.js';

export function registerIntakeLookupRoutes(router) {
  // ===========================================================================
  // 6. QR INTAKE & PATIENT LOOKUP
  // ===========================================================================

  router.get('/lookup', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
    const { query, userId } = req.query;

    try {
      let whereClause = '';
      const params = [];

      if (userId) {
        whereClause = 'a.patient_user_id = ?';
        params.push(Number(userId));
      } else if (query) {
        whereClause = `(
          sp.student_no = ? OR
          u.last_name LIKE ? OR
          u.first_name LIKE ? OR
          u.email = ?
        )`;
        const q = String(query).trim();
        params.push(q, `%${q}%`, `%${q}%`, q);
      } else {
        return res.status(400).json({ error: 'query or userId parameter is required.' });
      }

      const [rows] = await pool.query(
        `SELECT a.appointment_id,
                a.patient_user_id AS user_id,
                a.date_time,
                DATE_FORMAT(a.date_time, '%Y-%m-%d %h:%i %p') AS formatted_schedule,
                a.appointment_type,
                a.status,
                a.notes,
                u.first_name, u.last_name, u.email, u.phone,
                COALESCE(sp.student_no, 'N/A') AS student_no,
                COALESCE(sp.course, 'PSU Lingayen') AS course,
                hp.blood_type, hp.allergies, hp.chronic_conditions,
                hp.sex, hp.date_of_birth, TIMESTAMPDIFF(YEAR, hp.date_of_birth, CURDATE()) AS age,
                hp.height, hp.weight, hp.bmi, hp.updated_at AS health_profile_updated_at,
                doc.last_name AS doc_last_name
         FROM APPOINTMENTS a
         JOIN USERS u ON a.patient_user_id = u.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         LEFT JOIN USERS doc ON a.doctor_user_id = doc.user_id
         WHERE a.deleted_at IS NULL
           AND a.status IN ('scheduled', 'checked_in', 'serving')
           AND ${whereClause}
         ORDER BY a.date_time ASC
         LIMIT 10`,
        params
      );

      const decrypted = rows.map((app) => ({
        ...app,
        allergies: decrypt(app.allergies) || 'None reported',
        chronic_conditions: decrypt(app.chronic_conditions) || 'None reported',
        bmi_category: getBmiCategory(app.bmi),
      }));

      res.json(decrypted);
    } catch (error) {
      console.error('[Appointments] Lookup error:', error);
      res.status(500).json({ error: 'Failed to look up appointment.' });
    }
  });
}

export function registerActiveTicket(router) {
  // ===========================================================================
  // 6.2 GET /api/appointments/patient/:patientId/active-ticket
  // ===========================================================================
  router.get(
    '/patient/:patientId/active-ticket',
    authenticateToken,
    requireRoles('NURSE', 'DOCTOR', 'DENTIST', 'ADMIN'),
    async (req, res) => {
      const patientId = Number(req.params.patientId);
      if (!patientId || Number.isNaN(patientId)) {
        return res.status(400).json({ error: 'A valid patient id is required.' });
      }

      try {
        const [rows] = await pool.query(
          `SELECT q.queue_id, q.queue_number, q.status, q.appointment_id,
                  CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
                  DATE_FORMAT(q.checked_in_at, '%h:%i %p') AS arrival_time,
                  COALESCE(a.appointment_type, 'Walk-in Consultation') AS visit_type,
                  COALESCE(CONCAT('Dr. ', doc.first_name, ' ', doc.last_name), 'Unassigned') AS doctor_name
           FROM QUEUE q
           LEFT JOIN APPOINTMENTS a ON q.appointment_id = a.appointment_id
           LEFT JOIN USERS doc ON a.doctor_user_id = doc.user_id
           WHERE q.patient_user_id = ?
             AND q.queue_date = CURDATE()
             AND q.status IN ('waiting', 'in-consultation')
           ORDER BY q.queue_id DESC
           LIMIT 1`,
          [patientId]
        );

        if (rows.length === 0) {
          return res.json({ hasActiveTicket: false });
        }

        res.json({ hasActiveTicket: true, ticket: rows[0] });
      } catch (error) {
        console.error('[Active Ticket Error]:', error);
        res.status(500).json({ error: 'Failed to check active queue ticket.' });
      }
    }
  );
}
