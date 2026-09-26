// server/src/routes/appointments.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { logAudit } from '../utils/auditLogger.js';
import { logPhiAccess } from '../utils/phiLogger.js';
import { sendAppointmentEmail } from '../utils/mailer.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../middleware/consent.js';

export default function appointmentRouter(io) {
  const router = express.Router();

  // 1. GET /api/appointments/doctors
  router.get('/doctors', authenticateToken, async (req, res) => {
    try {
      const [doctors] = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.email,
                r.code AS role_code,
                COALESCE(sp.specialty, 'General Practitioner') AS specialty,
                COALESCE(sp.department, 'University Infirmary') AS department,
                sp.license_no
         FROM USERS u
         INNER JOIN USER_ROLES ur ON u.user_id = ur.user_id
         INNER JOIN ROLES r ON ur.role_id = r.role_id
         LEFT JOIN STAFF_PROFILES sp ON u.user_id = sp.user_id
         WHERE r.code IN ('DOCTOR', 'DENTIST')
           AND u.is_active = TRUE
           AND u.deleted_at IS NULL
         ORDER BY u.last_name ASC`
      );
      res.json(doctors);
    } catch (error) {
      console.error('[Appointments] Doctors fetch error:', error);
      res.status(500).json({ error: 'Failed to retrieve clinical practitioners.' });
    }
  });

  // 2. GET /api/appointments/slots (Fixed missing comma)
  router.get('/slots', authenticateToken, async (req, res) => {
    try {
      const { doctorId, date } = req.query;

      if (!doctorId || !date) {
        return res.status(400).json({ error: 'doctorId and date (YYYY-MM-DD) are required parameters.' });
      }

      const operationalSlots = [
        '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
      ];

      const [existingBookings] = await pool.query(
        `SELECT DATE_FORMAT(date_time, '%H:%i') as booked_time
         FROM APPOINTMENTS
         WHERE doctor_user_id = ?
           AND DATE(date_time) = ?
           AND status IN ('scheduled', 'checked_in', 'serving')
           AND deleted_at IS NULL`,
        [doctorId, date]
      );

      const bookedSet = new Set(existingBookings.map((b) => b.booked_time));
      const isToday = new Date().toISOString().split('T')[0] === date;
      const nowTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      const slots = operationalSlots.map((time) => {
        const isPastTime = isToday && time <= nowTime;
        const isBooked = bookedSet.has(time);
        return {
          time,
          isAvailable: !isBooked && !isPastTime,
        };
      });

      res.json({ date, doctorId: Number(doctorId), slots });
    } catch (error) {
      console.error('[Appointments] Slots calculation error:', error);
      res.status(500).json({ error: 'Failed to compute slot availability.' });
    }
  });

  // 3. POST /api/appointments (Book Consultation - Fixed ReferenceErrors and Audit Log)
  router.post('/', authenticateToken, requirePrivacyConsent, async (req, res) => {
    const { doctor_user_id, date_time, appointment_type, notes } = req.body;
    const patientUserId = req.user.user_id;

    if (!doctor_user_id || !date_time || !appointment_type) {
      return res.status(400).json({ error: 'Doctor, date/time, and purpose are required.' });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query('SELECT user_id FROM USERS WHERE user_id = ? FOR UPDATE', [doctor_user_id]);

      const [conflict] = await connection.query(
        `SELECT appointment_id FROM APPOINTMENTS
         WHERE doctor_user_id = ?
           AND date_time = ?
           AND status IN ('scheduled', 'checked_in', 'serving')
           AND deleted_at IS NULL`,
        [doctor_user_id, date_time]
      );

      if (conflict.length > 0) {
        throw new Error('Selected time slot is already booked.');
      }

      const [patientConflict] = await connection.query(
        `SELECT appointment_id FROM APPOINTMENTS
         WHERE patient_user_id = ?
           AND date_time = ?
           AND status IN ('scheduled', 'checked_in', 'serving')
           AND deleted_at IS NULL`,
        [patientUserId, date_time]
      );

      if (patientConflict.length > 0) {
        throw new Error('You already have an active appointment scheduled at this exact time.');
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
        newValue: {
          doctor_user_id,
          date_time,
          appointment_type,
          notes,
        },
        ipAddress: req.ip,
      });

      await connection.commit();

      const [patientRows] = await connection.query(
        'SELECT first_name, last_name, email FROM USERS WHERE user_id = ?',
        [patientUserId]
      );
      const [doctorRows] = await connection.query(
        `SELECT u.first_name, u.last_name, COALESCE(sp.specialty, 'General Practitioner') AS specialty
         FROM USERS u
         LEFT JOIN STAFF_PROFILES sp ON u.user_id = sp.user_id
         WHERE u.user_id = ?`,
        [doctor_user_id]
      );

      const patient = patientRows[0];
      const doctor = doctorRows[0];

      if (patient && doctor && typeof sendAppointmentEmail === 'function') {
        sendAppointmentEmail({
          toEmail: patient.email,
          patientName: `${patient.first_name} ${patient.last_name}`,
          doctorName: `${doctor.first_name} ${doctor.last_name}`,
          specialty: doctor.specialty,
          dateTime: date_time,
          purpose: appointment_type,
          type: 'confirmation',
        }).catch((err) => console.error('[Email Dispatch Error]:', err.message));
      }

      if (io) {
        io.emit('appointment:booked', {
          appointmentId,
          doctor_user_id,
          patientUserId,
          patientName: patient ? `${patient.first_name} ${patient.last_name}` : 'Student Patient',
          date_time,
          appointment_type,
          status: 'scheduled',
        });
      }

      res.status(201).json({
        message: 'Consultation appointment scheduled successfully.',
        appointmentId,
        bookingSummary: {
          date_time,
          appointment_type,
          status: 'scheduled',
        },
      });
    } catch (error) {
      await connection.rollback();
      if (
        error.message === 'Selected time slot is already booked.' ||
        error.message === 'You already have an active appointment scheduled at this exact time.'
      ) {
        return res.status(409).json({ error: error.message });
      }
      console.error('[Appointments] Booking error:', error);
      res.status(500).json({ error: 'Failed to book consultation.' });
    } finally {
      connection.release();
    }
  });

  // 4. GET /api/appointments/my
  router.get('/my', authenticateToken, requirePrivacyConsent, async (req, res) => {
    try {
      const userId = req.user.user_id;
      const [rows] = await pool.query(
        `SELECT a.appointment_id,
                DATE_FORMAT(a.date_time, '%Y-%m-%d %H:%i') as formatted_date_time,
                a.date_time, a.appointment_type, a.status, a.notes, a.cancelled_reason,
                u.first_name AS doctor_first_name,
                u.last_name AS doctor_last_name,
                COALESCE(sp.specialty, 'Campus Health Specialist') AS doctor_specialty
         FROM APPOINTMENTS a
         JOIN USERS u ON a.doctor_user_id = u.user_id
         LEFT JOIN STAFF_PROFILES sp ON u.user_id = sp.user_id
         WHERE a.patient_user_id = ? AND a.deleted_at IS NULL
         ORDER BY a.date_time DESC`,
        [userId]
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve appointment history.' });
    }
  });

  // 5. PATCH /api/appointments/:id/cancel
  router.patch('/:id/cancel', authenticateToken, async (req, res) => {
    try {
      const appointmentId = req.params.id;
      const userId = req.user.user_id;
      const { cancelled_reason } = req.body;

      const [existing] = await pool.query(
        'SELECT appointment_id, status FROM APPOINTMENTS WHERE appointment_id = ? AND patient_user_id = ?',
        [appointmentId, userId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ error: 'Appointment not found or unauthorized.' });
      }

      if (existing[0].status !== 'scheduled') {
        return res.status(400).json({ error: `Cannot cancel appointment with status '${existing[0].status}'.` });
      }

      await pool.query(
        `UPDATE APPOINTMENTS
         SET status = 'cancelled', cancelled_reason = ?
         WHERE appointment_id = ?`,
        [cancelled_reason || 'Cancelled by patient via mobile app', appointmentId]
      );

      if (io) {
        io.emit('appointment:cancelled', { appointmentId: Number(appointmentId) });
      }

      res.json({ message: 'Appointment cancelled successfully.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to cancel appointment.' });
    }
  });

  // 6. GET /api/appointments/today (Fixed whereClause initialization bug)
  router.get('/today', authenticateToken, async (req, res) => {
    try {
      const { date, filter } = req.query;
      let whereClause = '';
      const params = [];

      if (filter === 'history') {
        whereClause = `WHERE a.status IN ('completed', 'cancelled', 'no_show')`;
      } else if (filter === 'scheduled') {
        whereClause = `WHERE a.status = 'scheduled' AND a.date_time >= CURDATE()`;
      } else if (filter === 'all') {
        whereClause = `WHERE a.status IN ('scheduled', 'checked_in', 'serving')`;
      } else if (date) {
        whereClause = `WHERE DATE(a.date_time) = ? AND a.status IN ('checked_in', 'serving')`;
        params.push(date);
      } else {
        whereClause = `WHERE a.status IN ('checked_in', 'serving')`;
      }

      whereClause += ' AND a.deleted_at IS NULL';

      const [rows] = await pool.query(
        `SELECT a.appointment_id,
                DATE_FORMAT(a.date_time, '%h:%i %p') AS time_slot,
                DATE_FORMAT(a.date_time, '%Y-%m-%d') AS date_str,
                a.date_time, a.appointment_type, a.status, a.notes, a.cancelled_reason,
                u.user_id AS patient_id, u.first_name, u.last_name, u.phone,
                sp.student_no, sp.course,
                hp.blood_type, hp.allergies, hp.chronic_conditions,
                hp.height, hp.weight,
                emr.diagnosis AS past_diagnosis,
                emr.treatment_plan AS past_treatment,
                CONCAT('Q-', LPAD(COALESCE(q.queue_number, 1), 2, '0')) AS queue_ticket,
                q.status AS queue_status
         FROM APPOINTMENTS a
         JOIN USERS u ON a.patient_user_id = u.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         LEFT JOIN EMR_RECORDS emr ON (emr.patient_user_id = a.patient_user_id AND DATE(emr.encounter_date) = DATE(a.date_time))
         LEFT JOIN QUEUE q ON (q.appointment_id = a.appointment_id AND q.status != 'done')
         ${whereClause}
         ORDER BY COALESCE(q.queue_number, 999) ASC, a.date_time ASC`,
        params
      );

      const decryptedRows = rows.map((r) => ({
        ...r,
        allergies: decrypt(r.allergies),
        chronic_conditions: decrypt(r.chronic_conditions),
        past_diagnosis: r.past_diagnosis ? decrypt(r.past_diagnosis) : '',
        past_treatment: r.past_treatment ? decrypt(r.past_treatment) : '',
      }));

      res.json(decryptedRows);
    } catch (error) {
      console.error('[Appointments] Today roster error:', error);
      res.status(500).json({ error: 'Failed to retrieve appointments roster.' });
    }
  });

  // 7. PATCH /api/appointments/:id/status
  router.patch('/:id/status', authenticateToken, async (req, res) => {
    try {
      const appointmentId = req.params.id;
      const { status } = req.body;

      if (!['serving', 'completed', 'no_show', 'checked_in'].includes(status)) {
        return res.status(400).json({ error: 'Invalid appointment status transition.' });
      }

      await pool.query('UPDATE APPOINTMENTS SET status = ? WHERE appointment_id = ?', [status, appointmentId]);

      if (io) {
        io.emit('appointment:status_changed', { appointmentId: Number(appointmentId), status });
      }

      res.json({ message: `Appointment #${appointmentId} status updated to ${status}.` });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update appointment status.' });
    }
  });

  // 8. POST /api/appointments/:id/complete (Proper EMR Audit Logging added)
  router.post('/:id/complete', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const appointmentId = req.params.id;
      const doctorUserId = req.user.user_id;
      const { patient_user_id, chief_complaint, diagnosis, treatment_plan, notes, vitals } = req.body;

      const encComplaint = encrypt(chief_complaint);
      const encDiagnosis = encrypt(diagnosis);
      const encTreatment = encrypt(treatment_plan);
      const encNotes = encrypt(notes || '');

      await connection.beginTransaction();

      const [emrResult] = await connection.query(
        `INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, chief_complaint, diagnosis, treatment_plan, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [patient_user_id, doctorUserId, encComplaint, encDiagnosis, encTreatment, encNotes]
      );

      const emrId = emrResult.insertId;

      if (vitals && typeof vitals === 'object') {
        const vitalEntries = [];
        if (vitals.systolic_bp && !isNaN(Number(vitals.systolic_bp))) {
          vitalEntries.push([emrId, 'systolic_bp', Number(vitals.systolic_bp), 'mmHg', doctorUserId]);
        }
        if (vitals.diastolic_bp && !isNaN(Number(vitals.diastolic_bp))) {
          vitalEntries.push([emrId, 'diastolic_bp', Number(vitals.diastolic_bp), 'mmHg', doctorUserId]);
        }
        if (vitals.temperature && !isNaN(Number(vitals.temperature))) {
          vitalEntries.push([emrId, 'temperature', Number(vitals.temperature), '°C', doctorUserId]);
        }
        if (vitals.pulse && !isNaN(Number(vitals.pulse))) {
          vitalEntries.push([emrId, 'pulse', Number(vitals.pulse), 'bpm', doctorUserId]);
        }
        for (const entry of vitalEntries) {
          await connection.query(
            `INSERT INTO VITAL_SIGNS (emr_id, metric, value, unit, recorded_by) VALUES (?, ?, ?, ?, ?)`,
            entry
          );
        }
      }

      await connection.query(`UPDATE APPOINTMENTS SET status = 'completed' WHERE appointment_id = ?`, [appointmentId]);
      await connection.query(`UPDATE QUEUE SET status = 'done', served_at = CURRENT_TIMESTAMP WHERE appointment_id = ?`, [appointmentId]);

      await logAudit(connection, {
        userId: doctorUserId,
        action: 'CREATE',
        table: 'EMR_RECORDS',
        recordId: emrId,
        oldValue: null,
        newValue: {
          patient_user_id,
          appointment_id: appointmentId,
          vitals_logged: vitals ? Object.keys(vitals) : [],
          encrypted: true,
        },
        ipAddress: req.ip,
      });

      await connection.commit();

      if (io) {
        io.emit('appointment:completed', { appointmentId: Number(appointmentId) });
        io.emit('queue:updated');
      }

      res.json({ message: 'Consultation finalized and saved to patient EMR history!', emrId });
    } catch (error) {
      await connection.rollback();
      console.error('Error completing consultation:', error);
      res.status(500).json({ error: 'Failed to complete consultation encounter.' });
    } finally {
      connection.release();
    }
  });

  // 9. GET /api/appointments/lookup
  router.get('/lookup', authenticateToken, async (req, res) => {
    try {
      const { query, userId } = req.query;

      let sql = `
        SELECT a.appointment_id,
               DATE_FORMAT(a.date_time, '%Y-%m-%d %h:%i %p') AS formatted_schedule,
               a.date_time, a.appointment_type, a.status, a.notes,
               u.user_id, u.first_name, u.last_name, u.phone,
               sp.student_no, sp.course,
               hp.blood_type, hp.allergies, hp.chronic_conditions,
               doc.first_name AS doc_first_name, doc.last_name AS doc_last_name
        FROM APPOINTMENTS a
        JOIN USERS u ON a.patient_user_id = u.user_id
        JOIN USERS doc ON a.doctor_user_id = doc.user_id
        LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
        LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
        WHERE a.status IN ('scheduled', 'checked_in') AND a.deleted_at IS NULL
      `;
      const params = [];

      if (userId) {
        sql += ` AND a.patient_user_id = ? `;
        params.push(userId);
      } else if (query) {
        sql += ` AND (sp.student_no LIKE ? OR u.last_name LIKE ? OR u.first_name LIKE ?) `;
        params.push(`%${query}%`, `%${query}%`, `%${query}%`);
      }

      sql += ` ORDER BY a.date_time ASC LIMIT 5`;

      const [results] = await pool.query(sql, params);

      if (results.length > 0) {
        logPhiAccess({
          viewerUserId: req.user.user_id,
          patientUserId: results[0].user_id,
          table: 'HEALTH_PROFILES',
          recordId: results[0].user_id,
          purpose: 'Intake Triage & QR Verification',
          ipAddress: req.ip,
        });
      }

      const decryptedResults = results.map((item) => ({
        ...item,
        allergies: decrypt(item.allergies),
        chronic_conditions: decrypt(item.chronic_conditions),
      }));

      res.json(decryptedResults);
    } catch (error) {
      res.status(500).json({ error: 'Failed to lookup patient appointments.' });
    }
  });

  // 10. POST /api/appointments/:id/checkin
  router.post('/:id/checkin', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const appointmentId = req.params.id;
      const { blood_pressure, temperature, pulse, spo2 } = req.body;

      await connection.beginTransaction();

      const [appRows] = await connection.query(
        `SELECT patient_user_id, notes FROM APPOINTMENTS WHERE appointment_id = ? FOR UPDATE`,
        [appointmentId]
      );

      if (appRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Appointment not found.' });
      }

      const patientUserId = appRows[0].patient_user_id;
      const existingNotes = appRows[0].notes || '';
      const vitalsSummary = `[TRIAGE VITALS] BP: ${blood_pressure || 'N/A'} | Temp: ${temperature || 'N/A'}°C | Pulse: ${pulse || 'N/A'} bpm${spo2 ? ` | SpO2: ${spo2}%` : ''}`;
      const updatedNotes = existingNotes ? `${vitalsSummary}\n${existingNotes}` : vitalsSummary;

      await connection.query(
        `UPDATE APPOINTMENTS SET status = 'checked_in', notes = ? WHERE appointment_id = ?`,
        [updatedNotes, appointmentId]
      );

      const today = new Date().toISOString().split('T')[0];
      const [queueCount] = await connection.query(`SELECT COUNT(*) as totalToday FROM QUEUE WHERE queue_date = ?`, [today]);
      const nextQueueNo = (queueCount[0].totalToday || 0) + 1;

      await connection.query(
        `INSERT INTO QUEUE (patient_user_id, appointment_id, queue_date, counter_id, queue_number, status, checked_in_at)
         VALUES (?, ?, ?, 1, ?, 'waiting', CURRENT_TIMESTAMP)`,
        [patientUserId, appointmentId, today, nextQueueNo]
      );

      await connection.commit();

      const arrivalTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const queueTicket = `Q-${nextQueueNo.toString().padStart(2, '0')}`;

      if (io) {
        io.emit('queue:updated');
        io.emit('appointment:status_changed', { appointmentId: Number(appointmentId), status: 'checked_in' });
      }

      res.json({
        message: `Patient checked in successfully at ${arrivalTime}!`,
        queueTicket,
        arrivalTime,
      });
    } catch (error) {
      await connection.rollback();
      res.status(500).json({ error: 'Failed to process clinic intake check-in.' });
    } finally {
      connection.release();
    }
  });

  // 11. GET /api/appointments/queue/today
  router.get('/queue/today', authenticateToken, async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [rows] = await pool.query(
        `SELECT q.queue_id, q.queue_number, q.status, q.counter_id,
                DATE_FORMAT(q.checked_in_at, '%h:%i %p') AS arrival_time,
                CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
                u.first_name, u.last_name, sp.student_no,
                COALESCE(a.appointment_type, 'Walk-in Intake') AS visit_type
         FROM QUEUE q
         JOIN USERS u ON q.patient_user_id = u.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN APPOINTMENTS a ON q.appointment_id = a.appointment_id
         WHERE q.queue_date = ? AND q.status != 'done'
         ORDER BY q.queue_number ASC`,
        [today]
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve live queue.' });
    }
  });

  // 12. PATCH /api/appointments/queue/:id/status
  router.patch('/queue/:id/status', authenticateToken, async (req, res) => {
    try {
      const queueId = req.params.id;
      const { status } = req.body;

      await pool.query('UPDATE QUEUE SET status = ? WHERE queue_id = ?', [status, queueId]);

      // When the nurse calls 'in-consultation', automatically sync the linked appointment to 'serving'
      if (status === 'in-consultation') {
        const [qRow] = await pool.query('SELECT appointment_id FROM QUEUE WHERE queue_id = ?', [queueId]);
        if (qRow.length > 0 && qRow[0].appointment_id) {
          await pool.query("UPDATE APPOINTMENTS SET status = 'serving' WHERE appointment_id = ?", [qRow[0].appointment_id]);
          if (io) {
            io.emit('appointment:status_changed', { appointmentId: qRow[0].appointment_id, status: 'serving' });
          }
        }
      }

      if (io) {
        io.emit('queue:updated');
      }

      res.json({ message: `Queue ticket #${queueId} updated to ${status}.` });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update queue status.' });
    }
  });

  // 13. GET /api/appointments/patient/:userId/history
  router.get('/patient/:userId/history', authenticateToken, async (req, res) => {
    try {
      const userId = Number(req.params.userId);

      const [history] = await pool.query(
        `SELECT e.emr_id, e.encounter_date, e.chief_complaint, e.diagnosis, e.treatment_plan, e.notes,
                doc.first_name as doctor_first_name, doc.last_name as doctor_last_name,
                sp.license_no as doctor_license,
                JSON_ARRAYAGG(
                  IF(v.vital_id IS NULL, NULL,
                    JSON_OBJECT('metric', v.metric, 'value', v.value, 'unit', v.unit, 'recorded_at', v.recorded_at)
                  )
                ) as vitals
         FROM EMR_RECORDS e
         JOIN USERS doc ON e.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         LEFT JOIN VITAL_SIGNS v ON e.emr_id = v.emr_id
         WHERE e.patient_user_id = ? AND e.deleted_at IS NULL
         GROUP BY e.emr_id
         ORDER BY e.encounter_date DESC`,
        [userId]
      );

      const decryptedHistory = history.map((item) => ({
        ...item,
        chief_complaint: decrypt(item.chief_complaint),
        diagnosis: decrypt(item.diagnosis),
        treatment_plan: decrypt(item.treatment_plan),
        notes: decrypt(item.notes),
      }));

      logPhiAccess({
        viewerUserId: req.user.user_id,
        patientUserId: userId,
        table: 'EMR_RECORDS',
        recordId: userId,
        purpose: 'Clinical Encounter History Review',
        ipAddress: req.ip,
      });

      res.json(decryptedHistory);
    } catch (error) {
      console.error('Failed to retrieve patient EMR history:', error);
      res.status(500).json({ error: 'Failed to retrieve patient medical history.' });
    }
  });

  // In server/src/routes/appointments.js under route 13:
