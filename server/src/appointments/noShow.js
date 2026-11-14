// Marks overdue scheduled appointments as no-shows within a transaction.

import { inTransaction } from '../db/transaction.js';

export function markDueAppointmentsNoShow(graceMinutes) {
  return inTransaction(async connection => {
    const [expired] = await connection.query(
      `SELECT appointment_id FROM APPOINTMENTS
       WHERE status = 'scheduled'
         AND date_time < DATE_SUB(NOW(), INTERVAL ? MINUTE)
         AND date_time > DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND deleted_at IS NULL
       FOR UPDATE SKIP LOCKED`,
      [graceMinutes],
    );
    const ids = expired.map((row) => row.appointment_id);
    if (ids.length) {
      const [result] = await connection.query(
        `UPDATE APPOINTMENTS SET status = 'no_show'
         WHERE appointment_id IN (?) AND status = 'scheduled' AND deleted_at IS NULL`,
        [ids],
      );
      if (result.affectedRows !== ids.length) throw new Error('No-show update did not match the locked appointments.');
    }
    return ids;
  });
}
