import { AppointmentTransitionError } from './transitions.js';

// Documents may only be issued for a patient who is IN THE QUEUE (triaged:
// checked_in / serving) and assigned to the signing practitioner.
// Bookings ('scheduled') are view-only.
export async function assertAppointmentInQueue(conn, appointmentId, patientId, signerId, { lock = false } = {}) {
  const id = Number(appointmentId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppointmentTransitionError(
      'appointment_id is required. Documents can only be issued from the consultation queue.',
      400,
      'APPOINTMENT_REQUIRED'
    );
  }

  const [rows] = await conn.query(
    `SELECT status
       FROM APPOINTMENTS
      WHERE appointment_id = ?
        AND patient_user_id = ?
        AND doctor_user_id = ?
        AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`,
    [id, patientId, signerId]
  );

  if (rows.length === 0) {
    throw new AppointmentTransitionError(
      'Appointment not found for this patient under your care.',
      404,
      'APPOINTMENT_NOT_FOUND'
    );
  }
  if (!['checked_in', 'serving'].includes(rows[0].status)) {
    const error = new AppointmentTransitionError(
      'Documents can only be issued while the patient is in the consultation queue (triaged and checked in). Bookings are view-only.',
      409,
      'NOT_IN_QUEUE'
    );
    error.appointmentStatus = rows[0].status;
    throw error;
  }
  return rows[0].status;
}
