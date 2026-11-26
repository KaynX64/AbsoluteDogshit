// Claims due reminders, sends email, and records delivery before later notifications.

import { createHash } from 'node:crypto';
import { defaultReminderLeadMinutes } from '../config/serverPolicy.js';
import { pool } from '../db/pool.js';
import { sendAppointmentEmail } from '../utils/mailer.js';
import { sendPushToUser } from '../utils/fcmNotifier.js';
import { readServerPolicy } from '../utils/serverPolicyStore.js';

const reminderBatchSize = 50;
let nextAfter = null;
let cursorPolicy;

// Hold a database-scoped lock while processing one reminder batch.
export async function sendDueAppointmentReminders(io, { sendEmail = sendAppointmentEmail, sendPush = sendPushToUser } = {}) {
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
      return { skipped: true };
    }
    if (acquired !== 1) throw new Error('Could not acquire the appointment reminder lock.');
    locked = true;
    const { version, values } = await readServerPolicy(connection);
    const policy = `${databaseName}:${version}`;
    if (cursorPolicy !== policy) nextAfter = null;
    cursorPolicy = policy;
    return await deliverReminders(connection, io, values.appointmentReminderLeadMinutes, sendEmail, sendPush);
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

// Deliver due reminders, persist SMTP acceptance, and send optional push and realtime updates.
async function deliverReminders(connection, io, leadMinutes, sendEmail, sendPush) {
  let [upcoming] = await loadReminderBatch(connection, leadMinutes, nextAfter);
  if (!upcoming.length && nextAfter) [upcoming] = await loadReminderBatch(connection, leadMinutes, null);
  nextAfter = upcoming.length === reminderBatchSize ? upcoming.at(-1) : null;
  let deliveredCount = 0;
  for (const app of upcoming) {
    const delivered = await sendEmail({
      toEmail: app.patient_email,
      patientName: `${app.patient_first_name} ${app.patient_last_name}`,
      dateTime: app.cursor_date_time,
      type: 'reminder',
    });
    if (!delivered) continue;

    // Persist SMTP acceptance before the best-effort push and realtime refresh.
    const [result] = await connection.query(
      `UPDATE APPOINTMENTS SET reminder_sent = TRUE, last_reminder_lead_minutes = ?
       WHERE appointment_id = ? AND status = 'scheduled' AND deleted_at IS NULL AND date_time = ?
         AND ? < COALESCE(last_reminder_lead_minutes, IF(reminder_sent, ?, 32767))`,
      [app.lead_minutes, app.appointment_id, app.cursor_date_time, app.lead_minutes, defaultReminderLeadMinutes],
    );
    if (result.affectedRows !== 1) continue;
    deliveredCount++;
    if (app.reminder_sent) continue;

    // Log a push failure without changing the already recorded email delivery.
    await sendPush(app.patient_user_id, {
      title: '⏰ Consultation Reminder',
      body: `Upcoming consultation with Dr. ${app.doc_last_name} (${app.doc_specialty}) scheduled for ${app.date_time}.`,
      data: {
        type: 'APPOINTMENT_REMINDER',
        appointment_id: String(app.appointment_id),
        date_time: String(app.date_time),
      },
    }).catch((err) => console.error('[FCM Reminder Push Error]:', err.code ?? err.name));

    io?.to(`user:${app.patient_user_id}`).emit(`appointment:reminder:${app.appointment_id}`, {
      message: `Reminder: Consultation with Dr. ${app.doc_last_name} is scheduled for ${app.date_time}.`,
    });
  }
  return { metrics: { attempted: upcoming.length, delivered: deliveredCount }, degraded: deliveredCount < upcoming.length };
}

// Read the next batch of upcoming appointments after the saved cursor.
function loadReminderBatch(connection, leadMinutes, after) {
  return connection.query(
    `WITH due AS (
         SELECT a.appointment_id, a.date_time, MIN(offsets.lead_minutes) AS lead_minutes
         FROM APPOINTMENTS a
         JOIN JSON_TABLE(?, '$[*]' COLUMNS (lead_minutes INT PATH '$')) AS offsets
           ON a.date_time <= TIMESTAMPADD(MINUTE, offsets.lead_minutes, NOW())
          AND offsets.lead_minutes < COALESCE(a.last_reminder_lead_minutes, IF(a.reminder_sent, ?, 32767))
         WHERE a.status = 'scheduled' AND a.deleted_at IS NULL
           AND a.date_time > NOW() AND a.date_time <= TIMESTAMPADD(MINUTE, ?, NOW())
           ${after ? 'AND (a.date_time > ? OR (a.date_time = ? AND a.appointment_id > ?))' : ''}
         GROUP BY a.appointment_id, a.date_time
         ORDER BY a.date_time, a.appointment_id
         LIMIT ?
       )
       SELECT a.appointment_id, a.patient_user_id, a.date_time, CAST(a.date_time AS CHAR) AS cursor_date_time,
                a.reminder_sent, due.lead_minutes,
                u.email as patient_email, u.first_name as patient_first_name, u.last_name as patient_last_name,
                doc.last_name as doc_last_name,
                COALESCE(sp.specialty, 'Physician') as doc_specialty
         FROM due JOIN APPOINTMENTS a ON due.appointment_id = a.appointment_id
         JOIN USERS u ON a.patient_user_id = u.user_id
         JOIN USERS doc ON a.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         ORDER BY due.date_time, due.appointment_id`,
    [JSON.stringify(leadMinutes), defaultReminderLeadMinutes, Math.max(...leadMinutes),
      ...(after ? [after.cursor_date_time, after.cursor_date_time, after.appointment_id] : []), reminderBatchSize],
  );
}
