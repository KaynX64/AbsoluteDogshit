import { pool } from '../../db/pool.js';
import { sendPushToUser } from '../../utils/fcmNotifier.js';
import { invalidateCache } from '../../utils/redisClient.js';

export async function publishQueueChange(io, change, { callPatient = false, queueFirst = false } = {}) {
  await invalidateCache('queue:*');
  if (io) {
    if (queueFirst) io.emit('queue:updated');
    io.emit('appointment:status_changed', change);
    if (!queueFirst) io.emit('queue:updated');
  }
  if (!callPatient) return;

  const { queue_id, appointment_id } = change;
  try {
    const from = queue_id
      ? 'QUEUE q LEFT JOIN APPOINTMENTS a ON a.appointment_id = q.appointment_id'
      : 'APPOINTMENTS a LEFT JOIN QUEUE q ON q.appointment_id = a.appointment_id';
    const key = queue_id ? 'q.queue_id' : 'a.appointment_id';
    const patient = queue_id ? 'q.patient_user_id' : 'a.patient_user_id';
    const [[details]] = await pool.query(
      `SELECT ${patient} AS patient_user_id,
              CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
              COALESCE(CONCAT('Dr. ', doc.first_name, ' ', doc.last_name), 'the Clinic Doctor') AS doctor_name
       FROM ${from}
       LEFT JOIN USERS doc ON doc.user_id = a.doctor_user_id
       WHERE ${key} = ?
       ORDER BY q.queue_date DESC, q.queue_id DESC LIMIT 1`,
      [queue_id ?? appointment_id],
    );
    if (!details?.patient_user_id) return;
    const { patient_user_id, ticket_no, doctor_name } = details;
    void sendPushToUser(patient_user_id, {
      title: `🔔 It's Your Turn! (${ticket_no || 'Consultation'})`,
      body: `Please proceed to the consultation room with ${doctor_name}.`,
      data: { type: 'QUEUE_TURN', ticketNo: ticket_no || '', doctorName: doctor_name },
    });
  } catch (error) {
    console.error('[FCM Queue Turn Lookup Error]:', error.code || error.name);
  }
}
