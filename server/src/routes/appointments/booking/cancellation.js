import { pool } from '../../../db/pool.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { logAudit } from '../../../utils/auditLogger.js';
import { invalidateCache } from '../../../utils/redisClient.js';

export function registerBookingCancellation(router, io) {
  router.patch('/:id/cancel', authenticateToken, async (req, res) => {
    const appointmentId = Number(req.params.id);
    const { cancelled_reason } = req.body;
    const userId = req.user.user_id;

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

      // ── SEC-02 Remediation: BOLA/IDOR ownership check (Critical, CVSS 8.5) ──
      // The caller must be the patient who booked the appointment, the assigned
      // doctor, or an ADMIN. Without this, any authenticated user could cancel
      // anyone's appointment by iterating over sequential appointment IDs.
      const isOwner = Number(app.patient_user_id) === Number(userId);
      const isDoctor = Number(app.doctor_user_id) === Number(userId);
      const isAdmin = (req.user.roles || []).includes('ADMIN');
      if (!isOwner && !isDoctor && !isAdmin) {
        await connection.rollback();
        console.warn(
          `[Appointments] Authorization denied (SEC-02): user ${userId} attempted to cancel ` +
            `appointment ${appointmentId} owned by ${app.patient_user_id} ` +
            `(roles: ${(req.user.roles || []).join(', ') || 'none'})`
        );
        return res.status(403).json({
          error: 'You are not authorized to cancel this appointment.',
          code: 'APPOINTMENT_CANCEL_FORBIDDEN',
        });
      }

      if (['checked_in', 'serving', 'completed'].includes(app.status)) {
        await connection.rollback();
        return res.status(409).json({
          error: `This appointment is already marked as ${app.status.replace('_', ' ')}.`,
          code: 'APPOINTMENT_ALREADY_PROCESSED',
          existingStatus: app.status,
        });
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
}
