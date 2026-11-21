// Exercises server lifecycle and concurrent transactions with disposable MySQL.

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setImmediate, setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import { Server as SocketServer } from 'socket.io';
import { drainServer } from '../src/bootstrap/shutdown.js';

const port = Number(process.env.VALETUDO_MIGRATION_TEST_PORT);
const skip = !port && 'Set VALETUDO_MIGRATION_TEST_PORT to test against disposable MySQL';

// Configure the server fixtures and provision an isolated MySQL schema.
async function fixture(t, connectionLimit = 10) {
  Object.assign(process.env, {
    DB_PASSWORD: 'fixture-password',
    JWT_SECRET: 'fixture-jwt-secret'.repeat(3),
    ENCRYPTION_KEY: 'fixture-encryption-key'.repeat(3),
    ENCRYPTION_SALT: 'fixture-encryption-salt',
    S3_ACCESS_KEY: 'fixture-access',
    S3_SECRET_KEY: 'fixture-secret',
    SMTP_HOST: '',
  });
  const options = { host: '127.0.0.1', port, user: 'root', password: process.env.VALETUDO_MIGRATION_TEST_PASSWORD || '' };
  const database = 'vhl_concurrency_test_' + randomUUID().replaceAll('-', '');
  const admin = await mysql.createConnection({ ...options, multipleStatements: true });
  const databasePool = mysql.createPool({ ...options, database, connectionLimit });
  // Close the fixture pool and remove the disposable schema after the test.
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

// Temporarily simulate an installation without local Firebase credentials.
async function withoutFirebaseCredentials(t, load) {
  const keyPath = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
  const existsSync = fs.existsSync;
  // Hide the Firebase service-account file from the selected fixture import.
  const hideKey = t.mock.method(fs, 'existsSync', filename => filename !== keyPath && existsSync(filename));
  try {
    return await load();
  } finally {
    hideKey.mock.restore();
  }
}

// Mount the real API on a fixture listener with mocked realtime delivery.
async function mountedApi(t) {
  // Load the API while Firebase credentials are hidden.
  const { createApp, mountApiRoutes } = await withoutFirebaseCredentials(t, () => import('../src/app.js'));
  const app = createApp();
  const emit = t.mock.fn();
  mountApiRoutes(app, { emit, /* Return the same emission mock for a targeted realtime room. */ to: () => ({ emit }) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  // Register cleanup for the fixture HTTP listener.
  t.after(() => new Promise(/* Wait for the fixture HTTP listener to finish closing. */ resolve => server.close(resolve)));

  // Send an authenticated request to the mounted fixture API.
  const request = (path, { userId = 2, roles = ['DOCTOR'], method = 'GET', json, token } = {}) => {
    token ??= jwt.sign({ user_id: userId, roles }, process.env.JWT_SECRET, { expiresIn: '5m' });
    return fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
      method,
      signal: AbortSignal.timeout(7_000),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  };
  return { request, emit };
}

// Seed checked-in appointments for concurrent queue and encounter scenarios.
async function insertCheckedInAppointments(db) {
  await db.query(`INSERT INTO APPOINTMENTS (appointment_id, patient_user_id, doctor_user_id, date_time, appointment_type, status)
    VALUES (1, 5, 2, NOW(), 'Medical', 'checked_in'), (2, 7, 2, NOW(), 'Medical', 'checked_in')`);
  await db.query(`INSERT INTO QUEUE (queue_id, patient_user_id, appointment_id, queue_date, queue_number)
    VALUES (1, 5, 1, CURDATE(), 1), (2, 7, 2, CURDATE(), 2)`);
}

test('concurrent SOS retries share one audited alert and one dispatch lease', { skip }, async t => {
  const db = await fixture(t);
  const { request } = await mountedApi(t);
  const { dispatchPendingSos } = await import('../src/emergency/sosDispatch.js');
  const payload = { client_sos_id: '9'.repeat(32), latitude: 16.0298, longitude: 120.2285 };
  const submit = (json, userId = 5) => request('/emergency/sos/requests', { userId, roles: ['STUDENT'], method: 'POST', json });
  const responses = await Promise.all([submit(payload), submit(payload)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  const receipts = await Promise.all(responses.map(response => response.json()));
  assert.equal(receipts[0].alertId, receipts[1].alertId);
  assert.equal((await submit({ ...payload, latitude: 16.03 })).status, 409);
  const [[audit]] = await db.query("SELECT COUNT(*) AS n FROM AUDIT_LOGS WHERE table_affected = 'EMERGENCY_ALERTS'");
  assert.equal(Number(audit.n), 1);

  const packets = [];
  const io = { to: room => ({ emit: (event, data) => packets.push({ room, event, data }) }) };
  await Promise.all([dispatchPendingSos(io), dispatchPendingSos(io)]);
  assert.ok(packets.length > 0);
  assert.equal(new Set(packets.map(packet => packet.room)).size, packets.length);
  assert.ok(packets.every(packet => packet.event === 'emergency:new_alert' && packet.data.alertId === receipts[0].alertId));
  const [[alert]] = await db.query('SELECT dispatch_after FROM EMERGENCY_ALERTS WHERE alert_id = ?', [receipts[0].alertId]);
  assert.equal(alert.dispatch_after, null);

  const otherAccount = await submit(payload, 7);
  assert.equal(otherAccount.status, 201);
  assert.notEqual((await otherAccount.json()).alertId, receipts[0].alertId);
});

// Verify that shutdown waits for both HTTP and workers before closing shared dependencies.
test('shutdown waits for both HTTP and workers before closing shared dependencies', async () => {
  const workers = Promise.withResolvers();
  const http = Promise.withResolvers();
  let dependenciesClosed = false;
  const stopping = drainServer({
    io: { /* Delay listener closure until the test releases the HTTP promise. */ close: async callback => { await http.promise; callback(); } },
    // Hold worker shutdown pending until the test releases the worker promise.
    stopWorkers: () => workers.promise,
    // Mark shared dependencies as closed so the test can verify drain order.
    closeDependencies() { dependenciesClosed = true; },
  });
  http.resolve();
  await setImmediate();
  assert.equal(dependenciesClosed, false);
  workers.resolve();
  await stopping;
  assert.equal(dependenciesClosed, true);
});

// Verify that startup waits for dependency checks and closes the Socket.IO HTTP listener.
test('startup waits for dependency checks and closes the Socket.IO HTTP listener', { skip }, async t => {
  await fixture(t);
  // Load the startup module with Firebase disabled for this fixture.
  const { startServer } = await withoutFirebaseCredentials(t, () => import('../src/bootstrap/startup.js'));
  const { redis } = await import('../src/utils/redisClient.js');
  const { s3 } = await import('../src/utils/s3Vault.js');
  const redisCheck = Promise.withResolvers();
  const objectCheck = Promise.withResolvers();
  const started = Promise.withResolvers();
  // Hold the Redis startup check pending under the test's control.
  t.mock.method(redis, 'connect', () => redisCheck.promise);
  // Signal that the storage check started and hold it pending under the test's control.
  t.mock.method(s3, 'send', () => {
    started.resolve();
    return objectCheck.promise;
  });
  const previousPort = process.env.PORT;
  process.env.PORT = '0';
  // Restore the previous port setting after the startup test.
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
  // Assert that the listener closed before dependency cleanup.
  await drainServer({ io, stopWorkers, closeDependencies() { assert.equal(server.listening, false); } });
});

// Verify that prescription expiry skips a row being cancelled and audits only its committed transition.
test('prescription expiry skips a row being cancelled and audits only its committed transition', { skip }, async t => {
  const db = await fixture(t);
  const { expireDuePrescriptions } = await import('../src/documents/prescriptions/expirePrescriptions.js');
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
  assert.deepEqual(rows.map(/* Extract prescription statuses after the competing expiry and cancellation operations. */ row => row.status), ['cancelled', 'expired']);
  const [audits] = await db.query('SELECT new_value FROM AUDIT_LOGS');
  assert.equal(audits.length, 1);
  const details = typeof audits[0].new_value === 'string' ? JSON.parse(audits[0].new_value) : audits[0].new_value;
  assert.deepEqual(details.prescription_ids, [2]);
});

test('v2 expiry follows Manila midnight even when the database calendar differs', { skip }, async t => {
  const db = await fixture(t);
  const { expireDuePrescriptions } = await import('../src/documents/prescriptions/expirePrescriptions.js');
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T15:59:59.999Z') });
  await db.query("INSERT INTO EMR_RECORDS (emr_id, patient_user_id, doctor_user_id, chief_complaint, diagnosis) VALUES (1, 5, 2, 'fixture', 'fixture')");
  await db.query(`INSERT INTO PRESCRIPTIONS
    (prescription_id, emr_id, patient_user_id, doctor_user_id, expires_at, qr_token, contract_version)
    VALUES (1, 1, 5, 2, '2026-11-16', 'fixture-validity-today', 2),
           (2, 1, 5, 2, '2026-11-15', 'fixture-validity-yesterday', 2)`);
  assert.deepEqual(await expireDuePrescriptions(), [2]);
  t.mock.timers.setTime(new Date('2026-11-16T16:00:00Z').getTime());
  assert.deepEqual(await expireDuePrescriptions(), [1]);
  assert.deepEqual(await expireDuePrescriptions(), []);
  assert.deepEqual((await db.query('SELECT status FROM PRESCRIPTIONS ORDER BY prescription_id'))[0].map(row => row.status), ['expired', 'expired']);
});

// Verify that concurrent reminder workers accept an appointment email once.
test('concurrent reminder workers accept an appointment email once', { skip }, async t => {
  const db = await fixture(t);
  // Load the reminder worker without credentials for external push delivery.
  const { sendDueAppointmentReminders } = await withoutFirebaseCredentials(t, () => import('../src/workers/appointmentReminderWorker.js'));
  await db.query(`INSERT INTO APPOINTMENTS (appointment_id, patient_user_id, doctor_user_id, date_time, appointment_type)
    VALUES (1, 1, 2, NOW() + INTERVAL 1 HOUR, 'Medical'), (2, 1, 2, NOW() + INTERVAL 1 HOUR, 'Medical')`);
  await db.query('UPDATE APPOINTMENTS SET deleted_at = NOW() WHERE appointment_id = 2');
  // Stub the console while capturing simulated reminder deliveries.
  const log = t.mock.method(console, 'log', () => {});
  const io = { emit: t.mock.fn() };
  await Promise.all([sendDueAppointmentReminders(io), sendDueAppointmentReminders(io)]);
  await sendDueAppointmentReminders(io);
  assert.equal(log.mock.calls.filter(/* Select the simulated email deliveries for the concurrency assertion. */ call => call.arguments[0] === '[Email Dispatch Simulation] reminder').length, 1);
  assert.deepEqual(io.emit.mock.calls.map(/* Extract realtime event names emitted when reminders are delivered. */ call => call.arguments[0]), ['appointment:reminder:1']);
  const [rows] = await db.query('SELECT reminder_sent FROM APPOINTMENTS ORDER BY appointment_id');
  assert.deepEqual(rows.map(/* Extract the persisted reminder flags to confirm delivery was recorded. */ row => row.reminder_sent), [1, 0]);
});

// Verify that reminder runs cap each batch and drain the remaining appointments on the next run.
test('reminder runs cap each batch and drain the remaining appointments on the next run', { skip }, async t => {
  const db = await fixture(t);
  // Load the reminder worker without external push credentials for the batch test.
  const { sendDueAppointmentReminders } = await withoutFirebaseCredentials(t, () => import('../src/workers/appointmentReminderWorker.js'));
  // Stub the console to capture email dispatch counts across batches.
  const log = t.mock.method(console, 'log', () => {});
  await db.query(`INSERT INTO APPOINTMENTS (patient_user_id, doctor_user_id, date_time, appointment_type)
    VALUES ` + Array(51).fill("(1, 2, NOW() + INTERVAL 1 HOUR, 'Medical')").join(','));
  const first = await sendDueAppointmentReminders();
  assert.deepEqual(first.metrics, { attempted: 50, delivered: 50 });
  const second = await sendDueAppointmentReminders();
  assert.deepEqual(second.metrics, { attempted: 1, delivered: 1 });
  assert.equal(log.mock.calls.filter(/* Count simulated reminder email calls across the two passes. */ call => call.arguments[0] === '[Email Dispatch Simulation] reminder').length, 51);
});

// Verify that replay commits a mixed batch and concurrent duplicates reuse the recorded outcome.
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
  assert.deepEqual(mixed.slice(1).map(/* Extract the results of the repeated and failing replay mutations. */ row => row.status), ['conflict', 'error', 'error']);
  assert.deepEqual(await replayMutations([conflict, invalid], context), mixed.slice(1, 3));
  const [[row]] = await db.query('SELECT status, version FROM APPOINTMENTS WHERE appointment_id = 1');
  assert.deepEqual(row, { status: 'cancelled', version: 2 });
  const [saved] = await db.query('SELECT sync_status FROM LOCAL_SYNC_LOGS ORDER BY sync_id');
  assert.deepEqual(saved.map(/* Inspect the persisted replay statuses for deduplication and failure handling. */ entry => entry.sync_status).sort(), ['conflict', 'error', 'synced']);
  const { request } = await mountedApi(t);
  const owned = await request('/sync/legacy-ownership', { method: 'POST', json: { appointmentIds: [1, 2, 3] } });
  assert.deepEqual(await owned.json(), { appointmentIds: [1, 2] });
  const other = await request('/sync/legacy-ownership', { userId: 7, roles: ['DENTIST'], method: 'POST', json: { appointmentIds: [1, 2] } });
  assert.deepEqual(await other.json(), { appointmentIds: [] });
  const denied = await replayMutations([{
    ...appointment, client_mutation_id: 'different-account', payload: { appointment_id: 2, status: 'completed' },
  }], { user: { user_id: 7, roles: ['DENTIST'] }, deviceId: 'fixture' });
  assert.equal(denied[0].status, 'error');
});

// Verify that both status endpoints release a single-connection pool before concurrent queue notifications.
test('both status endpoints release a single-connection pool before concurrent queue notifications', { skip }, async t => {
  const db = await fixture(t, 1);
  await insertCheckedInAppointments(db);
  const { request, emit } = await mountedApi(t);
  const results = await Promise.all([
    request('/appointments/1/status', { method: 'PATCH', json: { status: 'serving' } }),
    request('/appointments/queue/2/status', { userId: 3, roles: ['NURSE'], method: 'PATCH', json: { status: 'in-consultation' } }),
  ]);
  for (const response of results) assert.equal(response.status, 200, await response.text());
  const [appointments] = await db.query('SELECT status FROM APPOINTMENTS ORDER BY appointment_id');
  const [tickets] = await db.query('SELECT status FROM QUEUE ORDER BY queue_id');
  assert.deepEqual(appointments.map(/* Extract appointment statuses after the concurrent queue transitions. */ row => row.status), ['serving', 'serving']);
  assert.deepEqual(tickets.map(/* Extract ticket statuses after the concurrent queue transitions. */ row => row.status), ['in-consultation', 'in-consultation']);
  assert.equal(emit.mock.calls.filter(/* Select the emitted appointment status events. */ call => call.arguments[0] === 'appointment:status_changed').length, 2);
  const invalid = await request('/appointments/1/status', { method: 'PATCH', json: { status: 'scheduled' } });
  assert.equal(invalid.status, 409);
  assert.equal((await invalid.json()).code, 'INVALID_TRANSITION');
});

// Verify that online completion and offline replay racing for the same appointment write one encounter.
test('online completion and offline replay racing for the same appointment write one encounter', { skip }, async t => {
  const db = await fixture(t);
  await insertCheckedInAppointments(db);
  const { request } = await mountedApi(t);
  const payload = { appointment_id: 1, patient_user_id: 5, chief_complaint: 'Fixture complaint', diagnosis: 'Fixture diagnosis' };
  const [online, replay] = await Promise.all([
    request('/appointments/1/complete', { method: 'POST', json: payload }),
    request('/sync/replay', { method: 'POST', json: { mutations: [
      { client_mutation_id: 'completion-race', table_name: 'EMR_RECORDS', action: 'CREATE', payload },
    ] } }),
  ]);
  const replayResult = (await replay.json()).results[0];
  assert.ok((online.status === 200 && replayResult.status === 'conflict') ||
    (online.status === 409 && replayResult.status === 'synced'));
  await online.json();
  const [[row]] = await db.query(`SELECT a.status, q.status AS ticket_status,
    (SELECT COUNT(*) FROM EMR_RECORDS WHERE appointment_id = a.appointment_id) AS records
    FROM APPOINTMENTS a JOIN QUEUE q USING (appointment_id) WHERE a.appointment_id = 1`);
  assert.deepEqual(row, { status: 'completed', ticket_status: 'done', records: 1 });

  const measurementsSaved = await request('/appointments/2/complete', { method: 'POST', roles: ['ADMIN'], json: {
    ...payload, patient_user_id: 7, vitals: { height: 170, weight: 65 },
  } });
  assert.equal(measurementsSaved.status, 200, await measurementsSaved.text());
  const [[measurements]] = await db.query('SELECT height, weight FROM HEALTH_PROFILES WHERE user_id = 7');
  assert.equal(Number(measurements.height), 170);
  assert.equal(Number(measurements.weight), 65);

  await db.query("INSERT INTO APPOINTMENTS (appointment_id, patient_user_id, doctor_user_id, date_time, appointment_type, status) VALUES (3, 8, 2, NOW(), 'Medical', 'checked_in')");
  await db.query('INSERT INTO QUEUE (patient_user_id, appointment_id, queue_date, queue_number) VALUES (8, 3, CURDATE(), 3)');
  await db.query(`CREATE TRIGGER reject_fixture_audit BEFORE INSERT ON AUDIT_LOGS
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fixture audit failure'`);
  const failed = await request('/appointments/3/complete', { method: 'POST', json: { ...payload, patient_user_id: 8 } });
  assert.equal(failed.status, 500, await failed.text());
  const [[rolledBack]] = await db.query(`SELECT a.status, q.status AS ticket_status,
    (SELECT COUNT(*) FROM EMR_RECORDS WHERE appointment_id = a.appointment_id) AS records
    FROM APPOINTMENTS a JOIN QUEUE q USING (appointment_id) WHERE a.appointment_id = 3`);
  assert.deepEqual(rolledBack, { status: 'checked_in', ticket_status: 'waiting', records: 0 });
});

// Verify that campus account creation saves optional health details and rolls back invalid profiles.
test('campus account creation saves optional health details and rolls back invalid profiles', { skip }, async t => {
  const db = await fixture(t);
  const { request } = await mountedApi(t);
  // Submit an account creation request as the fixture administrator.
  const create = (role, fields, health_profile) => request('/admin/users', {
    roles: ['ADMIN'], userId: 1, method: 'POST', json: {
      first_name: 'Campus', last_name: 'Fixture', password: 'Z7!aQ3#rT9%w',
      role_code: role, email: role.toLowerCase() + '@creation.example.test', ...fields, health_profile,
    },
  });
  const profile = {
    sex: 'FEMALE', date_of_birth: '2004-02-29',
    emergency_contact_name: 'Fixture Contact', emergency_contact_phone: '+639000000000',
  };
  const invalid = await create('STUDENT', { student_no: 'ST-CREATE' }, { ...profile, date_of_birth: '2003-02-29' });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /valid date/);
  const [[remaining]] = await db.query("SELECT COUNT(*) AS total FROM USERS WHERE email = 'student@creation.example.test'");
  assert.equal(remaining.total, 0);

  for (const [role, fields] of [
    ['STUDENT', { student_no: 'ST-CREATE', course: 'Computing', year_level: 2 }],
    ['FACULTY', { faculty_no: 'FAC-CREATE', department: 'Computing', position: 'Instructor' }],
    ['NON_TEACHING', { employee_no: 'NT-CREATE', department: 'Facilities', position: 'Assistant' }],
  ]) {
    const response = await create(role, fields, profile);
    const result = await response.json();
    assert.equal(response.status, 201, result.error);
    const [[stored]] = await db.query(
      "SELECT sex, DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS date_of_birth, emergency_contact_name, emergency_contact_phone FROM HEALTH_PROFILES WHERE user_id = ?",
      [result.userId],
    );
    assert.deepEqual({ ...stored }, profile);
  }
  const emptyResponse = await create('NON_TEACHING', { email: 'empty@creation.example.test' }, { sex: '', date_of_birth: null });
  const empty = await emptyResponse.json();
  assert.equal(emptyResponse.status, 201, empty.error);
  const [[emptyProfile]] = await db.query('SELECT COUNT(*) AS total FROM HEALTH_PROFILES WHERE user_id = ?', [empty.userId]);
  assert.equal(emptyProfile.total, 0);
});

// Verify that Terminal grants can be assigned at account creation and revoked during the same session.
test('Terminal grants can be assigned at account creation and revoked during the same session', { skip }, async t => {
  await fixture(t);
  const { request } = await mountedApi(t);
  const superAdmin = { roles: ['ADMIN'], userId: 1 };
  const response = await request('/admin/users', {
    ...superAdmin, method: 'POST', json: {
      first_name: 'Terminal', last_name: 'Reviewer', email: 'terminal@creation.example.test',
      password: 'Z7!aQ3#rT9%w', role_code: 'ADMIN', admin_permissions: ['TERMINAL_VIEW'],
    },
  });
  const account = await response.json();
  assert.equal(response.status, 201, account.error);
  const reviewer = { token: jwt.sign({ user_id: account.userId, roles: ['ADMIN'] }, process.env.JWT_SECRET, { expiresIn: '5m' }) };
  const path = '/admin/operations';
  assert.equal((await request(path, reviewer)).status, 200);
  assert.equal((await request(path + '/restart', { ...reviewer, method: 'POST' })).status, 403);
  const revoke = await request(`/admin/users/${account.userId}/permissions`, {
    ...superAdmin, method: 'PUT', json: { admin_permissions: ['TELEMETRY_VIEW'] },
  });
  assert.equal(revoke.status, 200);
  assert.equal((await request(path, reviewer)).status, 403);
});

// Verify that both account update routes recognize mixed-role admins and failed profile edits roll back
// grants.
test('both account update routes recognize mixed-role admins and failed profile edits roll back grants', { skip }, async t => {
  const db = await fixture(t);
  const { request } = await mountedApi(t);
  await db.query('INSERT INTO USER_ROLES (user_id, role_id) VALUES (1, 1), (8, 7)');
  await db.query(`INSERT INTO USER_ADMIN_PERMISSIONS (user_id, permission_id)
    SELECT 8, permission_id FROM ADMIN_PERMISSIONS WHERE code = 'USERS_MANAGE'`);
  const limited = { userId: 8, roles: ['ADMIN'] };
  const superAdmin = { userId: 1, roles: ['ADMIN'] };

  const denyRole = await request('/admin/users/1/role', { ...limited, method: 'PATCH', json: { role_code: 'STUDENT' } });
  const denyProfile = await request('/admin/users/1', { ...limited, method: 'PUT', json: {
    first_name: 'Fixture', last_name: 'Admin', email: 'fixture-admin@example.test',
  } });
  assert.equal(denyRole.status, 403);
  assert.equal(denyProfile.status, 403);

  const missingLicense = await request('/admin/users/7/role', { ...superAdmin, method: 'PATCH', json: { role_code: 'DENTIST' } });
  assert.equal(missingLicense.status, 400);
  assert.match((await missingLicense.json()).error, /PRC license/);

  const profile = { first_name: 'Fixture', last_name: 'Dentist', email: 'fixture-dentist@example.test', role_code: 'DENTIST', license_no: 'FIXTURE-PRC' };
  const invalid = await request('/admin/users/8', { ...superAdmin, method: 'PUT', json: { ...profile, health_profile: null } });
  assert.equal(invalid.status, 400, await invalid.text());
  const [[before]] = await db.query(`SELECT first_name,
    (SELECT COUNT(*) FROM USER_ADMIN_PERMISSIONS WHERE user_id = 8) AS grants,
    (SELECT COUNT(*) FROM NON_TEACHING_PROFILES WHERE user_id = 8) AS old_profiles
    FROM USERS WHERE user_id = 8`);
  assert.deepEqual(before, { first_name: 'Ernesto', grants: 1, old_profiles: 1 });

  const saved = await request('/admin/users/8', { ...superAdmin, method: 'PUT', json: profile });
  assert.equal(saved.status, 200, await saved.text());
  const [[after]] = await db.query(`SELECT first_name,
    (SELECT COUNT(*) FROM USER_ADMIN_PERMISSIONS WHERE user_id = 8) AS grants,
    (SELECT COUNT(*) FROM NON_TEACHING_PROFILES WHERE user_id = 8) AS old_profiles
    FROM USERS WHERE user_id = 8`);
  assert.deepEqual(after, { first_name: 'Fixture', grants: 0, old_profiles: 0 });
});

// Verify that queue reads pick the latest live prescription and keep the clinic-day boundaries.
test('queue reads pick the latest live prescription and keep the clinic-day boundaries', { skip }, async t => {
  const db = await fixture(t);
  await db.query(`INSERT INTO APPOINTMENTS (appointment_id, patient_user_id, doctor_user_id, date_time, appointment_type, status)
    VALUES (1, 5, 2, CURDATE(), 'Medical', 'completed'),
           (2, 5, 2, CURDATE() - INTERVAL 1 DAY, 'Medical', 'scheduled'),
           (3, 5, 2, CURDATE() + INTERVAL 1 DAY, 'Medical', 'scheduled'),
           (4, 5, 2, CURDATE(), 'Medical', 'no_show'),
           (5, 5, 2, CURDATE() + INTERVAL 1 DAY - INTERVAL 1 SECOND, 'Medical', 'no_show'),
           (6, 5, 2, CURDATE() + INTERVAL 1 DAY, 'Medical', 'no_show')`);
  await db.query(`INSERT INTO EMR_RECORDS (emr_id, patient_user_id, doctor_user_id, appointment_id, chief_complaint, diagnosis)
    VALUES (1, 5, 2, 1, 'fixture complaint', 'fixture diagnosis')`);
  await db.query(`INSERT INTO PRESCRIPTIONS
    (prescription_id, emr_id, patient_user_id, doctor_user_id, issued_at, expires_at, qr_token, notes, deleted_at)
    VALUES (1, 1, 5, 2, NOW(), CURDATE(), 'roster-1', 'older', NULL),
           (2, 1, 5, 2, NOW(), CURDATE(), 'roster-2', 'latest', NULL),
           (3, 1, 5, 2, NOW(), CURDATE(), 'roster-3', 'deleted', NOW())`);
  const { request } = await mountedApi(t);
  const roster = await (await request('/appointments/today?filter=history')).json();
  // Select the target appointment to check that joined records do not duplicate it.
  const completed = roster.filter(row => row.appointment_id === 1);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].past_dietary_notes, 'latest');
  const arrivals = await (await request('/appointments/expected-today')).json();
  assert.deepEqual(arrivals.map(/* Extract arrival IDs for the clinic-day boundary check. */ row => row.appointment_id), [2]);
  assert.deepEqual(await (await request('/appointments/no-shows-today')).json(), { count: 2 });

  // Build old no-show fixtures outside the clinic day.
  const older = Array.from({ length: 1000 }, () => [5, 2, '2025-01-01 10:00:00', 'Medical', 'no_show']);
  await db.query('INSERT INTO APPOINTMENTS (patient_user_id, doctor_user_id, date_time, appointment_type, status) VALUES ?', [older]);
  const select = "EXPLAIN SELECT COUNT(*) FROM APPOINTMENTS WHERE status = 'no_show' AND deleted_at IS NULL AND ";
  const [[before]] = await db.query(select.replace('FROM APPOINTMENTS', 'FROM APPOINTMENTS IGNORE INDEX (idx_app_status_datetime)') +
    'DATE(date_time) = CURDATE()');
  const [[after]] = await db.query(select + 'date_time >= CURDATE() AND date_time < CURDATE() + INTERVAL 1 DAY');
  assert.equal(after.key, 'idx_app_status_datetime');
  assert.equal(after.type, 'range');
  t.diagnostic(`No-show query plan: ${before.type} (${before.key ?? 'no index'}) to ${after.type} (${after.key})`);
});

