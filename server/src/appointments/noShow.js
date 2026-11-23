// Marks overdue scheduled appointments as no-shows within a transaction.

import { inTransaction } from '../db/transaction.js';

// Mark eligible scheduled appointments as no-shows and return their IDs.
export function markDueAppointmentsNoShow(graceMinutes) {
  // Lock overdue rows and apply their status changes in the same transaction.
  return inTransaction(async connection => {
    const [expired] = await connection.query(
      `SELECT appointment_id FROM APPOINTMENTS
       WHERE status = 'scheduled'
         AND date_time < DATE_SUB(NOW(), INTERVAL ? MINUTE)
         AND date_time > DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND deleted_at IS NULL
       ORDER BY date_time, appointment_id LIMIT 100 FOR UPDATE SKIP LOCKED`,
      [graceMinutes],
    );
    // Collect the IDs of overdue appointments selected for transition.
    const ids = expired.map((row) => row.appointment_id);
    if (ids.length) {
      const [result] = await connection.query(
        `UPDATE APPOINTMENTS FORCE INDEX (PRIMARY) SET status = 'no_show'
         WHERE appointment_id IN (?) AND status = 'scheduled' AND deleted_at IS NULL`,
        [ids],
      );
      if (result.affectedRows !== ids.length) throw new Error('No-show update did not match the locked appointments.');
    }
    return ids;
  });
}
