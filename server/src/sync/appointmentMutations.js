export async function updateAppointment(connection, { payload }) {
  const { appointment_id, status } = payload;
  if (!appointment_id) throw new Error('appointment_id is required');

  await connection.query(
    'UPDATE APPOINTMENTS SET status = ?, version = version + 1 WHERE appointment_id = ? AND deleted_at IS NULL',
    [status, appointment_id]
  );

  // Sync queue status if needed
  if (status === 'completed' || status === 'cancelled') {
    const queueStatus = status === 'completed' ? 'done' : 'cancelled';
    await connection.query(
      'UPDATE QUEUE SET status = ?, served_at = CURRENT_TIMESTAMP WHERE appointment_id = ?',
      [queueStatus, appointment_id],
    );
  }
  return { serverRecordId: appointment_id };
}
