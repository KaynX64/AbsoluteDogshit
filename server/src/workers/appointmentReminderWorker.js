import { createHash } from 'node:crypto';
import { pool } from '../db/pool.js';
import { sendAppointmentEmail } from '../utils/mailer.js';
import { sendPushToUser } from '../utils/fcmNotifier.js';

export async function sendDueAppointmentReminders(io) {
  const connection = await pool.getConnection();
  let lockName;
  let locked = false;
  let reusable = false;
  try {
    const [[{ databaseName }]] = await connection.query('SELECT DATABASE() AS databaseName');
    lockName = 'valetudo-reminders:' + createHash('sha1').update(databaseName.toLowerCase()).digest('hex');
    const [[{ acquired }]] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    if (acquired === 0) {
      reusable = true;
      return;
    }
    if (acquired !== 1) throw new Error('Could not acquire the appointment reminder lock.');
    locked = true;
    await deliverReminders(connection, io);
  } finally {
    if (locked) {
      try {
        const [[{ released }]] = await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
        reusable = released === 1;
      } catch {
        reusable = false;
      }
    }
    if (reusable) connection.release();
    else connection.destroy();
  }
}

async function deliverReminders(connection, io) {
  const [upcoming] = await connection.query(
    `SELECT a.appointment_id, a.patient_user_id, a.date_time, a.appointment_type,
                u.email as patient_email, u.first_name as patient_first_name, u.last_name as patient_last_name,
                doc.first_name as doc_first_name, doc.last_name as doc_last_name,
                COALESCE(sp.specialty, 'Physician') as doc_specialty
         FROM APPOINTMENTS a
         JOIN USERS u ON a.patient_user_id = u.user_id
         JOIN USERS doc ON a.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE a.status = 'scheduled'
           AND a.deleted_at IS NULL
           AND a.reminder_sent = FALSE
           AND a.date_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 24 HOUR)`
  );

  for (const app of upcoming) {
    const delivered = await sendAppointmentEmail({
      toEmail: app.patient_email,
      patientName: `${app.patient_first_name} ${app.patient_last_name}`,
      doctorName: `${app.doc_first_name} ${app.doc_last_name}`,
      specialty: app.doc_specialty,
      dateTime: app.date_time,
      purpose: app.appointment_type,
      type: 'reminder',
    });
    if (!delivered) continue;

    // Persist SMTP acceptance before the best-effort push and realtime refresh.
    const [result] = await connection.query(
      `UPDATE APPOINTMENTS SET reminder_sent = TRUE
       WHERE appointment_id = ? AND status = 'scheduled' AND deleted_at IS NULL AND reminder_sent = FALSE`,
      [app.appointment_id],
    );
    if (result.affectedRows !== 1) continue;

    await sendPushToUser(app.patient_user_id, {
      title: '⏰ Consultation Reminder',
      body: `Upcoming consultation with Dr. ${app.doc_last_name} (${app.doc_specialty}) scheduled for ${app.date_time}.`,
      data: {
        type: 'APPOINTMENT_REMINDER',
        appointment_id: String(app.appointment_id),
        date_time: String(app.date_time),
      },
    }).catch((err) => console.error('[FCM Reminder Push Error]:', err.message));

    io?.emit(`appointment:reminder:${app.appointment_id}`, {
      message: `Reminder: Consultation with Dr. ${app.doc_last_name} is scheduled for ${app.date_time}.`,
    });
  }
}