// Verify that paged offline bootstrap drains both streams and defers changes at the watermark.
test('paged offline bootstrap drains both streams and defers changes at the watermark', { skip }, async t => {
  const db = await fixture(t);
  // Build distinct patient fixture rows for bootstrap pagination.
  const extraPatients = Array.from({ length: 503 }, (_, index) => [`fixture-${index}@example.test`, 'fixture', 'Sync', 'Patient']);
  await db.query('INSERT INTO USERS (email, password_hash, first_name, last_name) VALUES ?', [extraPatients]);
  // Build encounter fixture rows for bootstrap pagination and watermark checks.
  const encounters = Array.from({ length: 503 }, () => [5, 2, 'fixture complaint', 'fixture diagnosis']);
  await db.query('INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, chief_complaint, diagnosis) VALUES ?', [encounters]);
  await db.query('UPDATE EMR_RECORDS SET updated_at = NOW() - INTERVAL 1 MINUTE');

  const { request } = await mountedApi(t);
  const first = await (await request('/sync/bootstrap?paging=1')).json();
  assert.equal(first.patients.length, 500);
  assert.equal(first.emrRecords.length, 500);
  assert.ok(first.nextCursor);
  const pagePath = '/sync/bootstrap?paging=1&cursor=' + encodeURIComponent(first.nextCursor);
  const forbidden = await request(pagePath, { userId: 3, roles: ['NURSE'] });
  assert.equal(forbidden.status, 400);
  await forbidden.json();

  const upperTime = Math.floor(Date.parse(first.serverTime) / 1000);
  await db.query('UPDATE EMR_RECORDS SET updated_at = FROM_UNIXTIME(?) WHERE emr_id = 503', [upperTime]);
  const second = await (await request(pagePath)).json();
  assert.equal(second.serverTime, first.serverTime);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(second.emrRecords.map(/* Extract IDs from the second encounter page. */ record => record.emr_id), [501, 502]);
  assert.equal(new Set([...first.patients, ...second.patients].map(/* Combine IDs from both patient pages for completeness and duplicate checks. */ patient => patient.user_id)).size, 511);

  const [[clock]] = await db.query('SELECT UNIX_TIMESTAMP() AS now');
  if (clock.now <= upperTime) await setTimeout(1_050);
  const delta = await (await request('/sync/bootstrap?paging=1&checkpoint=' + encodeURIComponent(first.serverTime))).json();
  assert.deepEqual(delta.emrRecords.map(/* Extract the encounter IDs returned after the previous watermark. */ record => record.emr_id), [503]);
  const legacy = await (await request('/sync/bootstrap')).json();
  assert.equal(legacy.emrRecords.length, 500);
  assert.equal(Object.hasOwn(legacy, 'nextCursor'), false);
});

