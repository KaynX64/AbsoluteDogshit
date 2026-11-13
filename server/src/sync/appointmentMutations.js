import { updateAppointmentStatus } from '../appointments/transitions.js';

export async function updateAppointment(connection, { payload }) {
  const { appointment_id, status } = payload;
  if (!appointment_id) throw new Error('appointment_id is required');

  await updateAppointmentStatus(connection, appointment_id, status, { incrementVersion: true });
  return { serverRecordId: appointment_id };
}
