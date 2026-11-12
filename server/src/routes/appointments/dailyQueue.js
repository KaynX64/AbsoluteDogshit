import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { getCache, setCache, invalidateCache } from '../../utils/redisClient.js';
import { sendPushToUser } from '../../utils/fcmNotifier.js';
import { getBmiCategory } from '../../utils/bmi.js';
import { stripLegacyOdontogram, readDentalChart } from './clinicalHistory.js';

export function registerDailyQueueRoutes(router, io) {
  // ===========================================================================
  // 4. DOCTOR & CLINICAL DESK WORKSPACE
  // ===========================================================================

  router.get('/today', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'), async (req, res) => {
    const { filter } = req.query;
    const userRoles = req.user.roles || [];
    const canViewDental = userRoles.includes('DENTIST');
    const isPractitionerOnly = (userRoles.includes('DOCTOR') || userRoles.includes('DENTIST')) && !userRoles.includes('ADMIN') && !userRoles.includes('NURSE');

    let statusCondition = "a.status IN ('checked_in', 'serving')";
    if (filter === 'scheduled') {
      statusCondition = "a.status = 'scheduled'";
    } else if (filter === 'history') {
      statusCondition = "a.status IN ('completed', 'cancelled', 'no_show')";
    }

    let doctorCondition = '';
    const params = [];
    if (isPractitionerOnly) {
      doctorCondition = 'AND a.doctor_user_id = ?';
      params.push(req.user.user_id);
    }

    try {
      const [rows] = await pool.query(
        `SELECT a.appointment_id,
                a.patient_user_id AS patient_id,
                a.doctor_user_id,
                a.date_time,
                DATE_FORMAT(a.date_time, '%h:%i %p') AS time_slot,
                DATE_FORMAT(a.date_time, '%Y-%m-%d') AS date_str,
                a.appointment_type,
                a.status,
                a.notes,
                a.cancelled_reason,
                u.first_name, u.last_name, u.phone,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS student_no,
                COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS course,
                hp.blood_type, hp.allergies, hp.chronic_conditions,
                hp.sex, hp.date_of_birth, TIMESTAMPDIFF(YEAR, hp.date_of_birth, CURDATE()) AS age,
                hp.height, hp.weight, hp.bmi, hp.updated_at AS health_profile_updated_at,
                CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS queue_ticket,
                q.status AS queue_status,
                emr.chief_complaint AS past_chief_complaint,
                emr.diagnosis AS past_diagnosis,
                emr.treatment_plan AS past_treatment,
                emr.notes AS past_clinical_notes,
                rx.notes AS past_dietary_notes,
                dc.chart_data AS past_dental_chart
         FROM APPOINTMENTS a
         JOIN USERS u ON a.patient_user_id = u.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         LEFT JOIN QUEUE q ON q.appointment_id = a.appointment_id AND q.queue_date = CURDATE()
         LEFT JOIN EMR_RECORDS emr ON emr.appointment_id = a.appointment_id
         LEFT JOIN DENTAL_CHARTS dc ON dc.emr_id = emr.emr_id
         LEFT JOIN PRESCRIPTIONS rx ON rx.emr_id = emr.emr_id
         WHERE ${statusCondition}
           ${doctorCondition}
           AND a.deleted_at IS NULL
         ORDER BY a.date_time ASC`,
        params
      );

      const decrypted = rows.map((app) => ({
        ...app,
        allergies: decrypt(app.allergies) || 'None reported',
        chronic_conditions: decrypt(app.chronic_conditions) || 'None reported',
        bmi_category: getBmiCategory(app.bmi),
        past_chief_complaint: decrypt(app.past_chief_complaint) || '',
        past_diagnosis: decrypt(app.past_diagnosis) || '',
        past_treatment: stripLegacyOdontogram(decrypt(app.past_treatment)),
        past_clinical_notes: decrypt(app.past_clinical_notes) || '',
        past_dietary_notes: decrypt(app.past_dietary_notes) || '',
        past_dental_chart: canViewDental ? readDentalChart(app.past_dental_chart) : null,
      }));

      res.json(decrypted);
    } catch (error) {
      console.error('[Appointments] Error fetching roster:', error);
      res.status(500).json({ error: 'Failed to retrieve appointments roster.' });
    }
  });

  router.get('/expected-today', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT a.appointment_id,
                a.patient_user_id AS patient_id,
                a.doctor_user_id,
                a.date_time,
                DATE_FORMAT(a.date_time, '%h:%i %p') AS time_slot,
                DATE_FORMAT(a.date_time, '%Y-%m-%d') AS date_str,
                a.appointment_type,
                a.status,
                a.notes,
                u.first_name, u.last_name, u.phone,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS student_no,
                COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS course,
                hp.blood_type, hp.allergies, hp.chronic_conditions,
                doc.first_name AS doctor_first_name,
                doc.last_name AS doctor_last_name,
                COALESCE(stp.specialty, 'Campus Physician') AS doctor_specialty
         FROM APPOINTMENTS a
         JOIN USERS u ON a.patient_user_id = u.user_id
         JOIN USERS doc ON a.doctor_user_id = doc.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN STAFF_PROFILES stp ON doc.user_id = stp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE a.status = 'scheduled'
           AND DATE(a.date_time) <= CURDATE()
           AND a.deleted_at IS NULL
         ORDER BY a.date_time ASC`
      );

      const decrypted = rows.map((app) => ({
        ...app,
        allergies: decrypt(app.allergies) || 'None reported',
        chronic_conditions: decrypt(app.chronic_conditions) || 'None reported',
      }));

      res.json(decrypted);
    } catch (error) {
      console.error('[Appointments] Expected-today error:', error);
      res.status(500).json({ error: 'Failed to fetch expected patients.' });
    }
  });

    // ===========================================================================
  // 4b. TODAY'S NO-SHOW COUNT (nurse console stat tile)
  // ===========================================================================
  // Returns how many patients have been auto-flipped (or manually set) to
  // 'no_show' today. Used by NurseConsole to render the "No-shows today"
  // stat tile. Runs no PHI decryption — it's a pure count.
  router.get('/no-shows-today', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM APPOINTMENTS
         WHERE status = 'no_show'
           AND DATE(date_time) = CURDATE()
           AND deleted_at IS NULL`
      );
      res.json({ count: rows[0]?.count || 0 });
    } catch (error) {
      console.error('[Appointments] No-shows today error:', error);
      res.status(500).json({ error: 'Failed to fetch no-show count.' });
    }
  });


  // ===========================================================================
  // 5. LIVE CLINIC TRIAGE QUEUE (WITH FEATURE 4 EMERGENCY PRIORITIZATION)
  // ===========================================================================

  router.get('/queue/today', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
    try {
      const cachedQueue = await getCache('queue:today');
      if (cachedQueue) {
        return res.json(cachedQueue);
      }

      // Regular triage queue only. SOS alerts are NOT queue tickets: they are
      // served by GET /api/emergency/active and shown in their own panel.
      const [rows] = await pool.query(
        `SELECT q.queue_id,
                CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
                u.first_name, u.last_name,
                COALESCE(sp.student_no, st.license_no, 'PSU Member') AS student_no,
                COALESCE(a.appointment_type, 'General Walk-in') AS visit_type,
                q.status,
                DATE_FORMAT(q.checked_in_at, '%h:%i %p') AS arrival_time,
                q.queue_number,
                0 AS is_emergency
         FROM QUEUE q
         JOIN USERS u ON q.patient_user_id = u.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN APPOINTMENTS a ON q.appointment_id = a.appointment_id
         WHERE q.queue_date = CURDATE()
           AND q.status IN ('waiting', 'in-consultation')
         ORDER BY q.status = 'in-consultation' DESC, q.queue_number ASC`
      );

      await setCache('queue:today', rows, 30);
      res.json(rows);
    } catch (error) {
      console.error('[Appointments] Error fetching daily queue:', error);
      res.status(500).json({ error: 'Failed to fetch daily triage queue.' });
    }
  });

  router.patch('/queue/:queueId/status', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
    const queueId = Number(req.params.queueId);
    const { status } = req.body;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE QUEUE
         SET status = ?,
             served_at = IF(? IN ('in-consultation', 'done'), CURRENT_TIMESTAMP, served_at)
         WHERE queue_id = ?`,
        [status, status, queueId]
      );

      if (status === 'in-consultation') {
        await connection.query(
          `UPDATE APPOINTMENTS SET status = 'serving'
           WHERE appointment_id = (SELECT appointment_id FROM QUEUE WHERE queue_id = ?)`,
          [queueId]
        );
      } else if (status === 'done') {
        await connection.query(
          `UPDATE APPOINTMENTS SET status = 'completed'
           WHERE appointment_id = (SELECT appointment_id FROM QUEUE WHERE queue_id = ?)`,
          [queueId]
        );
      }

      await connection.commit();
      await invalidateCache('queue:*');

      if (io) {
        io.emit('queue:updated');
        io.emit('appointment:status_changed', { queue_id: queueId, status });
      }

      if (status === 'in-consultation') {
        try {
          const [details] = await pool.query(
            `SELECT q.patient_user_id,
                    CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
                    COALESCE(CONCAT('Dr. ', doc.first_name, ' ', doc.last_name), 'the Clinic Doctor') AS doctor_name
             FROM QUEUE q
             LEFT JOIN APPOINTMENTS a ON q.appointment_id = a.appointment_id
             LEFT JOIN USERS doc ON a.doctor_user_id = doc.user_id
             WHERE q.queue_id = ?`,
            [queueId]
          );

          if (details.length > 0 && details[0].patient_user_id) {
            const { patient_user_id, ticket_no, doctor_name } = details[0];
            sendPushToUser(patient_user_id, {
              title: `🔔 It's Your Turn! (${ticket_no})`,
              body: `Please proceed to the consultation room with ${doctor_name}.`,
              data: {
                type: 'QUEUE_TURN',
                ticketNo: ticket_no,
                doctorName: doctor_name,
              },
            }).catch((err) => console.error('[FCM Queue Turn Error]:', err.message));
          }
        } catch (pushErr) {
          console.error('[FCM Queue Turn Fetch Error]:', pushErr.message);
        }
      }

      res.json({ message: 'Queue ticket updated successfully.' });
    } catch (error) {
      await connection.rollback();
      console.error('[Queue Status Error]:', error);
      res.status(500).json({ error: 'Failed to update queue ticket.' });
    } finally {
      connection.release();
    }
  });

  router.get('/queue/my', authenticateToken, async (req, res) => {
    const userId = req.user.user_id;

    try {
      const [rows] = await pool.query(
        `SELECT q.queue_id,
                CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
                q.queue_number,
                q.status,
                q.counter_id,
                COALESCE(CONCAT('Dr. ', doc.first_name, ' ', doc.last_name), 'Campus Physician') AS doctor_name,
                COALESCE(sp.department, 'Clinic Room 1') AS clinic_room
         FROM QUEUE q
         LEFT JOIN APPOINTMENTS a ON q.appointment_id = a.appointment_id
         LEFT JOIN USERS doc ON a.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE q.patient_user_id = ?
           AND q.queue_date = CURDATE()
           AND q.status IN ('waiting', 'in-consultation')
         ORDER BY q.queue_id DESC
         LIMIT 1`,
        [userId]
      );

      if (rows.length === 0) {
        return res.json({ hasActiveTicket: false });
      }

      const ticket = rows[0];

      const [aheadRows] = await pool.query(
        `SELECT COUNT(*) AS ahead
         FROM QUEUE
         WHERE queue_date = CURDATE()
           AND status = 'waiting'
           AND queue_number < ?`,
        [ticket.queue_number]
      );

      const patientsAhead = aheadRows[0]?.ahead || 0;

      res.json({
        hasActiveTicket: true,
        ticket: {
          queue_id: ticket.queue_id,
          ticket_no: ticket.ticket_no,
          status: ticket.status,
          doctor_name: ticket.doctor_name,
          clinic_room: ticket.clinic_room,
          patients_ahead: patientsAhead,
          estimated_wait_minutes: patientsAhead * 10,
        },
      });
    } catch (error) {
      console.error('[My Queue Error]:', error);
      res.status(500).json({ error: 'Failed to fetch personal queue ticket.' });
    }
  });
}
