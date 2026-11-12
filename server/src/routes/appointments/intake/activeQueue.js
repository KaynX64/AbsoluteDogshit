export const intakeCounterId = 1;

// Shared guard: active queue ticket check
export async function findActiveQueueEntry(connection, patientUserId, queueDate) {
  const [rows] = await connection.query(
    `SELECT q.queue_id, q.queue_number, q.status, q.appointment_id,
            CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
            DATE_FORMAT(q.checked_in_at, '%h:%i %p') AS arrival_time
     FROM QUEUE q
     WHERE q.patient_user_id = ?
       AND q.queue_date = ?
       AND q.status IN ('waiting', 'in-consultation')
     ORDER BY q.queue_id DESC
     LIMIT 1 FOR UPDATE`,
    [patientUserId, queueDate]
  );
  return rows.length > 0 ? rows[0] : null;
}
