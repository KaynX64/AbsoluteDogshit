// server/src/utils/reminderWorker.js
import { pool } from '../db.js';
import { sendAppointmentEmail } from './mailer.js';
import { logAudit } from './auditLogger.js';
import { sendPushToUser } from './fcmNotifier.js';

export function startReminderScheduler(io) {
  // Check every 15 minutes
  setInterval(async () => {
    try {
const [upcoming] = await pool.query(
        `SELECT a.appointment_id, a.patient_user_id, a.date_time, a.appointment_type,
                u.email as patient_email, u.first_name as patient_first_name, u.last_name as patient_last_name,
                doc.first_name as doc_first_name, doc.last_name as doc_last_name,
                COALESCE(sp.specialty, 'Physician') as doc_specialty
         FROM APPOINTMENTS a
         JOIN USERS u ON a.patient_user_id = u.user_id
         JOIN USERS doc ON a.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE a.status = 'scheduled'
           AND a.reminder_sent = FALSE
           AND a.date_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 24 HOUR)`
      );

for (const app of upcoming) {
        // 1. Send Email Reminder
        await sendAppointmentEmail({
          toEmail: app.patient_email,
          patientName: `${app.patient_first_name} ${app.patient_last_name}`,
          doctorName: `${app.doc_first_name} ${app.doc_last_name}`,
          specialty: app.doc_specialty,
          dateTime: app.date_time,
          purpose: app.appointment_type,
          type: 'reminder',
        });

        // 2b. Dispatch mobile FCM background push notification to the patient's device
        await sendPushToUser(app.patient_user_id, {
          title: '⏰ Consultation Reminder',
          body: `Upcoming consultation with Dr. ${app.doc_last_name} (${app.doc_specialty}) scheduled for ${app.date_time}.`,
          data: {
            type: 'APPOINTMENT_REMINDER',
            appointment_id: String(app.appointment_id),
            date_time: String(app.date_time),
          },
        }).catch((err) => console.error('[FCM Reminder Push Error]:', err.message));

        // 2. Broadcast push/socket reminder if client is connected
        if (io) {
          io.emit(`appointment:reminder:${app.appointment_id}`, {
            message: `Reminder: Consultation with Dr. ${app.doc_last_name} is scheduled for ${app.date_time}.`,
          });
        }

        // 3. Mark reminder as sent
        await pool.query('UPDATE APPOINTMENTS SET reminder_sent = TRUE WHERE appointment_id = ?', [
          app.appointment_id,
        ]);
      }
    } catch (err) {
      console.error('[Reminder Worker Error]:', err.message);
    }
  }, 15 * 60 * 1000); // 15 mins

  // ── Auto-no-show worker: runs every 60 seconds ────────────────────
  setInterval(async () => {
    try {
      const [expired] = await pool.query(
        `SELECT appointment_id FROM APPOINTMENTS
         WHERE status = 'scheduled'
           AND date_time < DATE_SUB(NOW(), INTERVAL 20 MINUTE)
           AND date_time > DATE_SUB(NOW(), INTERVAL 24 HOUR)
           AND deleted_at IS NULL`
      );

      if (expired.length === 0) return;

      const ids = expired.map((r) => r.appointment_id);

      await pool.query(
        `UPDATE APPOINTMENTS SET status = 'no_show' WHERE appointment_id IN (?)`,
        [ids]
      );

      console.log(`[Auto-No-Show] Marked ${ids.length} appointment(s) as no-show.`);

      if (io) {
        for (const id of ids) {
          io.emit('appointment:status_changed', {
            appointment_id: id,
            status: 'no_show',
          });
        }
        io.emit('queue:updated');
      }
    } catch (err) {
      console.error('[Auto-No-Show Worker Error]:', err.message);
    }
  }, 60 * 1000); // every 60 seconds

  // ── Gap 9: Prescription Auto-Expiry Worker ─────────────────────────
  // Runs every 30 minutes. A prescription is considered "expired" when the
  // latest clinical window across its line items has closed:
  //   MAX(issued_at + INTERVAL duration_days DAY) < NOW()
  //
  // This is a clinical validity window, NOT the 5-year R.A. 10173 retention
  // sweep (which is handled separately by /api/privacy/retention/sweep).
  setInterval(async () => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [expired] = await connection.query(
        `SELECT p.prescription_id
         FROM PRESCRIPTIONS p
         JOIN PRESCRIPTION_ITEMS pi ON pi.prescription_id = p.prescription_id
         WHERE p.status = 'active'
           AND p.deleted_at IS NULL
         GROUP BY p.prescription_id
         HAVING MAX(DATE_ADD(p.issued_at, INTERVAL pi.duration_days DAY)) < NOW()`
      );

      if (expired.length === 0) {
        await connection.commit();
        return;
      }

      const ids = expired.map((r) => r.prescription_id);

      await connection.query(
        `UPDATE PRESCRIPTIONS SET status = 'expired' WHERE prescription_id IN (?)`,
        [ids]
      );

      // R.A. 10173 audit trail for the automated state change
      await logAudit(connection, {
        userId: null, // system-initiated
        action: 'UPDATE',
        table: 'PRESCRIPTIONS',
        recordId: 0,
        oldValue: null,
        newValue: {
          operation: 'AUTO_EXPIRE_PRESCRIPTIONS',
          count: ids.length,
          prescription_ids: ids,
        },
        ipAddress: 'system',
      });

      await connection.commit();

      console.log(`[Prescription Expiry Worker] Marked ${ids.length} prescription(s) as expired.`);

      if (io) {
        io.emit('prescription:status_changed', {
          status: 'expired',
          count: ids.length,
          prescription_ids: ids,
        });
      }
    } catch (err) {
      await connection.rollback();
      console.error('[Prescription Expiry Worker Error]:', err.message);
    } finally {
      connection.release();
    }
  }, 30 * 60 * 1000); // every 30 minutes

    // ── Nightly PDF backfill (Feature 8) ─────────────────────────────
  setInterval(async () => {
    try {
      const { generateAndStorePrescriptionPDF, generateAndStoreClearancePDF } =
        await import('./documentService.js');

      const [missingRx] = await pool.query(
        `SELECT prescription_id FROM PRESCRIPTIONS
         WHERE pdf_s3_key IS NULL AND deleted_at IS NULL
         ORDER BY prescription_id DESC LIMIT 20`
      );
      for (const rx of missingRx) {
        await generateAndStorePrescriptionPDF(rx.prescription_id);
      }

      const [missingClr] = await pool.query(
        `SELECT clearance_id FROM MEDICAL_CLEARANCES
         WHERE pdf_s3_key IS NULL AND deleted_at IS NULL
         ORDER BY clearance_id DESC LIMIT 20`
      );
      for (const clr of missingClr) {
        await generateAndStoreClearancePDF(clr.clearance_id);
      }
    } catch (err) {
      console.error('[PDF Backfill Worker Error]:', err.message);
    }
  }, 6 * 60 * 60 * 1000); // every 6 hours
}