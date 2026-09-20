// server/src/routes/appointments.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { logAudit } from '../utils/auditLogger.js';
import { sendAppointmentEmail } from '../utils/mailer.js';

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

  // 2. GET /api/appointments/slots
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
           AND status IN ('scheduled', 'checked_in', 'serving')`,
        [doctorId, date]
      );

      const bookedSet = new Set(existingBookings.map((b) => b.booked_time));

      // Filter out past hours if selected date is today
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

  // 3. POST /api/appointments (Book Consultation)
  router.post('/', authenticateToken, async (req, res) => {
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
           AND status IN ('scheduled', 'checked_in', 'serving')`,
        [doctor_user_id, date_time]
      );

      if (conflict.length > 0) {
        throw new Error('Selected time slot is already booked.');
      }

      const [patientConflict] = await connection.query(
        `SELECT appointment_id FROM APPOINTMENTS 
         WHERE patient_user_id = ? 
           AND date_time = ? 
           AND status IN ('scheduled', 'checked_in', 'serving')`,
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
        newValue: { doctor_user_id, date_time, appointment_type, notes },
        ipAddress: req.ip
      });

      await connection.commit();

      // Fetch patient and doctor details for email & desktop notifications
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

      // Broadcast to clinic Electron desktops
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
  router.get('/my', authenticateToken, async (req, res) => {
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
         WHERE a.patient_user_id = ?
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

      // Send cancellation email
      const [appDetails] = await pool.query(
        `SELECT a.date_time, u.email, u.first_name, u.last_name 
         FROM APPOINTMENTS a 
         JOIN USERS u ON a.patient_user_id = u.user_id 
         WHERE a.appointment_id = ?`,
        [appointmentId]
      );

      if (appDetails.length > 0 && typeof sendAppointmentEmail === 'function') {
        const item = appDetails[0];
        sendAppointmentEmail({
          toEmail: item.email,
          patientName: `${item.first_name} ${item.last_name}`,
          doctorName: 'Attending Practitioner',
          specialty: 'Infirmary',
          dateTime: item.date_time,
          purpose: 'Cancellation',
          type: 'cancellation',
        }).catch((err) => console.error('[Cancellation Email Error]:', err.message));
      }

      if (io) {
        io.emit('appointment:cancelled', { appointmentId: Number(appointmentId) });
      }

      res.json({ message: 'Appointment cancelled successfully.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to cancel appointment.' });
    }
  });

  // 6. GET /api/appointments/today
  router.get('/today', authenticateToken, async (req, res) => {
    try {
      const { date, filter } = req.query;
      let whereClause = '';
      const params = [];

      if (filter === 'history') {
        whereClause = `WHERE a.status IN ('completed', 'cancelled', 'no_show')`;
      } else if (date) {
        whereClause = `WHERE DATE(a.date_time) = ? AND a.status IN ('scheduled', 'checked_in', 'serving')`;
        params.push(date);
      } else {
        whereClause = `WHERE a.date_time >= CURDATE() AND a.status IN ('scheduled', 'checked_in', 'serving')`;
      }

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
                emr.treatment_plan AS past_treatment
         FROM APPOINTMENTS a
         JOIN USERS u ON a.patient_user_id = u.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         LEFT JOIN EMR_RECORDS emr ON (emr.patient_user_id = a.patient_user_id AND DATE(emr.encounter_date) = DATE(a.date_time))
         ${whereClause}
         ORDER BY a.date_time DESC`,
        params
      );
      res.json(rows);
    } catch (error) {
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

  // 8. POST /api/appointments/:id/complete
  router.post('/:id/complete', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const appointmentId = req.params.id;
      const doctorUserId = req.user.user_id;
      const { patient_user_id, chief_complaint, diagnosis, treatment_plan, notes } = req.body;

      await connection.beginTransaction();

      const [emrResult] = await connection.query(
        `INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, chief_complaint, diagnosis, treatment_plan, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [patient_user_id, doctorUserId, chief_complaint, diagnosis, treatment_plan, notes || '']
      );

      await connection.query(`UPDATE APPOINTMENTS SET status = 'completed' WHERE appointment_id = ?`, [appointmentId]);
      await connection.query(`UPDATE QUEUE SET status = 'done', served_at = CURRENT_TIMESTAMP WHERE appointment_id = ?`, [appointmentId]);

      await connection.commit();

      if (io) {
        io.emit('appointment:completed', { appointmentId: Number(appointmentId) });
        io.emit('queue:updated');
      }

      res.json({ message: 'Consultation finalized and saved to patient EMR history!', emrId: emrResult.insertId });
    } catch (error) {
      await connection.rollback();
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
        WHERE a.status IN ('scheduled', 'checked_in')
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
      res.json(results);
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
        `SELECT patient_user_id FROM APPOINTMENTS WHERE appointment_id = ? FOR UPDATE`,
        [appointmentId]
      );

      if (appRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Appointment not found.' });
      }

      const patientUserId = appRows[0].patient_user_id;

      await connection.query(`UPDATE APPOINTMENTS SET status = 'checked_in' WHERE appointment_id = ?`, [appointmentId]);

      const today = new Date().toISOString().split('T')[0];
      const [queueCount] = await connection.query(`SELECT COUNT(*) as totalToday FROM QUEUE WHERE queue_date = ?`, [today]);
      const nextQueueNo = (queueCount[0].totalToday || 0) + 1;

      await connection.query(
        `INSERT INTO QUEUE (patient_user_id, appointment_id, queue_date, counter_id, queue_number, status, checked_in_at)
         VALUES (?, ?, ?, 1, ?, 'waiting', CURRENT_TIMESTAMP)`,
        [patientUserId, appointmentId, today, nextQueueNo]
      );

      if (blood_pressure || temperature || pulse || spo2) {
        await connection.query(`UPDATE HEALTH_PROFILES SET updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [patientUserId]);
      }

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

      if (io) {
        io.emit('queue:updated');
      }

      res.json({ message: `Queue ticket #${queueId} updated to ${status}.` });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update queue status.' });
    }
  });

  return router;
}