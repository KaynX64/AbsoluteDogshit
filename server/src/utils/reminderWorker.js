// server/src/utils/reminderWorker.js
import { pool } from '../db.js';
import { sendAppointmentEmail } from './mailer.js';

export function startReminderScheduler(io) {
  // Check every 15 minutes
  setInterval(async () => {
    try {
      const [upcoming] = await pool.query(
        `SELECT a.appointment_id, a.date_time, a.appointment_type,
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
}