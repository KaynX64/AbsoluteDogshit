import { pool } from '../db/pool.js';
import { sendAppointmentEmail } from '../utils/mailer.js';

// Look up the booking's patient after the booking or cancellation commits.
export async function sendBookedPatientEmail(patientUserId, dateTime, type) {
  try {
    const [[patient]] = await pool.query(
      'SELECT email, first_name, last_name FROM USERS WHERE user_id = ?', [patientUserId],
    );
    if (patient) {
      await sendAppointmentEmail({
        toEmail: patient.email,
        patientName: `${patient.first_name} ${patient.last_name}`,
        dateTime,
        type,
      });
    }
  } catch (error) {
    console.error('[Appointment Email Error]:', error.code ?? error.name);
  }
}