// Verify that analytics timelines share the database calendar and empty summaries report real values.
test('analytics timelines share the database calendar and empty summaries report real values', { skip }, async t => {
  const db = await fixture(t, 1);
  const [[clock]] = await db.query("SELECT UNIX_TIMESTAMP('2026-11-13 00:00:01') AS epoch");
  await db.query('SET timestamp = ?', [clock.epoch]);
  const { request } = await mountedApi(t);
  const empty = await (await request('/analytics/summary')).json();
  assert.deepEqual(empty.operations.deptBreakdown, []);
  assert.deepEqual(empty.clinical.topDiagnoses, []);
  assert.equal(empty.operations.emergencyMetrics.timedClosures, 0);
  await db.query(`INSERT INTO EMR_RECORDS
    (patient_user_id, doctor_user_id, chief_complaint, diagnosis, encounter_date, deleted_at)
    VALUES (5, 2, '', '', '2026-11-12 23:59:59', NULL),
           (5, 2, '', '', '2026-11-13 00:00:00', NULL),
           (5, 2, '', '', '2026-11-13 00:00:01', NOW()),
           (5, 2, '', '', '2026-11-14 00:00:00', NULL)`);
  await db.query(`INSERT INTO EMERGENCY_ALERTS (user_id, location, created_at, status)
    VALUES (5, ST_GeomFromText('POINT(0 0)', 4326), '2026-11-13 00:00:00', 'triggered')`);
  const result = await request('/analytics/summary');
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.operations.emergencyMetrics.timedClosures, 0);
  assert.equal(data.operations.timeSeries.length, 14);
  assert.deepEqual(data.operations.timeSeries.map(/* Read dates from the encounter timeline for calendar alignment checks. */ day => day.date), data.operations.emergencyTimeSeries.map(/* Read dates from the SOS timeline for calendar alignment checks. */ day => day.date));
  assert.deepEqual(data.operations.timeSeries.slice(-2).map(/* Select encounter count and partial-day fields for the two latest dates. */ ({ date, count, partial }) => [date, count, partial]),
    [['2026-11-12', 1, false], ['2026-11-13', 1, true]]);
  assert.deepEqual(data.operations.emergencyTimeSeries.slice(-2).map(/* Select the two newest SOS counts for comparison. */ day => day.count), [0, 1]);
  await db.query("UPDATE EMERGENCY_ALERTS SET status = 'resolved', response_time_seconds = 0");
  const updated = await (await request('/analytics/summary')).json();
  assert.equal(updated.operations.emergencyMetrics.timedClosures, 1);
  assert.equal(Number(updated.operations.emergencyMetrics.avgResponseSeconds), 0);
});

