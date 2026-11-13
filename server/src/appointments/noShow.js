import { pool } from '../db/pool.js';

export async function markDueAppointmentsNoShow(graceMinutes) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
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
    await connection.commit();
    return ids;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
