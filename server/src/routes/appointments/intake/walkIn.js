import { pool } from '../../../db/pool.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { requireRoles } from '../../../middleware/rbac.js';
import { logAudit } from '../../../utils/auditLogger.js';
import { invalidateCache } from '../../../utils/redisClient.js';
import { reserveQueueTicket } from '../../../appointments/queueTickets.js';
import { validateVitals } from '../../../appointments/vitals.js';
import { intakeCounterId, findActiveQueueEntry } from './activeQueue.js';

export function registerWalkIn(router, io) {
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
}