// Verify that analytics exports and dashboard use the shared department totals.
test('analytics exports and dashboard use the shared department totals', { skip }, async t => {
  const db = await fixture(t);
  await db.query(`INSERT INTO APPOINTMENTS (patient_user_id, doctor_user_id, date_time, appointment_type, status)
    VALUES (5, 2, NOW(), 'Medical', 'completed'), (5, 2, NOW(), 'Medical', 'completed'),
           (5, 2, NOW(), 'Medical', 'cancelled'), (7, 2, NOW(), 'Medical', 'completed')`);
  const { request } = await mountedApi(t);
  const departments = await (await request('/analytics/by-department')).json();
  assert.deepEqual(departments, [
    { department: 'BS Information Technology', consultation_count: 2, consultations_count: 2 },
    { department: 'College of Computing Studies', consultation_count: 1, consultations_count: 1 },
  ]);
  const csv = await request('/analytics/export/csv');
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /"BS Information Technology",2/);

  const excel = await request('/analytics/export/excel');
  assert.equal(excel.status, 200);
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await excel.arrayBuffer());
  assert.deepEqual(workbook.worksheets.map(/* Extract report worksheet names to find the department section. */ sheet => sheet.name), [
    'Clinical Diagnoses', 'Department Volume', 'Respiratory Surveillance', 'Health-risk Groups', 'Formulary Dispensing',
  ]);
  assert.deepEqual(workbook.getWorksheet('Department Volume').getRow(2).values.slice(1), ['BS Information Technology', 2]);

  const pdf = await request('/analytics/export/pdf');
  assert.equal(pdf.status, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
});

