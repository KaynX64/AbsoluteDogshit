import { inTransaction } from '../../db/transaction.js';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { completeEncounter, prepareEncounter } from '../../appointments/completeEncounter.js';
import { AppointmentTransitionError, updateAppointmentStatus } from '../../appointments/transitions.js';
import { publishQueueChange } from './queueNotifications.js';

export function registerConsultationRoutes(router, io) {
  router.patch('/:id/status', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'), async (req, res) => {
    const appointmentId = Number(req.params.id);
    const { status } = req.body ?? {};
    try {
      const changed = await inTransaction(connection => updateAppointmentStatus(connection, appointmentId, status));
      if (changed) {
        await publishQueueChange(io, { appointment_id: appointmentId, status }, { callPatient: status === 'serving' });
      }
      res.json({ message: `Appointment status updated to ${status}.` });
    } catch (error) {
      if (error instanceof AppointmentTransitionError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error('[Status Update Error]:', error.code || error.name);
      res.status(500).json({ error: 'Failed to update appointment status.' });
    }
  });

  router.post('/:id/complete', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
    const appointmentId = Number(req.params.id);
    const clinicianId = req.user.user_id;
    const { patient_user_id: patientId } = req.body ?? {};
    try {
      const encounter = prepareEncounter(req.body ?? {}, req.user);
      const emrId = await inTransaction(async connection => {
        const recordId = await completeEncounter(connection, {
          appointmentId, patientId, clinicianId, encounter, updateMeasurements: true,
        });
        await logAudit(connection, {
          userId: clinicianId,
          action: 'CREATE',
          table: 'EMR_RECORDS',
          recordId,
          oldValue: null,
          newValue: {
            operation: 'CONSULTATION_ENCOUNTER_COMPLETED',
            appointment_id: appointmentId,
            patient_user_id: patientId,
            emr_id: recordId,
          },
          ipAddress: req.ip,
        });
        return recordId;
      });

      await publishQueueChange(io, { appointment_id: appointmentId, status: 'completed' });
      res.json({ message: 'Encounter finalized, EMR record created, and patient discharged.', emrId });
    } catch (error) {
      if (error instanceof AppointmentTransitionError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error('[Complete Encounter Error]:', error.code || error.name);
      res.status(500).json({ error: 'Failed to complete encounter.' });
    }
  });
}
