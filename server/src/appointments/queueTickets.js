// Reserve inside the same transaction as the queue insert. The upsert locks
// the counter until commit, including when this is its first ticket of the day.
export async function reserveQueueTicket(connection, counterId) {
  const [[{ queueDate }]] = await connection.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS queueDate");
  await connection.query(
    `INSERT INTO QUEUE_TICKET_COUNTERS (queue_date, counter_id, last_number) VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE last_number = last_number`,
    [queueDate, counterId],
  );
  const [[{ last_number }]] = await connection.query(
    'SELECT last_number FROM QUEUE_TICKET_COUNTERS WHERE queue_date = ? AND counter_id = ? FOR UPDATE',
    [queueDate, counterId],
  );

  let lastNumber = last_number;
  if (lastNumber === 0) {
    // A deployment during clinic hours must continue from the existing tickets.
    const [[lastTicket]] = await connection.query(
      `SELECT queue_number FROM QUEUE WHERE queue_date = ? AND counter_id = ?
       ORDER BY queue_number DESC LIMIT 1 FOR UPDATE`,
      [queueDate, counterId],
    );
    lastNumber = lastTicket?.queue_number ?? 0;
  }
  const queueNumber = lastNumber + 1;
  await connection.query(
    'UPDATE QUEUE_TICKET_COUNTERS SET last_number = ? WHERE queue_date = ? AND counter_id = ?',
    [queueNumber, queueDate, counterId],
  );
  return { queueDate, queueNumber };
}