// Verify that new scoped analytics grants are effective and revocable without a new session.
test('new scoped analytics grants are effective and revocable without a new session', { skip }, async t => {
  await fixture(t);
  const { request } = await mountedApi(t);
  const superAdmin = { roles: ['ADMIN'], userId: 1 };
  const response = await request('/admin/users', {
    ...superAdmin, method: 'POST', json: {
      first_name: 'Analytics', last_name: 'Reviewer', email: 'fixture-scoped-analytics@example.test',
      password: 'Z7!aQ3#rT9%w', role_code: 'ADMIN', admin_permissions: ['ANALYTICS_VIEW', 'ANALYTICS_CLINICAL'],
    },
  });
  const account = await response.json();
  assert.equal(response.status, 201, account.error);
  const reviewer = { token: jwt.sign({ user_id: account.userId, roles: ['ADMIN'] }, process.env.JWT_SECRET, { expiresIn: '5m' }) };
  const summary = await (await request('/analytics/summary', reviewer)).json();
  assert.deepEqual(summary.scopes, ['ANALYTICS_CLINICAL', 'ANALYTICS_SURVEILLANCE']);
  assert.ok(summary.clinical);
  assert.equal(summary.operations, null);
  assert.equal(summary.pharmacy, null);
  assert.equal(summary.headcount, null);
  assert.equal((await request('/analytics/by-department', reviewer)).status, 403);
  assert.equal((await request('/analytics/export/pdf', reviewer)).status, 403);

  const update = await request(`/admin/users/${account.userId}/permissions`, {
    ...superAdmin, method: 'PUT', json: { admin_permissions: ['ANALYTICS_VIEW', 'ANALYTICS_HEADCOUNT'] },
  });
  assert.equal(update.status, 200, await update.text());
  const revised = await (await request('/analytics/summary', reviewer)).json();
  assert.deepEqual(revised.scopes, ['ANALYTICS_HEADCOUNT']);
  assert.equal(revised.clinical, null);
  assert.ok(revised.headcount);

  const nurse = { roles: ['NURSE'], userId: 3 };
  const nurseSummary = await (await request('/analytics/summary', nurse)).json();
  assert.ok(nurseSummary.operations && nurseSummary.pharmacy);
  assert.equal(nurseSummary.clinical.topDiagnoses, null);
  assert.ok(nurseSummary.clinical.surveillance);
  assert.equal(nurseSummary.headcount, null);
  const csv = await request('/analytics/export/csv', nurse);
  assert.equal(csv.status, 200);
  assert.doesNotMatch(await csv.text(), /DIAGNOSES|HEADCOUNT/);

  const doctorToken = jwt.sign({ user_id: 2, roles: ['DOCTOR'] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const roleUpdate = await request('/admin/users/2/role', { ...superAdmin, method: 'PATCH', json: { role_code: 'NURSE' } });
  assert.equal(roleUpdate.status, 200, await roleUpdate.text());
  const changed = await (await request('/analytics/summary', { token: doctorToken })).json();
  assert.equal(changed.clinical.topDiagnoses, null);
  assert.ok(changed.pharmacy.inventory);
});

// Verify that Super Admins can customize, disable and reset staff analytics for existing sessions.
test('Super Admins can customize, disable and reset staff analytics for existing sessions', { skip }, async t => {
  const db = await fixture(t);
  const { request } = await mountedApi(t);
  const superAdmin = { userId: 1, roles: ['ADMIN'] };
  const nurseToken = jwt.sign({ user_id: 3, roles: ['NURSE'] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const nurse = { token: nurseToken };
  const path = '/admin/users/3/analytics-permissions';
  // Save an analytics override as the fixture Super Admin.
  const write = (scopes, account = superAdmin) => request(path, { ...account, method: 'PUT', json: { scopes } });
  const original = await (await request(path, superAdmin)).json();
  assert.equal(original.override, null);
  assert.ok(original.defaults.includes('ANALYTICS_PHARMACY'));
  assert.ok(!original.defaults.includes('ANALYTICS_CLINICAL'));
  assert.equal((await request(path, nurse)).status, 403);
  await db.query(`INSERT INTO USER_ROLES (user_id, role_id) SELECT 4, role_id FROM ROLES WHERE code = 'ADMIN'`);
  await db.query(`INSERT INTO USER_ADMIN_PERMISSIONS (user_id, permission_id)
    SELECT 4, permission_id FROM ADMIN_PERMISSIONS WHERE code = 'USERS_MANAGE'`);
  assert.equal((await write([], { userId: 4, roles: ['ADMIN'] })).status, 403);
  assert.equal((await write(['SUPER_ADMIN'])).status, 400);
  const save = await write(['ANALYTICS_PHARMACY', 'ANALYTICS_EXPORT', 'ANALYTICS_CLINICAL']);
  assert.equal(save.status, 200, await save.text());
  const custom = await (await request('/analytics/summary', nurse)).json();
  assert.deepEqual(custom.clinical, { topDiagnoses: [], surveillance: null });
  assert.equal(custom.pharmacy.dispensing, null);
  assert.ok(custom.pharmacy.inventory);
  assert.equal(custom.operations, null);
  assert.equal((await request('/analytics/by-department', nurse)).status, 403);
  const csv = await request('/analytics/export/csv', nurse);
  assert.equal(csv.status, 200);
  const content = await csv.text();
  assert.match(content, /REORDER PRIORITIES/);
  assert.match(content, /TOP CLINICAL DIAGNOSES/);
  assert.doesNotMatch(content, /FORMULARY DISPENSING|RESPIRATORY SURVEILLANCE/);
  assert.equal((await write([])).status, 200);
  assert.deepEqual((await (await request(path, superAdmin)).json()).override, []);
  for (const suffix of ['summary', 'report-access', 'export/pdf']) {
    assert.equal((await request('/analytics/' + suffix, nurse)).status, 403);
  }
  assert.equal((await write(null)).status, 200);
  const reset = await (await request('/analytics/summary', nurse)).json();
  assert.deepEqual(reset.scopes, original.defaults);
  assert.ok(reset.clinical.surveillance);
  assert.equal(reset.clinical.topDiagnoses, null);
  const [[audit]] = await db.query("SELECT COUNT(*) AS total FROM AUDIT_LOGS WHERE table_affected = 'STAFF_ANALYTICS_PERMISSIONS'");
  assert.equal(audit.total, 3);
});

// Verify that reorder suggestions put the lowest usable stock ahead of prescription demand.
test('reorder suggestions put the lowest usable stock ahead of prescription demand', { skip }, async t => {
  const db = await fixture(t);
  await db.query(`INSERT INTO MEDICINES (medicine_id, name, generic_name, form, strength, unit, is_active)
    VALUES (1, 'Top demand', 'Fixture 1', 'Tablet', '10 mg', 'pcs', TRUE),
           (2, 'Expired only', 'Fixture 2', 'Tablet', '10 mg', 'pcs', TRUE),
           (3, 'Low stock', 'Fixture 3', 'Tablet', '10 mg', 'pcs', TRUE),
           (4, 'Low stock with demand', 'Fixture 4', 'Tablet', '10 mg', 'pcs', TRUE),
           (5, 'No batches', 'Fixture 5', 'Tablet', '10 mg', 'pcs', TRUE),
           (6, 'Second highest demand', 'Fixture 6', 'Tablet', '10 mg', 'pcs', TRUE),
           (7, 'Inactive', 'Fixture 7', 'Tablet', '10 mg', 'pcs', FALSE)`);
  await db.query(`INSERT INTO MEDICINE_BATCHES (medicine_id, batch_no, manufacture_date, expiry_date, quantity_on_hand, deleted_at)
    VALUES (1, 'a', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 100, NULL),
           (1, 'b', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 20, NULL),
           (2, 'c', CURDATE() - INTERVAL 1 YEAR, CURDATE() - INTERVAL 1 DAY, 200, NULL),
           (3, 'd', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 3, NULL),
           (4, 'e', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 3, NULL),
           (4, 'f', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 50, NOW()),
           (6, 'g', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 20, NULL)`);
  await db.query(`INSERT INTO EMR_RECORDS (emr_id, patient_user_id, doctor_user_id, chief_complaint, diagnosis)
    VALUES (1, 5, 2, 'fixture complaint', 'fixture diagnosis')`);
  await db.query(`INSERT INTO PRESCRIPTIONS
    (prescription_id, emr_id, patient_user_id, doctor_user_id, expires_at, qr_token, status)
    VALUES (1, 1, 5, 2, CURDATE(), 'reorder-active', 'active'),
           (2, 1, 5, 2, CURDATE(), 'reorder-cancelled', 'cancelled')`);
  await db.query(`INSERT INTO PRESCRIPTION_ITEMS (prescription_id, medicine_id, dosage, frequency, duration_days, quantity_prescribed)
    VALUES (1, 1, 'fixture', 'fixture', 1, 200), (1, 6, 'fixture', 'fixture', 1, 40),
           (1, 4, 'fixture', 'fixture', 1, 5), (2, 3, 'fixture', 'fixture', 1, 500)`);

  const { request } = await mountedApi(t);
  const summary = await request('/analytics/summary', { userId: 3, roles: ['NURSE'] });
  assert.equal(summary.status, 200);
  const { pharmacy } = await summary.json();
  assert.deepEqual(pharmacy.inventory.reorderPriorities.map(/* Extract medicine IDs from the ranked inventory recommendations. */ row => row.medicine_id), [2, 5, 4, 3]);
  assert.equal(pharmacy.dispensing.find(/* Find the second medicine fixture in the dispensing activity results. */ row => row.medicine_id === 2).availability, 'OUT_OF_STOCK');
  assert.equal(pharmacy.dispensing.find(/* Find the fifth medicine fixture in the dispensing activity results. */ row => row.medicine_id === 5).availability, 'OUT_OF_STOCK');
  assert.equal(pharmacy.dispensing.find(/* Find the first medicine fixture in the dispensing activity results. */ row => row.medicine_id === 1).availability, 'IN_STOCK');

  const response = await request('/inventory/reorder-suggestions', { userId: 3, roles: ['NURSE'] });
  assert.equal(response.status, 200);
  const suggestions = await response.json();
  assert.deepEqual(suggestions.map(/* Extract medicine IDs in the order returned by the reorder endpoint. */ row => row.medicine_id), [2, 5, 4, 3, 6, 1]);
  assert.deepEqual(suggestions.map(/* Compare numeric usable-stock totals in recommendation order. */ row => Number(row.total_stock_on_hand)), [0, 0, 3, 3, 20, 120]);
  assert.equal(suggestions[0].stock_status, 'OUT_OF_STOCK');
  assert.equal(Number(suggestions[2].suggested_reorder_qty), 27);
});

// Verify that pharmacy analytics separates recent dispensing, returns, intent and reorder priorities.
test('pharmacy analytics separates recent dispensing, returns, intent and reorder priorities', { skip }, async t => {
  const db = await fixture(t);
  const { request } = await mountedApi(t);
  const nurse = { userId: 3, roles: ['NURSE'] };
  await db.query(`INSERT INTO MEDICINES (medicine_id, name, generic_name, form, strength, unit, is_active)
    VALUES (1, 'Uncollected', 'Fixture 1', 'Tablet', '10 mg', 'pcs', TRUE),
           (2, 'Recently dispensed', 'Fixture 2', 'Tablet', '10 mg', 'pcs', TRUE),
           (3, 'Reversed', 'Fixture 3', 'Tablet', '10 mg', 'pcs', TRUE),
           (4, 'Historical demand', 'Fixture 4', 'Tablet', '10 mg', 'pcs', TRUE),
           (5, 'Never prescribed', 'Fixture 5', 'Tablet', '10 mg', 'pcs', TRUE),
           (6, 'Returned this window', 'Fixture 6', 'Tablet', '10 mg', 'pcs', TRUE),
           (7, 'Inactive', 'Fixture 7', 'Tablet', '10 mg', 'pcs', FALSE)`);
  const initial = await request('/analytics/summary', nurse);
  assert.equal(initial.status, 200);
  const initialPharmacy = (await initial.json()).pharmacy;
  assert.equal(initialPharmacy.dispensing.length, 6);
  assert.ok(initialPharmacy.dispensing.every(/* Check that no dispensing fixture has a net movement before ledger activity is added. */ row => Number(row.net_dispensed) === 0));
  assert.equal(initialPharmacy.inventory.reorderPriorities.length, 6);

  await db.query(`INSERT INTO MEDICINE_BATCHES (batch_id, medicine_id, batch_no, manufacture_date, expiry_date, quantity_on_hand)
    VALUES (1, 1, 'a', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 120),
           (2, 2, 'b', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 40),
           (3, 2, 'c', CURDATE() - INTERVAL 1 YEAR, CURDATE() - INTERVAL 1 DAY, 50),
           (4, 3, 'd', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 12),
           (5, 4, 'e', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 100),
           (6, 6, 'f', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 1 MONTH, 25)`);
  await db.query(`INSERT INTO EMR_RECORDS (emr_id, patient_user_id, doctor_user_id, chief_complaint, diagnosis)
    VALUES (1, 5, 2, 'fixture complaint', 'fixture diagnosis')`);
  await db.query(`INSERT INTO PRESCRIPTIONS
    (prescription_id, emr_id, patient_user_id, doctor_user_id, issued_at, expires_at, qr_token, status)
    VALUES (1, 1, 5, 2, NOW(), CURDATE(), 'pharmacy-active', 'active'),
           (2, 1, 5, 2, NOW(), CURDATE(), 'pharmacy-cancelled', 'cancelled'),
           (3, 1, 5, 2, NOW() - INTERVAL 15 DAY, CURDATE(), 'pharmacy-historical', 'expired')`);
  await db.query(`INSERT INTO PRESCRIPTION_ITEMS
    (item_id, prescription_id, medicine_id, dosage, frequency, duration_days, quantity_prescribed, quantity_dispensed)
    VALUES (1, 1, 1, 'fixture', 'fixture', 1, 90, 0),
           (2, 1, 2, 'fixture', 'fixture', 1, 30, 10),
           (3, 2, 3, 'fixture', 'fixture', 1, 8, 8),
           (4, 3, 4, 'fixture', 'fixture', 1, 700, 500),
           (5, 3, 6, 'fixture', 'fixture', 1, 7, 7)`);
  await db.query(`INSERT INTO INVENTORY_LOGS (batch_id, prescription_item_id, quantity_change, transaction_type, performed_by, created_at)
    VALUES (2, 2, -6, 'dispense', 2, NOW()), (3, 2, -4, 'dispense', 2, NOW()),
           (2, NULL, -2, 'dispense', 3, NOW()), (2, 2, 3, 'return', 2, NOW()),
           (2, NULL, -12, 'return', 3, NOW()), (2, NULL, 100, 'receive', 3, NOW()),
           (4, 3, -8, 'dispense', 2, NOW()), (4, 3, 8, 'return', 2, NOW()),
           (5, 4, -500, 'dispense', 2, NOW() - INTERVAL 15 DAY),
           (6, 5, -7, 'dispense', 2, NOW() - INTERVAL 15 DAY), (6, 5, 7, 'return', 2, NOW())`);

  const response = await request('/analytics/summary', nurse);
  assert.equal(response.status, 200);
  const { pharmacy } = await response.json();
  assert.equal(pharmacy.windowDays, 14);
  assert.deepEqual(pharmacy.dispensing.map(/* Normalize the activity quantities before comparing expected prescription and stock movements. */ row => [
    row.medicine_id, Number(row.quantity_prescribed), Number(row.quantity_dispensed),
    Number(row.quantity_returned), Number(row.net_dispensed),
  ]), [
    [2, 30, 12, 3, 9], [3, 0, 8, 8, 0], [6, 0, 0, 7, -7],
    [1, 90, 0, 0, 0], [4, 0, 0, 0, 0], [5, 0, 0, 0, 0],
  ]);
  const nurseResponse = await request('/inventory/reorder-suggestions', { userId: 3, roles: ['NURSE'] });
  assert.equal(nurseResponse.status, 200);
  // Keep items that need replenishment from the nurse reorder response.
  const nursePriorities = (await nurseResponse.json()).filter(row => row.stock_status !== 'ADEQUATE');
  assert.deepEqual(pharmacy.inventory.reorderPriorities.map(/* Extract medicine IDs in the response's recommended order. */ row => row.medicine_id), [5, 3]);
  assert.deepEqual(
    pharmacy.inventory.reorderPriorities.map(/* Select the dashboard recommendation fields shared with the reorder endpoint. */ ({ medicine_id, total_stock_on_hand, suggested_reorder_qty }) =>
      [medicine_id, total_stock_on_hand, suggested_reorder_qty]),
    nursePriorities.map(/* Select matching fields from the nurse's reorder results for comparison. */ ({ medicine_id, total_stock_on_hand, suggested_reorder_qty }) =>
      [medicine_id, total_stock_on_hand, suggested_reorder_qty]),
  );
});

// Verify that a Super Admin can grant and revoke incident archive access while responder and patient access
// still works.
test('a Super Admin can grant and revoke incident archive access while responder and patient access still works', { skip }, async t => {
  const db = await fixture(t);
  await db.query(`INSERT INTO EMERGENCY_ALERTS (alert_id, user_id, location, created_at, resolved_at, status)
    VALUES (1, 5, ST_GeomFromText('POINT(0 0)', 4326), NOW() - INTERVAL 1 MINUTE, NOW(), 'resolved')`);
  await db.query(`INSERT INTO INCIDENT_REPORTS (report_id, alert_id, patient_user_id, documented_by, resolved_at, incident_details, pdf_s3_key)
    VALUES (1, 1, 5, 4, NOW(), 'Fixture archived narrative', 'incident-reports/fixture.pdf')`);
  const { s3 } = await import('../src/utils/s3Vault.js');
  // Return a fixture PDF body in place of an object-storage download.
  t.mock.method(s3, 'send', async () => ({ Body: [Buffer.from('%PDF fixture')] }));
  const { request } = await mountedApi(t);
  const superAdmin = { userId: 1, roles: ['ADMIN'] };
  const catalog = await request('/admin/permissions', superAdmin);
  assert.ok((await catalog.json()).permissions.some(/* Locate the incident archive grant in the permissions catalog. */ permission => permission.code === 'INCIDENT_RECORDS_VIEW'));

  const create = await request('/admin/users', {
    ...superAdmin, method: 'POST', json: {
      first_name: 'Fixture', last_name: 'Reviewer', email: 'fixture-reviewer@example.test',
      password: 'Z7!aQ3#rT9%w', role_code: 'ADMIN', admin_permissions: ['INCIDENT_RECORDS_VIEW'],
    },
  });
  const created = await create.json();
  assert.equal(create.status, 201, created.error);
  const reviewer = { userId: created.userId, roles: ['ADMIN'] };
  const paths = ['/emergency/incident-reports', '/emergency/incident-reports/1/pdf', '/documents/incident-reports/1/pdf'];
  for (const path of paths) {
    const response = await request(path, reviewer);
    assert.equal(response.status, 200, path);
    if (path.endsWith('/pdf')) assert.equal(await response.text(), '%PDF fixture');
    else assert.equal((await response.json())[0].reportId, 1);
  }

  const revoke = await request(`/admin/users/${created.userId}/permissions`, {
    ...superAdmin, method: 'PUT', json: { admin_permissions: ['USERS_MANAGE'] },
  });
  assert.equal(revoke.status, 200, await revoke.text());
  for (const path of paths) {
    const response = await request(path, reviewer);
    assert.equal(response.status, 403, path);
    assert.equal((await response.json()).requiredPermission, 'INCIDENT_RECORDS_VIEW');
  }
  const legacyAdmin = await request('/emergency/incident-reports', superAdmin);
  assert.equal(legacyAdmin.status, 200);
  await legacyAdmin.json();
  const patientPdf = await request('/documents/incident-reports/1/pdf', { userId: 5, roles: ['STUDENT'] });
  assert.equal(patientPdf.status, 200);
  assert.equal(await patientPdf.text(), '%PDF fixture');
  const prefill = await request('/emergency/1/incident-report', { userId: 4, roles: ['EMERGENCY_RESPONDER'] });
  assert.equal(prefill.status, 200);
  assert.deepEqual((await prefill.json()).report, { reportId: 1 });
});

// Verify that multi-role incident rows stay unique and concurrent responders cannot reverse a transition.
test('multi-role incident rows stay unique and concurrent responders cannot reverse a transition', { skip }, async t => {
  const db = await fixture(t);
  await db.query("INSERT IGNORE INTO USER_ROLES (user_id, role_id) SELECT 5, role_id FROM ROLES WHERE code = 'FACULTY'");
  await db.query("UPDATE USERS SET is_qualified_responder = 1 WHERE user_id = 7");
  await db.query(`INSERT INTO EMERGENCY_ALERTS (alert_id, user_id, location, location_label)
    VALUES (1, 5, ST_GeomFromText('POINT(0 0)', 4326), 'Campus gate')`);
  const { request, emit } = await mountedApi(t);
  const active = await request('/emergency/active', { userId: 7, roles: ['STUDENT'] });
  assert.equal(active.status, 200);
  const rows = await active.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].formattedAddress, 'Campus gate');
  assert.equal(rows[0].medicalDetailsRedacted, true);
  assert.equal('blood_type' in rows[0], false);
  // Submit an emergency status change with the selected caller credentials.
  const change = (status, options) => request('/emergency/1/status', {
    ...options, method: 'PATCH', json: { status },
  });
  assert.equal((await change('dispatched')).status, 200);
  const stale = await change('acknowledged');
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).currentStatus, 'dispatched');
  emit.mock.resetCalls();
  const results = await Promise.all([
    change('resolved'),
    change('false_alarm', { userId: 7, roles: ['STUDENT'] }),
  ]);
  assert.deepEqual(results.map(/* Extract status codes from the competing transition attempts. */ response => response.status).sort(), [200, 409]);
  // Collect realtime events produced by successful alert status changes.
  const updates = emit.mock.calls.filter(call => call.arguments[0] === 'emergency:status_change');
  assert.ok(updates.length > 0);
  assert.equal(new Set(updates.map(/* Extract the alert state from each notification payload. */ call => call.arguments[1].status)).size, 1);
});

