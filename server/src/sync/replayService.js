import { pool } from '../db/pool.js';
import { logAudit } from '../utils/auditLogger.js';
import { updateAppointment } from './appointmentMutations.js';
import { COMPLETED_APPOINTMENT_CONFLICT } from './conflicts.js';
import { createEncounter, updateEncounter } from './encounterMutations.js';

const handlers = new Map([
  ['EMR_RECORDS:CREATE', createEncounter],
  ['EMR_RECORDS:UPDATE', updateEncounter],
  ['APPOINTMENTS:UPDATE', updateAppointment],
]);

const retryable = error => error.code === 'ER_LOCK_DEADLOCK' || error.code === 'ER_LOCK_WAIT_TIMEOUT';

async function findReplay(connection, clientMutationId, lock = false) {
  const [rows] = await connection.query(
    `SELECT sync_id, sync_status, record_id, user_id, error_message
     FROM LOCAL_SYNC_LOGS WHERE client_mutation_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [clientMutationId],
  );
  return rows[0];
}

function previousResult(clientMutationId, userId, row) {
  const result = { client_mutation_id: clientMutationId };
  if (String(row.user_id) !== String(userId)) {
    return { ...result, status: 'error', error: 'Mutation ID is already in use.' };
  }
  if (row.sync_status === 'synced') {
    return { ...result, status: 'already_synced', sync_id: row.sync_id, serverRecordId: row.record_id };
  }
  if (row.sync_status === 'conflict') {
    return { ...result, status: 'conflict', error: COMPLETED_APPOINTMENT_CONFLICT };
  }
  if (row.sync_status === 'pending') return { ...result, status: 'pending' };
  return { ...result, status: 'error', error: row.error_message || 'Synchronization failed.' };
}

async function replayOne(connection, mutation, { user, deviceId, ipAddress }) {
  const { client_mutation_id, table_name, record_uuid, action, payload, local_version = 1 } = mutation ?? {};
  const result = { client_mutation_id };
  if (typeof client_mutation_id !== 'string' || !client_mutation_id || client_mutation_id.length > 36 ||
      typeof table_name !== 'string' || !table_name || table_name.length > 50 ||
      !['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
    return { ...result, status: 'error', error: 'Incomplete mutation data' };
  }

  const userId = user.user_id;
  const logFields = [
    client_mutation_id, userId, deviceId || 'CLINIC-DESKTOP', table_name,
    record_uuid || client_mutation_id, action, JSON.stringify({ ...payload, dental_chart: undefined }), local_version,
  ];
  await connection.beginTransaction();
  try {
    const existing = await findReplay(connection, client_mutation_id, true);
    if (existing) {
      await connection.commit();
      return previousResult(client_mutation_id, userId, existing);
    }

    const handler = handlers.get(`${table_name}:${action}`);
    if (!handler) throw new Error(`Unsupported offline mutation: ${action} on ${table_name}`);
    const { serverRecordId, conflict, validationError } = await handler(connection, { payload, local_version }, user);
    if (validationError) {
      await connection.rollback();
      return { ...result, status: 'error', error: validationError };
    }
    if (conflict) {
      await connection.query(
        `INSERT INTO LOCAL_SYNC_LOGS
         (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, sync_status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'conflict', ?)`,
        [...logFields, conflict],
      );
      await connection.commit();
      return { ...result, status: 'conflict', error: conflict };
    }

    const [syncResult] = await connection.query(
      `INSERT INTO LOCAL_SYNC_LOGS
       (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, record_id, sync_status, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', CURRENT_TIMESTAMP)`,
      [...logFields, serverRecordId],
    );
    await logAudit(connection, {
      userId,
      action,
      table: 'LOCAL_SYNC_LOGS',
      recordId: syncResult.insertId,
      oldValue: null,
      newValue: { client_mutation_id, table_name, action, serverRecordId, replay: true },
      ipAddress,
    });
    await connection.commit();
    return { ...result, status: 'synced', serverRecordId };
  } catch (error) {
    await connection.rollback();
    if (retryable(error)) throw error;
    if (error.code === 'ER_DUP_ENTRY') {
      const existing = await findReplay(connection, client_mutation_id);
      if (existing) return previousResult(client_mutation_id, userId, existing);
    }

    // Another request can finish the same mutation after the rollback.
    try {
      await connection.query(
        `INSERT INTO LOCAL_SYNC_LOGS
         (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, sync_status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'error', ?)`,
        [...logFields, error.message],
      );
    } catch (logError) {
      if (logError.code !== 'ER_DUP_ENTRY') throw logError;
      const existing = await findReplay(connection, client_mutation_id);
      if (existing) return previousResult(client_mutation_id, userId, existing);
      throw logError;
    }
    return { ...result, status: 'error', error: error.message };
  }
}

export async function replayMutations(mutations, context) {
  const connection = await pool.getConnection();
  try {
    const results = [];
    for (const mutation of mutations) {
      try {
        results.push(await replayOne(connection, mutation, context));
      } catch (error) {
        if (!retryable(error)) throw error;
        results.push(await replayOne(connection, mutation, context));
      }
    }
    return results;
  } finally {
    connection.release();
  }
}
