// Applies replayed appointment status changes under the staff assignment and transition rules.

import { updateAppointmentStatus } from '../appointments/transitions.js';
import { fail } from '../utils/httpError.js';

export async function updateAppointment(connection, { payload }, user) {
  const { appointment_id, status } = payload;
  if (!appointment_id) throw fail('appointment_id is required');
  if (!user.roles.includes('NURSE')) {
    const [[assigned]] = await connection.query(
      'SELECT appointment_id FROM APPOINTMENTS WHERE appointment_id = ? AND doctor_user_id = ? AND deleted_at IS NULL FOR UPDATE',
      [appointment_id, user.user_id],
    );
    if (!assigned) throw fail('Appointment not found under your care.', 404);
  }

  await updateAppointmentStatus(connection, appointment_id, status, { incrementVersion: true });
  return { serverRecordId: appointment_id };
}