// Verify that device rotation preserves other installations and logout removes only its registration.
test('device rotation preserves other installations and logout removes only its registration', { skip }, async t => {
  const db = await fixture(t);
  const { request } = await mountedApi(t);
  const id = 'a'.repeat(32), other = 'b'.repeat(32);
  // Register a test push token and its installation's duty mode.
  const register = (token, installation_id, sos_mode) => request('/profile/fcm-token', {
    method: 'POST', json: { fcm_token: token, installation_id, sos_mode },
  });
  assert.equal((await register('first-token', id, 'quiet')).status, 200);
  assert.equal((await register('second-device', other, 'on_duty')).status, 200);
  assert.equal((await register('rotated-token')).status, 200);
  assert.equal((await register('rotated-token', id, 'off_duty')).status, 200);
  const [rows] = await db.query('SELECT fcm_token, sos_mode FROM DEVICE_TOKENS WHERE user_id = 2 ORDER BY fcm_token');
  assert.deepEqual(rows, [
    { fcm_token: 'rotated-token', sos_mode: 'off_duty' },
    { fcm_token: 'second-device', sos_mode: 'on_duty' },
  ]);
  assert.equal((await request('/auth/logout', { method: 'POST', json: { installation_id: id } })).status, 200);
  const [remaining] = await db.query('SELECT installation_id FROM DEVICE_TOKENS WHERE user_id = 2');
  assert.deepEqual(remaining, [{ installation_id: other }]);
});

