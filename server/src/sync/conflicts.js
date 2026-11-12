export const COMPLETED_APPOINTMENT_CONFLICT = 'Appointment was already completed concurrently on the server.';

export async function isCompletedAppointment(connection, appointmentId) {
  const [rows] = await connection.query(
    'SELECT status FROM APPOINTMENTS WHERE appointment_id = ? FOR UPDATE',
    [appointmentId],
  );
  return rows[0]?.status === 'completed';
}
