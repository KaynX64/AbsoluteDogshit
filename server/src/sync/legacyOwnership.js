// Finds requested appointments assigned to the currently eligible clinician for legacy queue recovery.

import { pool } from '../db/pool.js';

// Return the submitted appointment IDs still assigned to the clinician.
export async function assignedReplayAppointments(userId, appointmentIds) {
  const [rows] = await pool.query(
    `SELECT appointment_id FROM APPOINTMENTS
     WHERE doctor_user_id = ? AND deleted_at IS NULL AND appointment_id IN (?)
       AND EXISTS (
         SELECT 1 FROM USER_ROLES ur JOIN ROLES r ON r.role_id = ur.role_id
         WHERE ur.user_id = APPOINTMENTS.doctor_user_id AND r.code IN ('DOCTOR', 'DENTIST')
       )
     ORDER BY appointment_id`,
    [userId, appointmentIds],
  );
  // Convert the returned appointment ID to a number for the client.
  return rows.map(row => Number(row.appointment_id));
}
