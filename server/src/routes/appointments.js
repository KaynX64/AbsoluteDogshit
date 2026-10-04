// server/src/routes/appointments.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { requirePrivacyConsent } from '../middleware/consent.js';
import { logAudit } from '../utils/auditLogger.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { logPhiAccess } from '../utils/phiLogger.js';
import { getCache, setCache, invalidateCache } from '../utils/redisClient.js';
import { sendAppointmentEmail } from '../utils/mailer.js';

export default function appointmentRoutes(io) {
  const router = express.Router();

  // Symmetric consultation buffer: a booking at HH:MM blocks
  // HH:MM-30 and HH:MM+30 as well.
  const CONSULTATION_BUFFER_MINUTES = 30;

  function subtractMinutes(hhmm, minutes) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = h * 60 + m - minutes;
    if (total < 0) return null;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function addMinutes(hhmm, minutes) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = h * 60 + m + minutes;
    if (total >= 24 * 60) return null;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  // ===========================================================================
  // 1. DOCTOR & PRACTITIONER ROSTER
  // ===========================================================================

  router.get('/doctors', authenticateToken, async (req, res) => {
    try {
      const [doctors] = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.email,
                r.code AS role_code, r.name AS role_name,
                sp.license_no,
                COALESCE(sp.specialty, 'General Practitioner') AS specialty,
                COALESCE(sp.department, 'University Infirmary') AS department
         FROM USERS u
         JOIN USER_ROLES ur ON u.user_id = ur.user_id
         JOIN ROLES r ON ur.role_id = r.role_id
         LEFT JOIN STAFF_PROFILES sp ON u.user_id = sp.user_id
         WHERE r.code IN ('DOCTOR', 'DENTIST')
           AND u.is_active = TRUE
           AND u.deleted_at IS NULL
         ORDER BY u.first_name ASC`
      );
      res.json(doctors);
    } catch (error) {
      console.error('[Appointments] Error fetching doctors:', error);
      res.status(500).json({ error: 'Failed to retrieve available practitioners.' });
    }
  });

  // ===========================================================================
  // 2. TIME SLOT AVAILABILITY (symmetric 30-minute buffer)
  // ===========================================================================

  router.get('/slots', authenticateToken, async (req, res) => {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({ error: 'doctorId and date query parameters are required.' });
    }

    try {
      const defaultSlots = [
        '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
      ];

      const [booked] = await pool.query(
        `SELECT DATE_FORMAT(date_time, '%H:%i') AS time_slot
         FROM APPOINTMENTS
         WHERE doctor_user_id = ?
           AND DATE(date_time) = ?
           AND status NOT IN ('cancelled')
           AND deleted_at IS NULL`,
        [doctorId, date]
      );

      const bookedSet = new Set(booked.map((b) => b.time_slot));

      const slots = defaultSlots.map((time) => {
        const prevSlot = subtractMinutes(time, CONSULTATION_BUFFER_MINUTES);
        const nextSlot = addMinutes(time, CONSULTATION_BUFFER_MINUTES);

        const isBlockedByPrevious = prevSlot !== null && bookedSet.has(prevSlot);
        const isBlockedByNext = nextSlot !== null && bookedSet.has(nextSlot);

        return {
          time,
          isAvailable: !bookedSet.has(time) && !isBlockedByPrevious && !isBlockedByNext,
        };
      });

      res.json({ slots });
    } catch (error) {
      console.error('[Appointments] Error fetching slots:', error);
      res.status(500).json({ error: 'Failed to retrieve available slots.' });
    }
  });

  // ===========================================================================
  // 3. PATIENT APPOINTMENT BOOKING & HISTORY
  // ===========================================================================

  router.get('/my', authenticateToken, requirePrivacyConsent, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT a.appointment_id,
                a.date_time,
                DATE_FORMAT(a.date_time, '%Y-%m-%d %H:%i:%s') AS formatted_date_time,
                a.appointment_type,
                a.status,
                a.notes,
                a.cancelled_reason,
                a.booked_at,
                doc.first_name AS doctor_first_name,
                doc.last_name AS doctor_last_name,
                COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty
         FROM APPOINTMENTS a
         JOIN USERS doc ON a.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE a.patient_user_id = ?
           AND a.deleted_at IS NULL
         ORDER BY a.date_time DESC`,
        [req.user.user_id]
      );
      res.json(rows);
    } catch (error) {
      console.error('[Appointments] Error fetching user appointments:', error);
      res.status(500).json({ error: 'Failed to retrieve appointments.' });
    }
  });

  router.post('/', authenticateToken, requirePrivacyConsent, async (req, res) => {
    const { doctor_user_id, date_time, appointment_type, notes } = req.body;
    const patientUserId = req.user.user_id;

    if (!doctor_user_id || !date_time || !appointment_type) {
      return res.status(400).json({ error: 'doctor_user_id, date_time, and appointment_type are required.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Symmetric buffer collision check:
      //   reject if the requested time, 30 min before, or 30 min after
      //   already has a live appointment with the same doctor.
      // FOR UPDATE locks the range to prevent concurrent races.
      const [conflict] = await connection.query(
        `SELECT appointment_id FROM APPOINTMENTS
         WHERE doctor_user_id = ?
           AND (
             date_time = ?
             OR date_time = DATE_SUB(?, INTERVAL ? MINUTE)
             OR date_time = DATE_ADD(?, INTERVAL ? MINUTE)
           )
           AND status NOT IN ('cancelled')
           AND deleted_at IS NULL
         FOR UPDATE`,
        [
          doctor_user_id,
          date_time,
          date_time,
          CONSULTATION_BUFFER_MINUTES,
          date_time,
          CONSULTATION_BUFFER_MINUTES,
        ]
      );

      if (conflict.length > 0) {
        throw new Error(
          'This time slot conflicts with another consultation (30-minute buffer). Please choose a different time.'
        );
      }

      const [insertResult] = await connection.query(
        `INSERT INTO APPOINTMENTS (patient_user_id, doctor_user_id, date_time, appointment_type, status, notes)
         VALUES (?, ?, ?, ?, 'scheduled', ?)`,
        [patientUserId, doctor_user_id, date_time, appointment_type, notes || '']
      );

      const appointmentId = insertResult.insertId;

      await logAudit(connection, {
        userId: patientUserId,
        action: 'CREATE',
        table: 'APPOINTMENTS',
        recordId: appointmentId,
        oldValue: null,
        newValue: { doctor_user_id, date_time, appointment_type },
        ipAddress: req.ip,
      });

      await connection.commit();

      const [details] = await pool.query(
        `SELECT u.email AS patient_email, u.first_name AS patient_first_name, u.last_name AS patient_last_name,
                doc.first_name AS doc_first_name, doc.last_name AS doc_last_name,
                COALESCE(sp.specialty, 'Campus Doctor') AS doc_specialty
         FROM USERS u, USERS doc
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE u.user_id = ? AND doc.user_id = ?`,
        [patientUserId, doctor_user_id]
      );

      const patientName = details.length > 0 ? `${details[0].patient_first_name} ${details[0].patient_last_name}` : 'Student';

      if (details.length > 0) {
        sendAppointmentEmail({
          toEmail: details[0].patient_email,
          patientName,
          doctorName: `${details[0].doc_first_name} ${details[0].doc_last_name}`,
          specialty: details[0].doc_specialty,
          dateTime: date_time,
          purpose: appointment_type,
          type: 'confirmation',
        }).catch((err) => console.error('[Mailer Error]:', err.message));
      }

      if (io) {
        io.emit('appointment:booked', {
          appointment_id: appointmentId,
          patientName,
          date_time,
          appointment_type,
          doctor_user_id,
        });
      }

      res.status(201).json({
        message: 'Consultation scheduled successfully.',
        appointmentId,
      });
    } catch (error) {
      await connection.rollback();
      console.error('[Appointments] Booking error:', error);
      res.status(400).json({ error: error.message || 'Failed to book appointment.' });
    } finally {
      connection.release();
    }
  });

  router.patch('/:id/cancel', authenticateToken, async (req, res) => {
    const appointmentId = Number(req.params.id);
    const { cancelled_reason } = req.body;
    const userId = req.user.user_id;
    const userRoles = req.user.roles || [];
    const isStaff = userRoles.some((r) => ['DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'].includes(r));

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [appRows] = await connection.query(
        'SELECT * FROM APPOINTMENTS WHERE appointment_id = ? AND deleted_at IS NULL FOR UPDATE',
        [appointmentId]
      );

      if (appRows.length === 0) {
        throw new Error('Appointment not found.');
      }

      const app = appRows[0];
      if (app.patient_user_id !== userId && !isStaff) {
        return res.status(403).json({ error: 'Unauthorized to cancel this appointment.' });
      }

      await connection.query(
        "UPDATE APPOINTMENTS SET status = 'cancelled', cancelled_reason = ? WHERE appointment_id = ?",
        [cancelled_reason || 'Cancelled by user', appointmentId]
      );

      await connection.query(
        "UPDATE QUEUE SET status = 'cancelled' WHERE appointment_id = ?",
        [appointmentId]
      );

      await logAudit(connection, {
        userId,
        action: 'UPDATE',
        table: 'APPOINTMENTS',
        recordId: appointmentId,
        oldValue: { status: app.status },
        newValue: { status: 'cancelled', cancelled_reason },
        ipAddress: req.ip,
      });

      await connection.commit();

      await invalidateCache('queue:*');

      if (io) {
        io.emit('appointment:cancelled', { appointment_id: appointmentId });
        io.emit('queue:updated');
      }

      res.json({ message: 'Appointment cancelled successfully.' });
    } catch (error) {
      await connection.rollback();
      console.error('[Appointments] Cancel error:', error);
      res.status(400).json({ error: error.message || 'Failed to cancel appointment.' });
    } finally {
      connection.release();
    }
  });

  // ===========================================================================
  // 4. DOCTOR & CLINICAL DESK WORKSPACE
  // ===========================================================================

  router.get('/today', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'), async (req, res) => {
    const { filter } = req.query;
    const userRoles = req.user.roles || [];
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
                hp.height, hp.weight,
                CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS queue_ticket,
                q.status AS queue_status,
                emr.chief_complaint AS past_chief_complaint,
                emr.diagnosis AS past_diagnosis,
                emr.treatment_plan AS past_treatment,
                emr.notes AS past_clinical_notes,
                rx.notes AS past_dietary_notes
         FROM APPOINTMENTS a
         JOIN USERS u ON a.patient_user_id = u.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         LEFT JOIN QUEUE q ON q.appointment_id = a.appointment_id AND q.queue_date = CURDATE()
         LEFT JOIN EMR_RECORDS emr ON emr.appointment_id = a.appointment_id
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
        past_chief_complaint: decrypt(app.past_chief_complaint) || '',
        past_diagnosis: decrypt(app.past_diagnosis) || '',
        past_treatment: decrypt(app.past_treatment) || '',
        past_clinical_notes: decrypt(app.past_clinical_notes) || '',
        past_dietary_notes: decrypt(app.past_dietary_notes) || '',
      }));

      res.json(decrypted);
    } catch (error) {
      console.error('[Appointments] Error fetching roster:', error);
      res.status(500).json({ error: 'Failed to retrieve appointments roster.' });
    }
  });

  // ===========================================================================
  // 5. LIVE CLINIC TRIAGE QUEUE
  // ===========================================================================

  router.get('/queue/today', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
    try {
      const cachedQueue = await getCache('queue:today');
      if (cachedQueue) {
        return res.json(cachedQueue);
      }

      const [rows] = await pool.query(
        `SELECT q.queue_id,
                CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
                u.first_name, u.last_name,
                sp.student_no,
                COALESCE(a.appointment_type, 'General Walk-in') AS visit_type,
                q.status,
                DATE_FORMAT(q.checked_in_at, '%h:%i %p') AS arrival_time,
                q.queue_number
         FROM QUEUE q
         JOIN USERS u ON q.patient_user_id = u.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN APPOINTMENTS a ON q.appointment_id = a.appointment_id
         WHERE q.queue_date = CURDATE()
           AND q.status IN ('waiting', 'in-consultation')
         ORDER BY q.status = 'in-consultation' DESC, q.queue_number ASC`
      );

      await setCache('queue:today', rows, 60);
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
      }));

      res.json(decrypted);
    } catch (error) {
      console.error('[Appointments] Lookup error:', error);
      res.status(500).json({ error: 'Failed to look up appointment.' });
    }
  });

  router.post('/:id/checkin', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
    const appointmentId = Number(req.params.id);
    const { blood_pressure, temperature, pulse } = req.body;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [appRows] = await connection.query(
        'SELECT * FROM APPOINTMENTS WHERE appointment_id = ? AND deleted_at IS NULL FOR UPDATE',
        [appointmentId]
      );

      if (appRows.length === 0) {
        throw new Error('Appointment not found.');
      }

      const app = appRows[0];

      const [numRows] = await connection.query(
        'SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_num FROM QUEUE WHERE queue_date = CURDATE()'
      );
      const nextNum = numRows[0].next_num;

      await connection.query(
        `INSERT INTO QUEUE (patient_user_id, appointment_id, queue_date, counter_id, queue_number, status, checked_in_at)
         VALUES (?, ?, CURDATE(), 1, ?, 'waiting', CURRENT_TIMESTAMP)`,
        [app.patient_user_id, appointmentId, nextNum]
      );

      const triageNote = `[TRIAGE VITALS] BP: ${blood_pressure || '120/80'}, Temp: ${temperature || '36.6'}°C, Pulse: ${pulse || '75'} bpm\n`;
      const combinedNotes = triageNote + (app.notes || '');

      await connection.query(
        "UPDATE APPOINTMENTS SET status = 'checked_in', notes = ? WHERE appointment_id = ?",
        [combinedNotes, appointmentId]
      );

      await logAudit(connection, {
        userId: req.user.user_id,
        action: 'UPDATE',
        table: 'APPOINTMENTS',
        recordId: appointmentId,
        oldValue: { status: app.status },
        newValue: { status: 'checked_in', queue_number: nextNum },
        ipAddress: req.ip,
      });

      await connection.commit();

      await invalidateCache('queue:*');

      if (io) {
        io.emit('queue:updated');
        io.emit('appointment:status_changed', { appointment_id: appointmentId, status: 'checked_in' });
      }

      const queueTicket = `Q-${String(nextNum).padStart(2, '0')}`;
      const arrivalTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      res.json({
        message: 'Patient arrival confirmed and admitted to queue.',
        queueTicket,
        arrivalTime,
      });
    } catch (error) {
      await connection.rollback();
      console.error('[Checkin Error]:', error);
      res.status(400).json({ error: error.message || 'Failed to check in patient.' });
    } finally {
      connection.release();
    }
  });

  router.patch('/:id/status', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'), async (req, res) => {
    const appointmentId = Number(req.params.id);
    const { status } = req.body;

    const validStatuses = ['scheduled', 'checked_in', 'serving', 'completed', 'cancelled', 'no_show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('UPDATE APPOINTMENTS SET status = ? WHERE appointment_id = ?', [status, appointmentId]);

      if (status === 'serving') {
        await connection.query(
          "UPDATE QUEUE SET status = 'in-consultation' WHERE appointment_id = ?",
          [appointmentId]
        );
      } else if (status === 'completed') {
        await connection.query(
          "UPDATE QUEUE SET status = 'done', served_at = CURRENT_TIMESTAMP WHERE appointment_id = ?",
          [appointmentId]
        );
      }

      await connection.commit();

      await invalidateCache('queue:*');

      if (io) {
        io.emit('appointment:status_changed', { appointment_id: appointmentId, status });
        io.emit('queue:updated');
      }

      res.json({ message: `Appointment status updated to ${status}.` });
    } catch (error) {
      await connection.rollback();
      console.error('[Status Update Error]:', error);
      res.status(500).json({ error: 'Failed to update appointment status.' });
    } finally {
      connection.release();
    }
  });

  // ===========================================================================
  // 7. CLINICAL ENCOUNTER COMPLETION & EMR RECORDING
  // ===========================================================================

  router.post('/:id/complete', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
    const appointmentId = Number(req.params.id);
    const doctorUserId = req.user.user_id;
    const {
      patient_user_id,
      chief_complaint,
      diagnosis,
      treatment_plan,
      notes,
      vitals,
    } = req.body;

    if (!diagnosis || !chief_complaint) {
      return res.status(400).json({ error: 'Chief complaint and diagnosis are required.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [emrResult] = await connection.query(
        `INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, appointment_id, chief_complaint, diagnosis, treatment_plan, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          patient_user_id,
          doctorUserId,
          appointmentId,
          encrypt(chief_complaint),
          encrypt(diagnosis),
          encrypt(treatment_plan || ''),
          encrypt(notes || ''),
        ]
      );
      const emrId = emrResult.insertId;

      if (vitals && typeof vitals === 'object') {
        const metricUnits = {
          systolic_bp: 'mmHg',
          diastolic_bp: 'mmHg',
          temperature: '°C',
          pulse: 'bpm',
          spo2: '%',
          resp_rate: 'cpm',
        };

        for (const [metric, val] of Object.entries(vitals)) {
          if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val))) {
            const unit = metricUnits[metric] || 'units';
            await connection.query(
              `INSERT INTO VITAL_SIGNS (emr_id, metric, value, unit, recorded_by)
               VALUES (?, ?, ?, ?, ?)`,
              [emrId, metric, Number(val), unit, doctorUserId]
            );
          }
        }
      }

      await connection.query(
        "UPDATE APPOINTMENTS SET status = 'completed' WHERE appointment_id = ?",
        [appointmentId]
      );

      await connection.query(
        "UPDATE QUEUE SET status = 'done', served_at = CURRENT_TIMESTAMP WHERE appointment_id = ?",
        [appointmentId]
      );

      await logAudit(connection, {
        userId: doctorUserId,
        action: 'CREATE',
        table: 'EMR_RECORDS',
        recordId: emrId,
        oldValue: null,
        newValue: {
          operation: 'CONSULTATION_ENCOUNTER_COMPLETED',
          appointment_id: appointmentId,
          patient_user_id,
          emr_id: emrId,
        },
        ipAddress: req.ip,
      });

      await connection.commit();

      await invalidateCache('queue:*');

      if (io) {
        io.emit('appointment:status_changed', { appointment_id: appointmentId, status: 'completed' });
        io.emit('queue:updated');
      }

      res.json({
        message: 'Encounter finalized, EMR record created, and patient discharged.',
        emrId,
      });
    } catch (error) {
      await connection.rollback();
      console.error('[Complete Encounter Error]:', error);
      res.status(500).json({ error: error.message || 'Failed to complete encounter.' });
    } finally {
      connection.release();
    }
  });

  // ===========================================================================
  // 8. PATIENT EMR HISTORY & SEARCH DIRECTORY
  // ===========================================================================

  router.get('/patient/:patientId/history', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'), async (req, res) => {
    const patientId = Number(req.params.patientId);

    try {
      const [emrs] = await pool.query(
        `SELECT e.emr_id, e.encounter_date, e.chief_complaint, e.diagnosis, e.treatment_plan, e.notes,
                doc.first_name AS doctor_first_name, doc.last_name AS doctor_last_name,
                COALESCE(sp.license_no, 'PRC-VERIFIED') AS doctor_license,
                COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty
         FROM EMR_RECORDS e
         JOIN USERS doc ON e.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE e.patient_user_id = ? AND e.deleted_at IS NULL
         ORDER BY e.encounter_date DESC`,
        [patientId]
      );

      const history = await Promise.all(
        emrs.map(async (emr) => {
          const [vitals] = await pool.query(
            'SELECT metric, value, unit FROM VITAL_SIGNS WHERE emr_id = ?',
            [emr.emr_id]
          );
          const [attachments] = await pool.query(
            'SELECT attachment_id, file_name, file_size, mime_type FROM EMR_ATTACHMENTS WHERE emr_id = ?',
            [emr.emr_id]
          );
          const [rxRows] = await pool.query(
            'SELECT prescription_id, status, notes FROM PRESCRIPTIONS WHERE emr_id = ?',
            [emr.emr_id]
          );

          return {
            emr_id: emr.emr_id,
            encounter_date: emr.encounter_date,
            doctor_first_name: emr.doctor_first_name,
            doctor_last_name: emr.doctor_last_name,
            doctor_license: emr.doctor_license,
            doctor_specialty: emr.doctor_specialty,
            chief_complaint: decrypt(emr.chief_complaint) || '',
            diagnosis: decrypt(emr.diagnosis) || '',
            treatment_plan: decrypt(emr.treatment_plan) || '',
            notes: decrypt(emr.notes) || '',
            vitals,
            attachments,
            prescriptions: rxRows.map((rx) => ({
              ...rx,
              notes: decrypt(rx.notes) || '',
            })),
          };
        })
      );

      logPhiAccess({
        viewerUserId: req.user.user_id,
        patientUserId: patientId,
        table: 'EMR_RECORDS',
        recordId: patientId,
        purpose: 'Clinical Encounter History Review',
        ipAddress: req.ip,
      });

      res.json(history);
    } catch (error) {
      console.error('[Appointments] Error fetching patient history:', error);
      res.status(500).json({ error: 'Failed to retrieve patient medical history.' });
    }
  });

  router.get('/patients/search', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'), async (req, res) => {
    const rawQuery = req.query.query ? String(req.query.query).trim() : '';
    if (!rawQuery) return res.json([]);

    const queryPattern = `%${rawQuery}%`;

    try {
      const [rows] = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.email, u.phone,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS identifier_no,
                COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS affiliation,
                hp.blood_type, hp.allergies
         FROM USERS u
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE u.deleted_at IS NULL
           AND (
             sp.student_no LIKE ? OR
             u.first_name LIKE ? OR
             u.last_name LIKE ? OR
             u.email LIKE ? OR
             CONCAT(u.first_name, ' ', u.last_name) LIKE ?
           )
         ORDER BY u.last_name ASC
         LIMIT 30`,
        [queryPattern, queryPattern, queryPattern, queryPattern, queryPattern]
      );

      const decrypted = rows.map((p) => ({
        ...p,
        allergies: decrypt(p.allergies) || 'None reported',
      }));

      res.json(decrypted);
    } catch (error) {
      console.error('[Appointments] Patient search error:', error);
      res.status(500).json({ error: 'Patient search failed.' });
    }
  });

  return router;
}