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

async function mountedApi(t) {
  const { createApp, mountApiRoutes } = await withoutFirebaseCredentials(t, () => import('../src/app.js'));
  const app = createApp();
  const emit = t.mock.fn();
  mountApiRoutes(app, { emit, to: () => ({ emit }) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));

  const request = (path, { userId = 2, roles = ['DOCTOR'], method = 'GET', json } = {}) => {
    const token = jwt.sign({ user_id: userId, roles }, process.env.JWT_SECRET, { expiresIn: '5m' });
    return fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
      method,
      signal: AbortSignal.timeout(7_000),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  };
  return { request, emit };
}

async function insertCheckedInAppointments(db) {
  await db.query(`INSERT INTO APPOINTMENTS (appointment_id, patient_user_id, doctor_user_id, date_time, appointment_type, status)
    VALUES (1, 5, 2, NOW(), 'Medical', 'checked_in'), (2, 7, 2, NOW(), 'Medical', 'checked_in')`);
  await db.query(`INSERT INTO QUEUE (queue_id, patient_user_id, appointment_id, queue_date, queue_number)
    VALUES (1, 5, 1, CURDATE(), 1), (2, 7, 2, CURDATE(), 2)`);
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
  assert.deepEqual(appointments.map(row => row.status), ['serving', 'serving']);
  assert.deepEqual(tickets.map(row => row.status), ['in-consultation', 'in-consultation']);
  assert.equal(emit.mock.calls.filter(call => call.arguments[0] === 'appointment:status_changed').length, 2);
  const invalid = await request('/appointments/1/status', { method: 'PATCH', json: { status: 'scheduled' } });
  assert.equal(invalid.status, 409);
  assert.equal((await invalid.json()).code, 'INVALID_TRANSITION');
});

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
  const completed = roster.filter(row => row.appointment_id === 1);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].past_dietary_notes, 'latest');
  const arrivals = await (await request('/appointments/expected-today')).json();
  assert.deepEqual(arrivals.map(row => row.appointment_id), [2]);
  assert.deepEqual(await (await request('/appointments/no-shows-today')).json(), { count: 2 });

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

test('paged offline bootstrap drains both streams and defers changes at the watermark', { skip }, async t => {
  const db = await fixture(t);
  const extraPatients = Array.from({ length: 503 }, (_, index) => [`fixture-${index}@example.test`, 'fixture', 'Sync', 'Patient']);
  await db.query('INSERT INTO USERS (email, password_hash, first_name, last_name) VALUES ?', [extraPatients]);
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
  assert.deepEqual(second.emrRecords.map(record => record.emr_id), [501, 502]);
  assert.equal(new Set([...first.patients, ...second.patients].map(patient => patient.user_id)).size, 511);

  const [[clock]] = await db.query('SELECT UNIX_TIMESTAMP() AS now');
  if (clock.now <= upperTime) await setTimeout(1_050);
  const delta = await (await request('/sync/bootstrap?paging=1&checkpoint=' + encodeURIComponent(first.serverTime))).json();
  assert.deepEqual(delta.emrRecords.map(record => record.emr_id), [503]);
  const legacy = await (await request('/sync/bootstrap')).json();
  assert.equal(legacy.emrRecords.length, 500);
  assert.equal(Object.hasOwn(legacy, 'nextCursor'), false);
});

test('analytics exports and dashboard use the shared department totals', { skip }, async t => {
  const db = await fixture(t);
  await db.query(`INSERT INTO APPOINTMENTS (patient_user_id, doctor_user_id, date_time, appointment_type, status)
    VALUES (5, 2, NOW(), 'Medical', 'completed'), (5, 2, NOW(), 'Medical', 'completed'),
           (5, 2, NOW(), 'Medical', 'cancelled'), (7, 2, NOW(), 'Medical', 'completed')`);
  const { request } = await mountedApi(t);
  const departments = await (await request('/analytics/by-department')).json();
  assert.deepEqual(departments, [
    { department: 'BS Information Technology', consultation_count: 2 },
    { department: 'College of Computing Studies', consultation_count: 1 },
  ]);
  const csv = await request('/analytics/export/csv');
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /"BS Information Technology",2/);

  const excel = await request('/analytics/export/excel');
  assert.equal(excel.status, 200);
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await excel.arrayBuffer());
  assert.deepEqual(workbook.getWorksheet('Department Volume').getRow(2).values.slice(1), ['BS Information Technology', 2]);

  const pdf = await request('/analytics/export/pdf');
  assert.equal(pdf.status, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
});

test('concurrent incident filing publishes a single report after commit', { skip }, async t => {
  const db = await fixture(t);
  await db.query(`INSERT INTO EMERGENCY_ALERTS (alert_id, user_id, location, created_at, resolved_at, status)
    VALUES (1, 5, ST_GeomFromText('POINT(0 0)', 4326), NOW() - INTERVAL 1 MINUTE, NOW(), 'resolved')`);
  const { s3 } = await import('../src/utils/s3Vault.js');
  const uploaded = Promise.withResolvers();
  const upload = t.mock.method(s3, 'send', async () => {
    const [[row]] = await db.query('SELECT COUNT(*) AS reports FROM INCIDENT_REPORTS');
    uploaded.resolve(row.reports);
    return {};
  });
  const { request, emit } = await mountedApi(t);
  const options = { userId: 4, roles: ['EMERGENCY_RESPONDER'], method: 'POST', json: { incident_details: 'Fixture incident report' } };
  const responses = await Promise.all([
    request('/emergency/1/incident-report', options),
    request('/emergency/1/incident-report', options),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const duplicate = responses.find(response => response.status === 409);
  assert.equal((await duplicate.json()).code, 'REPORT_ALREADY_FILED');
  await responses.find(response => response.status === 201).json();
  assert.ok(emit.mock.calls.some(call => call.arguments[0] === 'emergency:incident_reported'));
  const [[audit]] = await db.query("SELECT COUNT(*) AS count FROM AUDIT_LOGS WHERE table_affected = 'INCIDENT_REPORTS'");
  assert.equal(audit.count, 1);
  const waitForUpload = AbortSignal.timeout(4_000);
  const [reports] = await Promise.race([uploaded.promise.then(value => [value]), once(waitForUpload, 'abort').then(() => [])]);
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