// Verify that concurrent incident filing publishes a single report after commit.
test('concurrent incident filing publishes a single report after commit', { skip }, async t => {
  const db = await fixture(t);
  await db.query(`INSERT INTO EMERGENCY_ALERTS (alert_id, user_id, location, created_at, resolved_at, status)
    VALUES (1, 5, ST_GeomFromText('POINT(0 0)', 4326), NOW() - INTERVAL 1 MINUTE, NOW(), 'resolved')`);
  const { s3 } = await import('../src/utils/s3Vault.js');
  const uploaded = Promise.withResolvers();
  // Record how many reports were committed when PDF upload began.
  const upload = t.mock.method(s3, 'send', async () => {
    const [[row]] = await db.query('SELECT COUNT(*) AS reports FROM INCIDENT_REPORTS');
    uploaded.resolve(row.reports);
    return {};
  });
  const { request, emit } = await mountedApi(t);
  const options = { userId: 4, roles: ['EMERGENCY_RESPONDER'], method: 'POST', json: { incident_details: 'Fixture incident report' } };
  const pendingPath = '/emergency/incident-reports/pending?summary=1';
  const [pending] = await (await request(pendingPath, { userId: 4, roles: options.roles })).json();
  assert.equal(pending.alertId, 1);
  assert.deepEqual(Object.keys(pending).sort(), ['alertId', 'resolvedAt']);
  const responses = await Promise.all([
    request('/emergency/1/incident-report', options),
    request('/emergency/1/incident-report', options),
  ]);
  assert.deepEqual(responses.map(/* Extract response codes from both concurrent incident report submissions. */ response => response.status).sort(), [201, 409]);
  // Locate the duplicate submission's conflict response.
  const duplicate = responses.find(response => response.status === 409);
  assert.equal((await duplicate.json()).code, 'REPORT_ALREADY_FILED');
  // Locate the successful incident report creation response.
  await responses.find(response => response.status === 201).json();
  assert.deepEqual(await (await request(pendingPath, { userId: 4, roles: options.roles })).json(), []);
  assert.ok(emit.mock.calls.some(/* Confirm realtime delivery of the incident report filing event. */ call => call.arguments[0] === 'emergency:incident_reported'));
  const [[audit]] = await db.query("SELECT COUNT(*) AS count FROM AUDIT_LOGS WHERE table_affected = 'INCIDENT_REPORTS'");
  assert.equal(audit.count, 1);
  const waitForUpload = AbortSignal.timeout(4_000);
  // Return the upload result in the race's expected array form.
  const [reports] = await Promise.race([uploaded.promise.then(value => [value]), once(waitForUpload, 'abort').then(/* Return an empty result when the test times out waiting for upload. */ () => [])]);
  assert.equal(reports, 1);
  assert.equal(upload.mock.callCount(), 1);
  let pdfKey;
  for (let attempt = 0; attempt < 40 && !pdfKey; attempt++) {
    const [[report]] = await db.query('SELECT pdf_s3_key FROM INCIDENT_REPORTS');
    pdfKey = report.pdf_s3_key;
    if (!pdfKey) await setTimeout(25);
  }
  assert.ok(pdfKey);
});


