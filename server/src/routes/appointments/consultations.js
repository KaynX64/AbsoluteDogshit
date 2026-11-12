import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { encrypt } from '../../utils/cryptoVault.js';
import { invalidateCache } from '../../utils/redisClient.js';
import { sendPushToUser } from '../../utils/fcmNotifier.js';
import { readEncounterText } from '../../appointments/encounterText.js';
import { validateDentalChart } from '../../utils/dentalValidator.js';
import { SignerError, assertAppointmentInQueue } from '../../documents/signing/signatory.js';
import { validateVitals, VITAL_RULES } from '../../appointments/vitals.js';

export function registerConsultationRoutes(router, io) {
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

      if (status === 'serving') {
        try {
          const [details] = await pool.query(
            `SELECT a.patient_user_id,
                    CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
                    COALESCE(CONCAT('Dr. ', doc.first_name, ' ', doc.last_name), 'the Clinic Doctor') AS doctor_name
             FROM APPOINTMENTS a
             LEFT JOIN QUEUE q ON q.appointment_id = a.appointment_id
             LEFT JOIN USERS doc ON a.doctor_user_id = doc.user_id
             WHERE a.appointment_id = ?`,
            [appointmentId]
          );

          if (details.length > 0 && details[0].patient_user_id) {
            const { patient_user_id, ticket_no, doctor_name } = details[0];
            sendPushToUser(patient_user_id, {
              title: `🔔 It's Your Turn! (${ticket_no || 'Consultation'})`,
              body: `Please proceed to the consultation room with ${doctor_name}.`,
              data: {
                type: 'QUEUE_TURN',
                ticketNo: ticket_no || '',
                doctorName: doctor_name,
              },
            }).catch((err) => console.error('[FCM Queue Turn Error]:', err.message));
          }
        } catch (pushErr) {
          console.error('[FCM Queue Turn Fetch Error]:', pushErr.message);
        }
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
      vitals: submittedVitals,
      dental_chart,
    } = req.body;

    const userRoles = req.user.roles || [];
    if (
      submittedVitals !== undefined &&
      !userRoles.includes('ADMIN') &&
      (userRoles.includes('DOCTOR') || userRoles.includes('DENTIST'))
    ) {
      return res.status(403).json({ error: 'Doctors and dentists cannot record patient vitals.' });
    }

    const { values: vitals, errors } = validateVitals(submittedVitals);
    const vitalError = Object.values(errors)[0];
    if (vitalError) return res.status(400).json({ error: vitalError });

    let encounterText;
    try {
      encounterText = readEncounterText(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const { chief_complaint, diagnosis, treatment_plan, notes } = encounterText;

    // ── Dental Odontogram Schema Validation ───────────────────────────────────
    if (dental_chart !== undefined && dental_chart !== null && (req.user.roles || []).includes('DENTIST')) {
      const chartValidation = validateDentalChart(dental_chart);
      if (!chartValidation.valid) {
        return res.status(400).json({
          error: chartValidation.error,
          code: 'INVALID_DENTAL_CHART',
        });
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Encounters may only be finalized for a patient in the QUEUE
      // (checked_in / serving) who is assigned to this clinician.
      await assertAppointmentInQueue(connection, appointmentId, patient_user_id, doctorUserId);

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

      if (
        dental_chart &&
        typeof dental_chart === 'object' &&
        (req.user.roles || []).includes('DENTIST')
      ) {
        await connection.query(
          `INSERT INTO DENTAL_CHARTS (emr_id, patient_user_id, dentist_user_id, chart_data)
           VALUES (?, ?, ?, ?)`,
          [emrId, patient_user_id, doctorUserId, encrypt(JSON.stringify(dental_chart))]
        );
      }

      for (const [metric, value] of Object.entries(vitals)) {
        await connection.query(
          `INSERT INTO VITAL_SIGNS (emr_id, metric, value, unit, recorded_by)
           VALUES (?, ?, ?, ?, ?)`,
          [emrId, metric, value, VITAL_RULES[metric].unit, doctorUserId]
        );
      }

      if (vitals.height || vitals.weight) {
        const [hpRows] = await connection.query(
          'SELECT profile_id FROM HEALTH_PROFILES WHERE user_id = ?',
          [patient_user_id]
        );
        if (hpRows.length > 0) {
          await connection.query(
            `UPDATE HEALTH_PROFILES
             SET height = COALESCE(?, height),
                 weight = COALESCE(?, weight),
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?`,
            [
              vitals.height ? Number(vitals.height) : null,
              vitals.weight ? Number(vitals.weight) : null,
              patient_user_id,
            ]
          );
        } else {
          await connection.query(
            `INSERT INTO HEALTH_PROFILES (user_id, height, weight) VALUES (?, ?, ?)`,
            [
              patient_user_id,
              vitals.height ? Number(vitals.height) : null,
              vitals.weight ? Number(vitals.weight) : null,
            ]
          );
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
            if (error instanceof SignerError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error('[Complete Encounter Error]:', error);
      res.status(500).json({ error: error.message || 'Failed to complete encounter.' });
    } finally {
      connection.release();
    }
  });
}
