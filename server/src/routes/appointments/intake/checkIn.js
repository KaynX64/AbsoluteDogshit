// Validates scheduled arrivals and records their check-in, vital readings, and queue tickets.

import { pool } from '../../../db/pool.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { requireRoles } from '../../../middleware/rbac.js';
import { logAudit } from '../../../utils/auditLogger.js';
import { invalidateCache } from '../../../utils/redisClient.js';
import { reserveQueueTicket } from '../../../appointments/queueTickets.js';
import { formatTriageNote, validateTriageVitals } from '../../../appointments/vitals.js';
import { intakeCounterId, findActiveQueueEntry } from './activeQueue.js';

export function registerBookedCheckIn(router, io) {
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
}
