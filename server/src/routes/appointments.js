// server/src/routes/appointments.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

// GET /api/appointments/doctors - List available medical practitioners
router.get('/doctors', authenticateToken, async (req, res) => {
  try {
    const [doctors] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, sp.specialty, sp.department
       FROM USERS u
       INNER JOIN USER_ROLES ur ON u.user_id = ur.user_id
       INNER JOIN ROLES r ON ur.role_id = r.role_id
       LEFT JOIN STAFF_PROFILES sp ON u.user_id = sp.user_id
       WHERE r.code IN ('DOCTOR', 'DENTIST') AND u.is_active = TRUE`
    );
    res.json(doctors);
  } catch (error) {
    console.error('Doctors fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch doctor list.' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  const { doctor_user_id, date_time, appointment_type, notes } = req.body;
  const patientUserId = req.user.user_id;

  if (!doctor_user_id || !date_time || !appointment_type) {
    return res.status(400).json({ error: 'Doctor, date/time, and type are required.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock the Doctor's record to serialize booking attempts for this specific doctor
    await connection.query(
      `SELECT user_id FROM USERS WHERE user_id = ? FOR UPDATE`, 
      [doctor_user_id]
    );

    // 2. Check for schedule collision safely (concurrent requests are now waiting in line)
    const [conflict] = await connection.query(
      `SELECT appointment_id FROM APPOINTMENTS 
       WHERE doctor_user_id = ? AND date_time = ? AND status NOT IN ('cancelled', 'no_show')`,
      [doctor_user_id, date_time]
    );

    if (conflict.length > 0) {
      throw new Error('Selected time slot is already booked.');
    }

    // 3. Insert the appointment
    const [result] = await connection.query(
      `INSERT INTO APPOINTMENTS (patient_user_id, doctor_user_id, date_time, appointment_type, status, notes)
       VALUES (?, ?, ?, ?, 'scheduled', ?)`,
      [patientUserId, doctor_user_id, date_time, appointment_type, notes || '']
    );

    // 4. RA 10173 Audit: Log the creation of the appointment
    await logAudit(connection, {
      userId: req.user.user_id, // Patient who booked it
      action: 'CREATE',
      table: 'APPOINTMENTS',
      recordId: result.insertId,
      oldValue: null,
      newValue: { doctor_user_id, date_time, appointment_type, notes },
      ipAddress: req.ip
    });

    await connection.commit();
    res.status(201).json({
      message: 'Appointment booked successfully.',
      appointmentId: result.insertId,
    });
  } catch (error) {
    await connection.rollback();
    // Catch the specific error we threw, otherwise generic 500
    if (error.message === 'Selected time slot is already booked.') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Booking error:', error);
    res.status(500).json({ error: 'Failed to book appointment.' });
  } finally {
    connection.release();
  }
});

// GET /api/appointments/my - Get user's appointments
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const [rows] = await pool.query(
      `SELECT a.appointment_id, a.date_time, a.appointment_type, a.status, a.notes,
              u.first_name AS doctor_first_name, u.last_name AS doctor_last_name
       FROM APPOINTMENTS a
       JOIN USERS u ON a.doctor_user_id = u.user_id
       WHERE a.patient_user_id = ?
       ORDER BY a.date_time DESC`,
      [userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve appointments.' });
  }
});

export default router;