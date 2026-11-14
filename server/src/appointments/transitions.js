// Defines appointment and queue status transitions and applies them with row locks.

export class AppointmentTransitionError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const transitions = {
  scheduled: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['serving', 'completed', 'cancelled'],
  serving: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};
const ticketTransitions = {
  waiting: ['in-consultation', 'done', 'cancelled'],
  'in-consultation': ['done', 'cancelled'],
  done: [],
  cancelled: [],
};
const queueStatusOf = { serving: 'in-consultation', completed: 'done', cancelled: 'cancelled' };
const appointmentStatusOf = { 'in-consultation': 'serving', done: 'completed', cancelled: 'cancelled' };

function validateStatus(rules, next) {
  if (typeof next !== 'string' || !Object.hasOwn(rules, next)) {
    throw new AppointmentTransitionError(`Invalid status: ${next}`, 400, 'INVALID_STATUS');
  }
}

function validateTransition(rules, current, next) {
  validateStatus(rules, next);
  if (current !== next && !rules[current]?.includes(next)) {
    throw new AppointmentTransitionError(`Cannot change status from ${current} to ${next}.`, 409, 'INVALID_TRANSITION');
  }
}

async function lockAppointment(connection, id) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    throw new AppointmentTransitionError('Invalid appointment ID.', 400, 'INVALID_APPOINTMENT_ID');
  }
  const [[appointment]] = await connection.query(
    'SELECT status FROM APPOINTMENTS WHERE appointment_id = ? AND deleted_at IS NULL FOR UPDATE',
    [id],
  );
  if (!appointment) throw new AppointmentTransitionError('Appointment not found.', 404, 'APPOINTMENT_NOT_FOUND');
  return appointment;
}

async function writeAppointmentStatus(connection, id, status, incrementVersion) {
  const version = incrementVersion ? ', version = version + 1' : '';
  await connection.query(`UPDATE APPOINTMENTS SET status = ?${version} WHERE appointment_id = ?`, [status, id]);
}

export async function updateLockedAppointmentStatus(connection, id, current, next, { incrementVersion = false } = {}) {
  validateTransition(transitions, current, next);
  if (current === next) return false;
  await writeAppointmentStatus(connection, id, next, incrementVersion);

  const queueStatus = queueStatusOf[next];
  if (queueStatus) {
    await connection.query(
      `UPDATE QUEUE
       SET status = ?, served_at = IF(? = 'done', CURRENT_TIMESTAMP, served_at)
       WHERE appointment_id = ? AND status IN ('waiting', 'in-consultation')`,
      [queueStatus, queueStatus, id],
    );
  }
  return true;
}

export async function updateAppointmentStatus(connection, id, status, options) {
  validateStatus(transitions, status);
  const appointment = await lockAppointment(connection, id);
  return updateLockedAppointmentStatus(connection, id, appointment.status, status, options);
}

export async function updateQueueTicketStatus(connection, queueId, status) {
  validateStatus(ticketTransitions, status);
  if (!Number.isSafeInteger(queueId) || queueId <= 0) {
    throw new AppointmentTransitionError('Invalid queue ticket ID.', 400, 'INVALID_QUEUE_ID');
  }
  const [[link]] = await connection.query('SELECT appointment_id FROM QUEUE WHERE queue_id = ?', [queueId]);
  if (!link) throw new AppointmentTransitionError('Queue ticket not found.', 404, 'QUEUE_TICKET_NOT_FOUND');

  // Appointment-based workflows acquire the appointment before touching the queue row.
  const appointment = link.appointment_id == null ? null : await lockAppointment(connection, link.appointment_id);
  const [[ticket]] = await connection.query(
    'SELECT appointment_id, status FROM QUEUE WHERE queue_id = ? FOR UPDATE',
    [queueId],
  );
  if (!ticket || ticket.appointment_id !== link.appointment_id) {
    throw new AppointmentTransitionError('Queue ticket changed. Refresh and try again.', 409, 'QUEUE_TICKET_CHANGED');
  }

  validateTransition(ticketTransitions, ticket.status, status);
  if (ticket.status === status) return false;
  const appointmentStatus = appointmentStatusOf[status];
  if (appointment && appointmentStatus) {
    validateTransition(transitions, appointment.status, appointmentStatus);
    if (appointment.status !== appointmentStatus) {
      await writeAppointmentStatus(connection, link.appointment_id, appointmentStatus, false);
    }
  }
  await connection.query(
    `UPDATE QUEUE SET status = ?,
       served_at = IF(? IN ('in-consultation', 'done'), CURRENT_TIMESTAMP, served_at)
     WHERE queue_id = ?`,
    [status, status, queueId],
  );
  return true;
}
