import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { invalidateCache } from '../../utils/redisClient.js';
import { reserveQueueTicket } from '../../utils/queueTickets.js';
import { getBmiCategory } from '../../utils/bmi.js';
import { formatTriageNote, validateTriageVitals, validateVitals } from '../../utils/vitals.js';

export function registerIntakeRoutes(router, io) {
  const intakeCounterId = 1;

  // Shared guard: active queue ticket check
  async function findActiveQueueEntry(connection, patientUserId, queueDate) {
    const [rows] = await connection.query(
      `SELECT q.queue_id, q.queue_number, q.status, q.appointment_id,
              CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
              DATE_FORMAT(q.checked_in_at, '%h:%i %p') AS arrival_time
       FROM QUEUE q
       WHERE q.patient_user_id = ?
         AND q.queue_date = ?
         AND q.status IN ('waiting', 'in-consultation')
       ORDER BY q.queue_id DESC
       LIMIT 1 FOR UPDATE`,
      [patientUserId, queueDate]
    );
    return rows.length > 0 ? rows[0] : null;
  }

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

  // ===========================================================================
  // NURSE QR INTAKE CHECK-IN
  // ===========================================================================
  router.post('/:id/checkin', authenticateToken, requireRoles('NURSE', 'ADMIN'), async (req, res) => {
    const appointmentId = Number(req.params.id);
    const { sex, date_of_birth } = req.body;
    const { values: vitals, errors } = validateTriageVitals(req.body);
    const vitalError = Object.values(errors)[0];
    if (vitalError) return res.status(400).json({ error: vitalError });
    const { height, weight } = vitals;

    if (sex !== undefined && sex !== null && !['MALE', 'FEMALE'].includes(sex)) {
      return res.status(400).json({ error: 'sex must be MALE or FEMALE.' });
    }

    if (date_of_birth !== undefined && date_of_birth !== null && date_of_birth !== '') {
      const dobDate = new Date(date_of_birth);
      if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
        return res.status(400).json({ error: 'date_of_birth must be a valid date in the past.' });
      }
    }

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

      if (['checked_in', 'serving', 'completed'].includes(app.status)) {
        await connection.rollback();
        return res.status(409).json({
          error: `This appointment is already marked as ${app.status.replace('_', ' ')}.`,
          code: 'APPOINTMENT_ALREADY_PROCESSED',
          existingStatus: app.status,
        });
      }

      const { queueDate, queueNumber: nextNum } = await reserveQueueTicket(connection, intakeCounterId);
      const activeEntry = await findActiveQueueEntry(connection, app.patient_user_id, queueDate);
      if (activeEntry) {
        await connection.rollback();
        return res.status(409).json({
          error: `Patient is already in today's queue as ${activeEntry.ticket_no} (${activeEntry.status.replace('-', ' ')}).`,
          code: 'ALREADY_IN_QUEUE',
          existingTicket: activeEntry.ticket_no,
          existingStatus: activeEntry.status,
          arrivalTime: activeEntry.arrival_time,
        });
      }

      await connection.query(
        `INSERT INTO QUEUE (patient_user_id, appointment_id, queue_date, counter_id, queue_number, status, checked_in_at)
         VALUES (?, ?, ?, ?, ?, 'waiting', CURRENT_TIMESTAMP)`,
        [app.patient_user_id, appointmentId, queueDate, intakeCounterId, nextNum]
      );

      const combinedNotes = formatTriageNote(vitals) + (app.notes || '');

      await connection.query(
        "UPDATE APPOINTMENTS SET status = 'checked_in', notes = ? WHERE appointment_id = ?",
        [combinedNotes, appointmentId]
      );

      if (sex || date_of_birth || height || weight) {
        const [hpRows] = await connection.query(
          'SELECT profile_id FROM HEALTH_PROFILES WHERE user_id = ?',
          [app.patient_user_id]
        );
        if (hpRows.length > 0) {
          await connection.query(
            `UPDATE HEALTH_PROFILES
             SET sex = COALESCE(?, sex),
                 date_of_birth = COALESCE(?, date_of_birth),
                 height = COALESCE(?, height),
                 weight = COALESCE(?, weight),
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?`,
            [sex || null, date_of_birth || null, height ? Number(height) : null, weight ? Number(weight) : null, app.patient_user_id]
          );
        } else {
          await connection.query(
            `INSERT INTO HEALTH_PROFILES (user_id, sex, date_of_birth, height, weight) VALUES (?, ?, ?, ?, ?)`,
            [app.patient_user_id, sex || null, date_of_birth || null, height ? Number(height) : null, weight ? Number(weight) : null]
          );
        }
      }

      await logAudit(connection, {
        userId: req.user.user_id,
        action: 'UPDATE',
        table: 'APPOINTMENTS',
        recordId: appointmentId,
        oldValue: { status: app.status },
        newValue: {
          status: 'checked_in',
          queue_number: nextNum,
          height: height || null,
          weight: weight || null,
          sex: sex || null,
        },
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

  // ===========================================================================
  // 6.1 POST /api/appointments/walk-in
  // ===========================================================================
  router.post('/walk-in', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
    const { patient_user_id, visit_type, notes, vitals, sex, date_of_birth } = req.body;

    const userRoles = req.user.roles || [];
    if (
      (vitals !== undefined || sex !== undefined) &&
      !userRoles.includes('ADMIN') &&
      (userRoles.includes('DOCTOR') || userRoles.includes('DENTIST'))
    ) {
      return res.status(403).json({ error: 'Doctors and dentists cannot record patient vitals.' });
    }
    if (sex !== undefined && sex !== null && !['MALE', 'FEMALE'].includes(sex)) {
      return res.status(400).json({ error: 'sex must be MALE or FEMALE.' });
    }
    if (date_of_birth !== undefined && date_of_birth !== null && date_of_birth !== '') {
      const dobDate = new Date(date_of_birth);
      if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
        return res.status(400).json({ error: 'date_of_birth must be a valid date in the past.' });
      }
    }
    const { values: patientVitals, errors } = validateVitals(vitals);
    const vitalError = Object.values(errors)[0];
    if (vitalError) return res.status(400).json({ error: vitalError });

    if (!patient_user_id) {
      return res.status(400).json({ error: 'patient_user_id is required.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [patientRows] = await connection.query(
        `SELECT u.user_id, u.first_name, u.last_name
         FROM USERS u
         WHERE u.user_id = ? AND u.is_active = TRUE AND u.deleted_at IS NULL`,
        [patient_user_id]
      );

      if (patientRows.length === 0) {
        throw new Error('Patient not found or inactive.');
      }

      const { queueDate, queueNumber: nextNum } = await reserveQueueTicket(connection, intakeCounterId);
      const activeEntry = await findActiveQueueEntry(connection, patient_user_id, queueDate);
      if (activeEntry) {
        await connection.rollback();
        return res.status(409).json({
          error: `Patient is already in today's queue as ${activeEntry.ticket_no} (${activeEntry.status.replace('-', ' ')}).`,
          code: 'ALREADY_IN_QUEUE',
          existingTicket: activeEntry.ticket_no,
          existingStatus: activeEntry.status,
          arrivalTime: activeEntry.arrival_time,
        });
      }

      const [queueResult] = await connection.query(
        `INSERT INTO QUEUE
         (patient_user_id, appointment_id, queue_date, counter_id, queue_number, status, checked_in_at)
         VALUES (?, NULL, ?, ?, ?, 'waiting', CURRENT_TIMESTAMP)`,
        [patient_user_id, queueDate, intakeCounterId, nextNum]
      );

      if (sex || date_of_birth || patientVitals.height || patientVitals.weight) {
        const [hpRows] = await connection.query(
          'SELECT profile_id FROM HEALTH_PROFILES WHERE user_id = ?',
          [patient_user_id]
        );

        if (hpRows.length > 0) {
          await connection.query(
            `UPDATE HEALTH_PROFILES
             SET sex = COALESCE(?, sex),
                 date_of_birth = COALESCE(?, date_of_birth),
                 height = COALESCE(?, height),
                 weight = COALESCE(?, weight),
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?`,
            [
              sex || null,
              date_of_birth || null,
              patientVitals.height ? Number(patientVitals.height) : null,
              patientVitals.weight ? Number(patientVitals.weight) : null,
              patient_user_id,
            ]
          );
        } else {
          await connection.query(
            'INSERT INTO HEALTH_PROFILES (user_id, sex, date_of_birth, height, weight) VALUES (?, ?, ?, ?, ?)',
            [
              patient_user_id,
              sex || null,
              date_of_birth || null,
              patientVitals.height ? Number(patientVitals.height) : null,
              patientVitals.weight ? Number(patientVitals.weight) : null,
            ]
          );
        }
      }

      await logAudit(connection, {
        userId: req.user.user_id,
        action: 'CREATE',
        table: 'QUEUE',
        recordId: queueResult.insertId,
        oldValue: null,
        newValue: {
          operation: 'WALK_IN_PATIENT_REGISTERED',
          patient_user_id,
          queue_number: nextNum,
          visit_type: visit_type || 'Walk-in Consultation',
          notes: notes || null,
          vitals_recorded: Boolean(vitals || sex),
        },
        ipAddress: req.ip,
      });

      await connection.commit();
      await invalidateCache('queue:*');

      if (io) {
        io.emit('queue:updated');
      }

      const queueTicket = `Q-${String(nextNum).padStart(2, '0')}`;
      const arrivalTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      res.status(201).json({
        message: "Walk-in patient registered and admitted to today's queue.",
        queueTicket,
        queueNumber: nextNum,
        arrivalTime,
      });
    } catch (error) {
      await connection.rollback();
      console.error('[Walk-in Error]:', error);
      res.status(400).json({ error: error.message || 'Failed to register walk-in patient.' });
    } finally {
      connection.release();
    }
  });

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
