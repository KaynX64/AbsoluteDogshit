// Validates scheduled arrivals and records their check-in, vital readings, and queue tickets.

import { inTransaction, isLockContention } from '../../../db/transaction.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { requireRoles } from '../../../middleware/rbac.js';
import { logAudit } from '../../../utils/auditLogger.js';
import { invalidateDailyQueue } from '../../../appointments/dailyQueueCache.js';
import { reserveQueueTicket } from '../../../appointments/queueTickets.js';
import { formatTriageNote, validateTriageVitals } from '../../../appointments/vitals.js';
import { intakeCounterId, findActiveQueueEntry } from './activeQueue.js';

// Mount check-in for a patient with a scheduled appointment.
export function registerBookedCheckIn(router, io) {
  // ===========================================================================
  // NURSE QR INTAKE CHECK-IN
  // ===========================================================================
  // Record the booked patient's arrival and vitals and assign an active queue ticket.
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

    let nextNum;
    try {
      nextNum = await inTransaction(async connection => {

        const [appRows] = await connection.query(
          'SELECT * FROM APPOINTMENTS WHERE appointment_id = ? AND deleted_at IS NULL FOR UPDATE',
          [appointmentId]
        );

        if (appRows.length === 0) {
          throw new Error('Appointment not found.');
        }

        const app = appRows[0];

        if (app.status !== 'scheduled') {
          throw Object.assign(new Error('Check-in conflict'), { conflict: {
            error: `This appointment is already marked as ${app.status.replace('_', ' ')}.`,
            code: 'APPOINTMENT_ALREADY_PROCESSED',
            existingStatus: app.status,
          } });
        }

        const { queueDate, queueNumber: nextNum } = await reserveQueueTicket(connection, intakeCounterId);
        const activeEntry = await findActiveQueueEntry(connection, app.patient_user_id, queueDate);
        if (activeEntry) {
          throw Object.assign(new Error('Check-in conflict'), { conflict: {
            error: `Patient is already in today's queue as ${activeEntry.ticket_no} (${activeEntry.status.replace('-', ' ')}).`,
            code: 'ALREADY_IN_QUEUE',
            existingTicket: activeEntry.ticket_no,
            existingStatus: activeEntry.status,
            arrivalTime: activeEntry.arrival_time,
          } });
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

        return nextNum;
      }, { retries: 2 });
    } catch (error) {
      if (error.conflict) return res.status(409).json(error.conflict);
      if (isLockContention(error) || error.commitUncertain) {
        return res.set('Retry-After', '1').status(503).json({ error: 'Check-in is temporarily unavailable.' });
      }
      console.error('[Checkin Error]:', error.code ?? error.name);
      if (error.code) return res.status(500).json({ error: 'Failed to check in patient.' });
      return res.status(400).json({ error: error.message || 'Failed to check in patient.' });
    }

    await invalidateDailyQueue();
    io?.emit('queue:updated');
    io?.emit('appointment:status_changed', { appointment_id: appointmentId, status: 'checked_in' });
    const queueTicket = `Q-${String(nextNum).padStart(2, '0')}`;
    const arrivalTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    res.json({ message: 'Patient arrival confirmed and admitted to queue.', queueTicket, arrivalTime });
  });
}