// Verify that PDF recovery skips another process holding the database lock and then resumes.
test('PDF recovery skips another process holding the database lock and then resumes', { skip }, async t => {
  const db = await fixture(t);
  const { backfillDocumentPdfs } = await import('../src/workers/documentPdfBackfillWorker.js');
  const connection = await db.getConnection();
  try {
    await connection.query("SELECT GET_LOCK(CONCAT('valetudo-pdfs:', SHA1(LOWER(DATABASE()))), 0)");
    assert.deepEqual(await backfillDocumentPdfs(), { skipped: true });
  } finally {
    try {
      await connection.query("SELECT RELEASE_LOCK(CONCAT('valetudo-pdfs:', SHA1(LOWER(DATABASE()))))");
    } finally {
      connection.release();
    }
  }
  const result = await backfillDocumentPdfs();
  assert.equal(result.degraded, false);
  assert.equal(result.metrics.attempted, 0);
});


// Verify that formulary preserves zero reorder level and rejects deductions from archived lots.
test('formulary preserves zero reorder level and rejects deductions from archived lots', { skip }, async t => {
  const db = await fixture(t);
  const { request } = await mountedApi(t);
  const nurse = { userId: 3, roles: ['NURSE'] };
  const created = await request('/inventory/medicines', {
    ...nurse, method: 'POST',
    json: { name: 'Fixture', generic_name: 'Fixture', form: 'Tablet', strength: '10mg', reorder_level: 0 },
  });
  assert.equal(created.status, 201);
  const { medicineId } = await created.json();
  const [[medicine]] = await db.query('SELECT reorder_level FROM MEDICINES WHERE medicine_id = ?', [medicineId]);
  assert.equal(medicine.reorder_level, 0);
  const [lot] = await db.query(
    `INSERT INTO MEDICINE_BATCHES (medicine_id, batch_no, manufacture_date, expiry_date, quantity_on_hand, deleted_at)
     VALUES (?, 'archived', CURDATE() - INTERVAL 1 DAY, CURDATE() + INTERVAL 1 DAY, 2, NOW())`,
    [medicineId],
  );
  const rejected = await request('/inventory/deduct', {
    ...nurse, method: 'POST', json: { batch_id: lot.insertId, quantity_deducted: 1 },
  });
  assert.equal(rejected.status, 400);
  const [[stock]] = await db.query('SELECT quantity_on_hand FROM MEDICINE_BATCHES WHERE batch_id = ?', [lot.insertId]);
  assert.equal(stock.quantity_on_hand, 2);
});

// Verify that concurrent prescription cancellations return stock and write the return ledger once.
test('concurrent prescription cancellations return stock and write the return ledger once', { skip }, async t => {
  const db = await fixture(t);
  const { request, emit } = await mountedApi(t);
  await db.query("INSERT INTO MEDICINES (medicine_id, name, generic_name, form, strength, unit) VALUES (1, 'Fixture', 'Fixture', 'Tablet', '10mg', 'pcs')");
  await db.query(`INSERT INTO MEDICINE_BATCHES (batch_id, medicine_id, batch_no, manufacture_date, expiry_date, quantity_on_hand)
    VALUES (1, 1, 'fixture', CURDATE() - INTERVAL 1 DAY, CURDATE() + INTERVAL 1 DAY, 3)`);
  await db.query("INSERT INTO EMR_RECORDS (emr_id, patient_user_id, doctor_user_id, chief_complaint, diagnosis) VALUES (1, 1, 2, 'fixture', 'fixture')");
  await db.query("INSERT INTO PRESCRIPTIONS (prescription_id, emr_id, patient_user_id, doctor_user_id, expires_at, qr_token) VALUES (1, 1, 1, 2, CURDATE(), 'fixture-cancel')");
  await db.query("INSERT INTO PRESCRIPTION_ITEMS (item_id, prescription_id, medicine_id, dosage, frequency, duration_days) VALUES (1, 1, 1, '10mg', 'daily', 1)");
  await db.query("INSERT INTO INVENTORY_LOGS (batch_id, prescription_item_id, quantity_change, transaction_type, performed_by) VALUES (1, 1, -2, 'dispense', 2)");
  // Submit cancellation for the fixture prescription.
  const cancel = () => request('/documents/prescriptions/1/cancel', { method: 'PATCH', json: { reason: 'Fixture' } });
  const results = await Promise.all([cancel(), cancel()]);
  assert.deepEqual(results.map(/* Extract the HTTP statuses from the concurrent cancellation requests. */ response => response.status).sort(), [200, 409]);
  assert.equal((await results.find(/* Locate the cancellation that received a conflict. */ response => response.status === 409).json()).code, 'INVALID_STATE');
  const [returns] = await db.query("SELECT quantity_change FROM INVENTORY_LOGS WHERE transaction_type = 'return'");
  assert.deepEqual(returns, [{ quantity_change: 2 }]);
  const [[stock]] = await db.query('SELECT quantity_on_hand FROM MEDICINE_BATCHES WHERE batch_id = 1');
  assert.equal(stock.quantity_on_hand, 5);
  assert.equal(emit.mock.calls.filter(/* Select inventory refresh events emitted after cancellation. */ call => call.arguments[0] === 'inventory:updated').length, 1);
});