router.get('/patient/:userId/history', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.params.userId);

    const [history] = await pool.query(
      `SELECT e.emr_id, e.encounter_date, e.chief_complaint, e.diagnosis, e.treatment_plan, e.notes,
              doc.first_name as doctor_first_name, doc.last_name as doctor_last_name,
              sp.license_no as doctor_license,
              JSON_ARRAYAGG(
                IF(v.vital_id IS NULL, NULL,
                  JSON_OBJECT('metric', v.metric, 'value', v.value, 'unit', v.unit, 'recorded_at', v.recorded_at)
                )
              ) as vitals,
              (
                SELECT COALESCE(JSON_ARRAYAGG(
                  JSON_OBJECT(
                    'attachment_id', att.attachment_id,
                    'file_name', att.file_name,
                    'file_size', att.file_size,
                    'mime_type', att.mime_type,
                    'created_at', att.created_at
                  )
                ), JSON_ARRAY())
                FROM EMR_ATTACHMENTS att
                WHERE att.emr_id = e.emr_id
              ) as attachments
       FROM EMR_RECORDS e
       JOIN USERS doc ON e.doctor_user_id = doc.user_id
       LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
       LEFT JOIN VITAL_SIGNS v ON e.emr_id = v.emr_id
       WHERE e.patient_user_id = ? AND e.deleted_at IS NULL
       GROUP BY e.emr_id
       ORDER BY e.encounter_date DESC`,
      [userId]
    );

    const decryptedHistory = history.map((item) => ({
      ...item,
      chief_complaint: decrypt(item.chief_complaint),
      diagnosis: decrypt(item.diagnosis),
      treatment_plan: decrypt(item.treatment_plan),
      notes: decrypt(item.notes),
    }));

    logPhiAccess({
      viewerUserId: req.user.user_id,
      patientUserId: userId,
      table: 'EMR_RECORDS',
      recordId: userId,
      purpose: 'Clinical Encounter History Review',
      ipAddress: req.ip,
    });

    res.json(decryptedHistory);
  } catch (error) {
    console.error('Failed to retrieve patient EMR history:', error);
    res.status(500).json({ error: 'Failed to retrieve patient medical history.' });
  }
});

  // 14. GET /api/appointments/queue/my
  router.get('/queue/my', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.user_id;
      const today = new Date().toISOString().split('T')[0];

      const [tickets] = await pool.query(
        `SELECT q.queue_id, q.queue_number, q.status, q.counter_id,
                DATE_FORMAT(q.checked_in_at, '%h:%i %p') AS arrival_time,
                CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
                COALESCE(a.appointment_type, 'Walk-in Intake') AS visit_type,
                doc.first_name AS doc_first_name, doc.last_name AS doc_last_name,
                COALESCE(sp.specialty, 'General Practitioner') AS doc_specialty
         FROM QUEUE q
         LEFT JOIN APPOINTMENTS a ON q.appointment_id = a.appointment_id
         LEFT JOIN USERS doc ON a.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE q.patient_user_id = ?
           AND q.queue_date = ?
           AND q.status IN ('waiting', 'in-consultation')
         ORDER BY q.queue_id DESC
         LIMIT 1`,
        [userId, today]
      );

      if (tickets.length === 0) {
        return res.json({ hasActiveTicket: false, ticket: null });
      }

      const currentTicket = tickets[0];
      let patientsAhead = 0;
      let estimatedWaitMinutes = 0;

      if (currentTicket.status === 'waiting') {
        const [aheadRows] = await pool.query(
          `SELECT COUNT(*) AS ahead_count
           FROM QUEUE
           WHERE queue_date = ?
             AND status = 'waiting'
             AND queue_number < ?`,
          [today, currentTicket.queue_number]
        );
        patientsAhead = aheadRows[0].ahead_count || 0;
        estimatedWaitMinutes = patientsAhead * 10;
      }

      res.json({
        hasActiveTicket: true,
        ticket: {
          ...currentTicket,
          patients_ahead: patientsAhead,
          estimated_wait_minutes: estimatedWaitMinutes,
          doctor_name: currentTicket.doc_last_name
            ? `Dr. ${currentTicket.doc_first_name} ${currentTicket.doc_last_name}`
            : 'Attending Physician',
        },
      });
    } catch (error) {
      console.error('[Appointments] Error fetching student queue ticket:', error);
      res.status(500).json({ error: 'Failed to retrieve active queue ticket.' });
    }
  });

  return router;
}