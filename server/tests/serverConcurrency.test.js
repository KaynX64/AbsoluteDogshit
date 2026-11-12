import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { Server as SocketServer } from 'socket.io';
import { drainServer } from '../src/bootstrap/shutdown.js';

const port = Number(process.env.VALETUDO_MIGRATION_TEST_PORT);
const skip = !port && 'Set VALETUDO_MIGRATION_TEST_PORT to test against disposable MySQL';

async function fixture(t) {
  Object.assign(process.env, {
    DB_PASSWORD: 'fixture-password',
    ENCRYPTION_KEY: 'fixture-encryption-key'.repeat(3),
    ENCRYPTION_SALT: 'fixture-encryption-salt',
    S3_ACCESS_KEY: 'fixture-access',
    S3_SECRET_KEY: 'fixture-secret',
    SMTP_HOST: '',
  });
  const options = { host: '127.0.0.1', port, user: 'root', password: process.env.VALETUDO_MIGRATION_TEST_PASSWORD || '' };
  const database = 'vhl_concurrency_test_' + randomUUID().replaceAll('-', '');
  const admin = await mysql.createConnection({ ...options, multipleStatements: true });
  const databasePool = mysql.createPool({ ...options, database });
  t.after(async () => {
    await databasePool.end();
    try {
      await admin.query('DROP DATABASE IF EXISTS ??', [database]);
    } finally {
      await admin.end();
    }
  });
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  await admin.query(schema.replaceAll('`valetudo_healthlink`', '`' + database + '`'));
  const { pool } = await import('../src/db/pool.js');
  t.mock.method(pool, 'getConnection', databasePool.getConnection.bind(databasePool));
  t.mock.method(pool, 'query', databasePool.query.bind(databasePool));
  return databasePool;
}

async function withoutFirebaseCredentials(t, load) {
  const keyPath = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
  const existsSync = fs.existsSync;
  const hideKey = t.mock.method(fs, 'existsSync', filename => filename !== keyPath && existsSync(filename));
  try {
    return await load();
  } finally {
    hideKey.mock.restore();
  }
}

test('shutdown waits for both HTTP and workers before closing shared dependencies', async () => {
  const workers = Promise.withResolvers();
  const http = Promise.withResolvers();
  let dependenciesClosed = false;
  const stopping = drainServer({
    io: { close: async callback => { await http.promise; callback(); } },
    stopWorkers: () => workers.promise,
    closeDependencies() { dependenciesClosed = true; },
  });
  http.resolve();
  await setImmediate();
  assert.equal(dependenciesClosed, false);
  workers.resolve();
  await stopping;
  assert.equal(dependenciesClosed, true);
});

test('startup waits for dependency checks and closes the Socket.IO HTTP listener', { skip }, async t => {
  await fixture(t);
  const { startServer } = await withoutFirebaseCredentials(t, () => import('../src/bootstrap/startup.js'));
  const { redis } = await import('../src/utils/redisClient.js');
  const { s3 } = await import('../src/utils/s3Vault.js');
  const redisCheck = Promise.withResolvers();
  const objectCheck = Promise.withResolvers();
  const started = Promise.withResolvers();
  t.mock.method(redis, 'connect', () => redisCheck.promise);
  t.mock.method(s3, 'send', () => {
    started.resolve();
    return objectCheck.promise;
  });
  const previousPort = process.env.PORT;
  process.env.PORT = '0';
  t.after(() => {
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
  });

  const server = createServer();
  const io = new SocketServer(server);
  const startup = startServer(server, { io, isHttps: false, signal: new AbortController().signal });
  await Promise.race([started.promise, startup]);
  assert.equal(server.listening, false);
  redisCheck.resolve();
  await setImmediate();
  assert.equal(server.listening, false);
  objectCheck.resolve();
  const stopWorkers = await startup;
  assert.equal(server.listening, true);
  await drainServer({ io, stopWorkers, closeDependencies() { assert.equal(server.listening, false); } });
});

test('prescription expiry skips a row being cancelled and audits only its committed transition', { skip }, async t => {
  const db = await fixture(t);
  const { expireDuePrescriptions } = await import('../src/services/prescriptions/expirePrescriptions.js');
  await db.query("INSERT INTO EMR_RECORDS (emr_id, patient_user_id, doctor_user_id, chief_complaint, diagnosis) VALUES (1, 1, 2, 'fixture', 'fixture')");
  await db.query(`INSERT INTO PRESCRIPTIONS
    (prescription_id, emr_id, patient_user_id, doctor_user_id, issued_at, expires_at, qr_token)
    VALUES (1, 1, 1, 2, NOW() - INTERVAL 3 DAY, CURDATE(), 'fixture-1'),
           (2, 1, 1, 2, NOW() - INTERVAL 3 DAY, CURDATE(), 'fixture-2')`);
  await db.query(`INSERT INTO PRESCRIPTION_ITEMS (prescription_id, dosage, frequency, duration_days)
    VALUES (1, 'fixture', 'fixture', 1), (2, 'fixture', 'fixture', 1)`);
  const cancelling = await db.getConnection();
  try {
    await cancelling.beginTransaction();
    await cancelling.query("UPDATE PRESCRIPTIONS SET status = 'cancelled' WHERE prescription_id = 1");
    assert.deepEqual(await expireDuePrescriptions(), [2]);
    await cancelling.commit();
  } finally {
    await cancelling.rollback();
    cancelling.release();
  }
  assert.deepEqual(await expireDuePrescriptions(), []);
  const [rows] = await db.query('SELECT status FROM PRESCRIPTIONS ORDER BY prescription_id');
  assert.deepEqual(rows.map(row => row.status), ['cancelled', 'expired']);
  const [audits] = await db.query('SELECT new_value FROM AUDIT_LOGS');
  assert.equal(audits.length, 1);
  const details = typeof audits[0].new_value === 'string' ? JSON.parse(audits[0].new_value) : audits[0].new_value;
  assert.deepEqual(details.prescription_ids, [2]);
});

test('concurrent reminder workers accept an appointment email once', { skip }, async t => {
  const db = await fixture(t);
  const { sendDueAppointmentReminders } = await withoutFirebaseCredentials(t, () => import('../src/workers/appointmentReminderWorker.js'));
  await db.query(`INSERT INTO APPOINTMENTS (appointment_id, patient_user_id, doctor_user_id, date_time, appointment_type)
    VALUES (1, 1, 2, NOW() + INTERVAL 1 HOUR, 'Medical'), (2, 1, 2, NOW() + INTERVAL 1 HOUR, 'Medical')`);
  await db.query('UPDATE APPOINTMENTS SET deleted_at = NOW() WHERE appointment_id = 2');
  const log = t.mock.method(console, 'log', () => {});
  const io = { emit: t.mock.fn() };
  await Promise.all([sendDueAppointmentReminders(io), sendDueAppointmentReminders(io)]);
  await sendDueAppointmentReminders(io);
  assert.equal(log.mock.calls.filter(call => call.arguments[0] === '[Email Dispatch Simulation] reminder').length, 1);
  assert.deepEqual(io.emit.mock.calls.map(call => call.arguments[0]), ['appointment:reminder:1']);
  const [rows] = await db.query('SELECT reminder_sent FROM APPOINTMENTS ORDER BY appointment_id');
  assert.deepEqual(rows.map(row => row.reminder_sent), [1, 0]);
});

test('replay commits a mixed batch and concurrent duplicates reuse the recorded outcome', { skip }, async t => {
  const db = await fixture(t);
  const { replayMutations } = await import('../src/sync/replayService.js');
  await db.query(`INSERT INTO APPOINTMENTS (appointment_id, patient_user_id, doctor_user_id, date_time, appointment_type, status)
    VALUES (1, 1, 2, NOW(), 'Medical', 'scheduled'), (2, 1, 2, NOW(), 'Medical', 'completed')`);
  const context = { user: { user_id: 2, roles: ['DOCTOR'] }, deviceId: 'fixture' };
  const appointment = { client_mutation_id: 'fixture-appointment', table_name: 'APPOINTMENTS', action: 'UPDATE', payload: { appointment_id: 1, status: 'cancelled' } };
  const conflict = {
    client_mutation_id: 'fixture-conflict', table_name: 'EMR_RECORDS', action: 'CREATE',
    payload: { appointment_id: 2, patient_user_id: 1, chief_complaint: 'Fixture complaint', diagnosis: 'Fixture diagnosis' },
  };
  const invalid = { client_mutation_id: 'fixture-error', table_name: 'EMR_RECORDS', action: 'UPDATE', payload: {} };
  const [mixed, duplicate] = await Promise.all([
    replayMutations([appointment, conflict, invalid, null], context),
    replayMutations([appointment], context),
  ]);
  assert.deepEqual([mixed[0].status, duplicate[0].status].sort(), ['already_synced', 'synced']);
  assert.deepEqual(mixed.slice(1).map(row => row.status), ['conflict', 'error', 'error']);
  assert.deepEqual(await replayMutations([conflict, invalid], context), mixed.slice(1, 3));
  const [[row]] = await db.query('SELECT status, version FROM APPOINTMENTS WHERE appointment_id = 1');
  assert.deepEqual(row, { status: 'cancelled', version: 2 });
});
