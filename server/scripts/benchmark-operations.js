// Exercises backend bottlenecks and failure paths on disposable loopback services.
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { mock } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { DeleteBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import { Server as SocketServer } from 'socket.io';

const host = '127.0.0.1';
const port = Number(process.env.VALETUDO_MIGRATION_TEST_PORT);
const password = process.env.VALETUDO_MIGRATION_TEST_PASSWORD;
const redisPort = Number(process.env.VALETUDO_BENCHMARK_REDIS_PORT);
const s3Port = Number(process.env.VALETUDO_BENCHMARK_S3_PORT);
for (const value of [port, redisPort, s3Port]) assert(Number.isInteger(value) && value >= 1024 && value < 65536);
assert(password && process.env.VALETUDO_BENCHMARK_REDIS_PASSWORD && process.env.VALETUDO_BENCHMARK_S3_ACCESS_KEY && process.env.VALETUDO_BENCHMARK_S3_SECRET_KEY,
  'Provide the disposable service ports and credentials.');
const runId = randomUUID().replaceAll('-', '');
const database = 'valetudo_bench_' + runId;
const bucket = 'valetudo-bench-' + runId;
const secret = 'synthetic-jwt-' + runId;
const dbOptions = { host, port, user: 'root', password };
Object.assign(process.env, {
  DB_HOST: host, DB_PORT: String(port), DB_USER: 'root', DB_PASSWORD: password, DB_NAME: database,
  JWT_SECRET: secret, ENCRYPTION_KEY: 'synthetic-encryption-' + runId, ENCRYPTION_SALT: 'synthetic-salt-' + runId,
  REDIS_HOST: host, REDIS_PORT: String(redisPort), REDIS_PASSWORD: process.env.VALETUDO_BENCHMARK_REDIS_PASSWORD,
  S3_ENDPOINT: `http://${host}:${s3Port}`, S3_ACCESS_KEY: process.env.VALETUDO_BENCHMARK_S3_ACCESS_KEY,
  S3_SECRET_KEY: process.env.VALETUDO_BENCHMARK_S3_SECRET_KEY, S3_BUCKET: bucket,
  SMTP_HOST: host, SMTP_PORT: '1', SMTP_USER: '', GOOGLE_MAPS_API_KEY: '', PUBLIC_API_BASE_URL: `http://${host}`,
});

const output = (scenario, details) => console.log(JSON.stringify({ scenario, ...details }));
const round = number => Math.round(number * 100) / 100;
function timings(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return { p50: round(sorted[Math.ceil(sorted.length * 0.5) - 1]), p95: round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    max: round(sorted.at(-1)) };
}

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
const fakeAccountPath = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
const originalExists = fs.existsSync;
const originalRead = fs.readFileSync;
const existsMock = mock.method(fs, 'existsSync', name => name === fakeAccountPath || originalExists(name));
const readMock = mock.method(fs, 'readFileSync', (name, ...args) => name === fakeAccountPath
  ? JSON.stringify({ project_id: 'synthetic-load-fixture', client_email: 'fixture@example.invalid', private_key: privateKey })
  : originalRead(name, ...args));
const deliveredBatch = message => ({ successCount: message.tokens.length, failureCount: 0, responses: message.tokens.map(() => ({ success: true })) });
let push = deliveredBatch;
let sendMail = async message => ({ accepted: [message.to.address] });
mock.module('firebase-admin/app', { exports: { initializeApp: options => ({ options }) } });
mock.module('firebase-admin/messaging', { exports: { getMessaging: () => ({ sendEachForMulticast: message => push(message) }) } });
mock.method(nodemailer, 'createTransport', () => ({ sendMail: message => sendMail(message) }));

const admin = await mysql.createConnection({ ...dbOptions, multipleStatements: true });
let pool;
let redis;
let io;
let s3;
try {
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  await admin.query(schema.replaceAll('`valetudo_healthlink`', '`' + database + '`'));
  const importedPool = await import('../src/db/pool.js');
  pool = importedPool.pool;
  const cache = await import('../src/utils/redisClient.js');
  redis = cache.redis;
  const storage = await import('../src/utils/s3Vault.js');
  s3 = storage.s3;
  const { runMigrations } = await import('../src/db/migrate.js');
  const { createApp, mountApiRoutes } = await import('../src/app.js');
  existsMock.mock.restore();
  readMock.mock.restore();
  await runMigrations(pool);
  await cache.initRedis();
  assert(cache.isRedisActive());
  const [[versions]] = await admin.query('SELECT @@version AS mysql, @@transaction_isolation AS isolation');
  output('environment', { ...versions, redis: (await redis.info('server')).match(/redis_version:([^\r\n]+)/)[1] });
  const app = createApp();
  const server = createServer(app);
  io = new SocketServer(server);
  mountApiRoutes(app, io);
  server.listen(0, host);
  await once(server, 'listening');
  const request = async (route, { user = 1, role = 'ADMIN', method = 'GET', data } = {}) => {
    const token = jwt.sign({ user_id: user, roles: [role] }, secret, { expiresIn: '5m' });
    const response = await fetch(`http://${host}:${server.address().port}/api${route}`, {
      method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, body: Buffer.from(await response.arrayBuffer()) };
  };

  await verifyAdminPoolWaits(request);
  await measureMaintenance();
  await verifySos(request);
  await verifyReminders();
  await measureRedis(cache);
  await verifyStorage(storage, request);
  await measureSurveillance();
} finally {
  await io?.close();
  redis?.disconnect();
  s3?.destroy();
  await pool?.end();
  await admin.query('DROP DATABASE IF EXISTS ??', [database]);
  await admin.end();
}

async function verifyAdminPoolWaits(request) {
  await pool.query("INSERT INTO USER_ROLES (user_id, role_id) SELECT 4, role_id FROM ROLES WHERE code = 'ADMIN'");
  for (const [label, route, method, data] of [
    ['qualification', '/admin/users/4/qualified-responder', 'PUT', { is_qualified_responder: false }],
    ['archive', '/admin/users/4', 'DELETE', undefined],
  ]) {
    const one = mysql.createPool({ ...dbOptions, database, connectionLimit: 1 });
    const testQuery = mock.method(pool, 'query', one.query.bind(one));
    const testAcquire = mock.method(pool, 'getConnection', one.getConnection.bind(one));
    try {
      const started = performance.now();
      assert.equal((await request(route, { method, data })).status, 200);
      output('admin-one-connection', { route: label, ms: round(performance.now() - started) });
    } finally {
      testQuery.mock.restore();
      testAcquire.mock.restore();
      await one.end();
    }
  }
  await pool.query('UPDATE USERS SET is_active = TRUE, deleted_at = NULL WHERE user_id = 4');
  await pool.query("DELETE ur FROM USER_ROLES ur JOIN ROLES r ON r.role_id = ur.role_id WHERE ur.user_id = 4 AND r.code = 'ADMIN'");
}

async function insertLots(size, work) {
  for (let offset = 0; offset < size; offset += 500) await work(Math.min(500, size - offset), offset);
}

async function measureMaintenance() {
  const { markDueAppointmentsNoShow } = await import('../src/appointments/noShow.js');
  const { expireDuePrescriptions } = await import('../src/documents/prescriptions/expirePrescriptions.js');
  const [emr] = await pool.query("INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, chief_complaint, diagnosis) VALUES (5, 2, 'Synthetic', 'Synthetic')");
  const [[dates]] = await pool.query(`SELECT DATE_FORMAT(NOW() - INTERVAL 2 HOUR, '%Y-%m-%d %H:%i:%s') AS overdue,
    DATE_FORMAT(NOW() - INTERVAL 4 DAY, '%Y-%m-%d %H:%i:%s') AS issued,
    DATE_FORMAT(CURDATE() - INTERVAL 2 DAY, '%Y-%m-%d') AS expiry`);
  for (const size of [100, 5000, 20000]) {
    let firstBooking;
    let firstRx;
    await insertLots(size, async (count, offset) => {
      const [appointments] = await pool.query('INSERT INTO APPOINTMENTS (patient_user_id, doctor_user_id, date_time, appointment_type) VALUES ?',
        [Array.from({ length: count }, () => [5, 2, dates.overdue, 'General consultation'])]);
      const [prescriptions] = await pool.query(`INSERT INTO PRESCRIPTIONS
        (emr_id, patient_user_id, doctor_user_id, issued_at, expires_at, qr_token, contract_version, signature_metadata) VALUES ?`,
      [Array.from({ length: count }, (_, index) => [emr.insertId, 5, 2, dates.issued, dates.expiry, `load-${size}-${offset + index}`, 1 + index % 2, '{}'])]);
      if (offset === 0) { firstBooking = appointments.insertId; firstRx = prescriptions.insertId; }
      const items = Array.from({ length: count / 2 }, (_, index) => [prescriptions.insertId + 2 * index, 'Synthetic item', '1 tablet', 'Daily', 1, 1]);
      await pool.query('INSERT INTO PRESCRIPTION_ITEMS (prescription_id, outside_name, dosage, frequency, duration_days, quantity_prescribed) VALUES ?', [items]);
    });
    let noShowsRemaining = size;
    let prescriptionsRemaining = size;
    if (size === 100) {
      const targets = [
        ['no-show', 'APPOINTMENTS', 'appointment_id', firstBooking, 'scheduled', () => markDueAppointmentsNoShow(15)],
        ['expiry', 'PRESCRIPTIONS', 'prescription_id', firstRx, 'active', expireDuePrescriptions],
      ];
      const committed = {};
      for (const [name, table, idColumn, id, from, run] of targets) {
        const blocker = await pool.getConnection();
        try {
          await blocker.beginTransaction();
          await blocker.query('SELECT ?? FROM ?? WHERE ?? = ? FOR UPDATE', [idColumn, table, idColumn, id]);
          const started = performance.now();
          const processed = await run();
          const ms = round(performance.now() - started);
          committed[name] = processed.length;
          assert.equal(processed.length, size - 1);
          assert(!processed.includes(id));
          const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM ?? WHERE status = ?', [table, from]);
          assert.equal(Number(n), 1);
          output('maintenance-held-row', { job: name, committedWhileHeld: processed.length, ms });
        } finally {
          await blocker.rollback();
          blocker.release();
        }
      }
      noShowsRemaining -= committed['no-show'];
      prescriptionsRemaining -= committed.expiry;
    }
    const drain = async run => {
      let count = 0;
      while (true) {
        const ids = await run();
        assert(ids.length <= 100);
        count += ids.length;
        if (ids.length < 100) return count;
      }
    };
    const startNoShow = performance.now();
    assert.equal(await drain(() => markDueAppointmentsNoShow(15)), noShowsRemaining);
    const noShowMs = round(performance.now() - startNoShow);
    const startExpire = performance.now();
    assert.equal(await drain(expireDuePrescriptions), prescriptionsRemaining);
    const expireMs = round(performance.now() - startExpire);
    assert.equal((await markDueAppointmentsNoShow(15)).length, 0);
    assert.equal((await expireDuePrescriptions()).length, 0);
    output('maintenance', { eligiblePerJob: size, noShowMs, expireMs, noShowsProcessed: noShowsRemaining, prescriptionsProcessed: prescriptionsRemaining });
  }
  await pool.query('UPDATE PRESCRIPTIONS SET deleted_at = NOW() WHERE emr_id = ?', [emr.insertId]);
}

async function verifySos(request) {
  const { dispatchPendingSos } = await import('../src/emergency/sosDispatch.js');
  await pool.query(`INSERT INTO DEVICE_TOKENS (user_id, fcm_token, installation_id, sos_mode, device_type)
    VALUES (4, 'ok', 'fixture-ok', 'on_duty', 'android'), (4, 'retry', 'fixture-retry', 'on_duty', 'android'),
      (4, 'invalid', 'fixture-invalid', 'on_duty', 'android')`);
  const createAlert = async user => {
    const response = await request('/emergency/sos/requests', { user, role: 'STUDENT', method: 'POST',
      data: { latitude: 16.0298, longitude: 120.2285, client_sos_id: randomUUID().replaceAll('-', '') } });
    assert.equal(response.status, 201);
    return JSON.parse(response.body).alertId;
  };
  const events = [];
  const io = { to: room => ({ emit: (event, data) => { if (room === 'user:4') events.push({ event, id: data.alertId }); } }) };
  const pending = async id => (await pool.query('SELECT dispatch_after FROM EMERGENCY_ALERTS WHERE alert_id = ?', [id]))[0][0].dispatch_after;
  let calls = 0;
  push = message => {
    calls++;
    const responses = message.tokens.map(token => ({
      ok: { success: true }, retry: { success: false, error: { code: 'messaging/server-unavailable' } },
      invalid: { success: false, error: { code: 'messaging/registration-token-not-registered' } },
    })[token]);
    return { successCount: 1, failureCount: 2, responses };
  };
  const partialId = await createAlert(5);
  const started = performance.now();
  const partial = await dispatchPendingSos(io);
  const manualDispatchMs = round(performance.now() - started);
  assert.equal(calls, 1);
  assert.equal(partial.metrics.failed, 0);
  assert.equal(await pending(partialId), null);
  const [remaining] = await pool.query('SELECT fcm_token FROM DEVICE_TOKENS ORDER BY fcm_token');
  assert.deepEqual(remaining.map(row => row.fcm_token), ['ok', 'retry']);
  await dispatchPendingSos(io);
  assert.equal(calls, 1);
  output('sos-partial-failure', { providerAccepted: 1, transientFailures: 1, retried: 0, invalidTokensRemoved: 1,
    workerReportedFailures: partial.metrics.failed, dispatchFromReceiptMs: manualDispatchMs });

  const outageId = await createAlert(7);
  push = () => { throw Object.assign(new Error('Synthetic provider outage'), { code: 'messaging/server-unavailable' }); };
  const outage = await dispatchPendingSos(io);
  assert.equal(outage.metrics.failed, 1);
  assert(await pending(outageId));
  // Advance the fixture's due marker to test the next lease without waiting a minute.
  await pool.query('UPDATE EMERGENCY_ALERTS SET dispatch_after = NOW(3) WHERE alert_id = ?', [outageId]);
  push = deliveredBatch;
  await dispatchPendingSos(io);
  assert.equal(await pending(outageId), null);
  const outageEvents = events.filter(event => event.id === outageId).length;
  assert.equal(outageEvents, 2);
  output('sos-provider-outage', { retrySucceeded: true, responderSocketEvents: outageEvents });

  const slowId = await createAlert(8);
  const followingId = await createAlert(5);
  const called = Promise.withResolvers();
  const release = Promise.withResolvers();
  push = async message => {
    if (Number(message.data.alertId) === slowId) {
      called.resolve();
      await release.promise;
    }
    return deliveredBatch(message);
  };
  const dispatchStarted = performance.now();
  const dispatch = dispatchPendingSos(io);
  try {
    await Promise.race([called.promise, delay(3000, null, { ref: false }).then(() => { throw new Error('Slow FCM fixture was not called.'); })]);
    await delay(250);
    assert.equal(events.some(event => event.id === followingId), false);
  } finally { release.resolve(); }
  await dispatch;
  assert.equal(events.some(event => event.id === followingId), true);
  output('sos-slow-provider', { followingAlertBlockedDuring250MsDelay: true, dispatchBatchMs: round(performance.now() - dispatchStarted) });
}

async function verifyReminders() {
  const { sendDueAppointmentReminders } = await import('../src/workers/appointmentReminderWorker.js');
  const [[{ date }]] = await pool.query("SELECT DATE_FORMAT(NOW() + INTERVAL 1 HOUR, '%Y-%m-%d %H:%i:%s') AS date");
  await pool.query('INSERT INTO APPOINTMENTS (patient_user_id, doctor_user_id, date_time, appointment_type) VALUES ?',
    [Array.from({ length: 51 }, () => [5, 2, date, 'General consultation'])]);
  let attempted = 0;
  sendMail = async message => {
    attempted++;
    await delay(20);
    if (attempted === 1) throw Object.assign(new Error('Synthetic mail failure'), { code: 'ETIMEDOUT' });
    return { accepted: [message.to.address] };
  };
  const started = performance.now();
  const runs = await Promise.all([sendDueAppointmentReminders(), sendDueAppointmentReminders()]);
  const batchMs = round(performance.now() - started);
  assert.equal(runs.filter(run => run.skipped).length, 1);
  const first = runs.find(run => !run.skipped);
  assert.deepEqual(first, { metrics: { attempted: 50, delivered: 49 }, degraded: true });
  const pass2 = await sendDueAppointmentReminders();
  const pass3 = await sendDueAppointmentReminders();
  assert.equal(pass2.metrics.delivered, 1);
  assert.equal(pass3.metrics.delivered, 1);
  assert.equal((await sendDueAppointmentReminders()).metrics.attempted, 0);
  assert.equal(attempted, 52);
  output('reminders', { batchMs, attempts: attempted, persisted: 51, concurrentSkipped: 1, firstBatchFailed: 1, retrySucceeded: true });
}

async function measureRedis({ invalidateCache }) {
  const prefix = 'load-fixture:' + runId + ':';
  let loaded = 0;
  try {
    for (const size of [0, 10_000, 100_000]) {
      await insertLots(size - loaded, async (count, offset) => {
        const pipeline = redis.pipeline();
        for (let i = 0; i < count; i++) pipeline.set(prefix + (loaded + offset + i), 'synthetic', 'EX', 300);
        const results = await pipeline.exec();
        assert(results.every(([error]) => !error));
      });
      loaded = size;
      const baselineKeys = await redis.dbsize();
      const scanCount = async () => Number((await redis.info('commandstats')).match(/cmdstat_scan:calls=(\d+)/)?.[1] ?? 0);
      const before = await scanCount();
      const samples = { wildcard: [], exact: [] };
      for (let i = 0; i < 30; i++) {
        for (const [method, key] of [['wildcard', 'queue:*'], ['exact', 'queue:today']]) {
          await redis.set('queue:today', 'synthetic');
          const started = performance.now();
          await invalidateCache(key);
          samples[method].push(performance.now() - started);
          assert.equal(await redis.exists('queue:today'), 0);
        }
      }
      output('redis-invalidation', { keys: baselineKeys, wildcardMs: timings(samples.wildcard), exactMs: timings(samples.exact),
        scanCommandsPerWildcard: round((await scanCount() - before) / 30) });
    }
  } finally {
    await insertLots(loaded, async (count, offset) => {
      await redis.del(...Array.from({ length: count }, (_, i) => prefix + (offset + i)));
    });
  }
}

async function verifyStorage({ ensureBucketExists, BUCKET_NAME, deleteFromS3 }, request) {
  await ensureBucketExists(AbortSignal.timeout(5000));
  const counts = { PutObjectCommand: 0, DeleteObjectCommand: 0 };
  let failUploads = false;
  s3.middlewareStack.add((next, context) => async args => {
    if (context.commandName in counts) counts[context.commandName]++;
    if (context.commandName === 'PutObjectCommand' && failUploads) throw new Error('Synthetic S3 upload outage');
    return next(args);
  }, { step: 'initialize', name: 'measureFixtures' });
  const pdf = id => request(`/documents/clearances/${id}/pdf`, { user: 5, role: 'STUDENT' });
  const checkPdf = result => {
    assert.equal(result.status, 200);
    assert.equal(result.body.subarray(0, 5).toString(), '%PDF-');
  };
  try {
    const [[{ date }]] = await pool.query("SELECT DATE_FORMAT(CURDATE() + INTERVAL 30 DAY, '%Y-%m-%d') AS date");
    await pool.query(`INSERT INTO MEDICAL_CLEARANCES (clearance_id, user_id, purpose, issued_by, expires_at, qr_token, signature_metadata) VALUES ?`,
      [[[1, 5, 'Synthetic clearance', 2, date, 'load-clearance-1', '{}'], [2, 5, 'Recovery fixture', 2, date, 'load-clearance-2', '{}']]]);
    const bad = await request('/documents/clearances/1/pdf', { user: 7, role: 'STUDENT' });
    assert.equal(bad.status, 403);
    const wave = () => Promise.all(Array.from({ length: 16 }, async () => {
      const started = performance.now();
      checkPdf(await pdf(1));
      return performance.now() - started;
    }));
    const cold = await wave();
    const puts = counts.PutObjectCommand;
    const deletes = counts.DeleteObjectCommand;
    const warm = await wave();
    assert(puts > 1);
    assert.equal(puts - deletes, 1);
    assert.equal(counts.PutObjectCommand, puts);
    output('s3-pdf-burst', { coldMs: timings(cold), warmMs: timings(warm), uploads: puts, redundantObjectsDeleted: deletes });

    const { backfillDocumentPdfs } = await import('../src/workers/documentPdfBackfillWorker.js');
    failUploads = true;
    assert.equal((await pdf(2)).status, 503);
    const failed = await backfillDocumentPdfs();
    assert.equal(failed.metrics.failed, 1);
    const [[{ deferred }]] = await pool.query('SELECT pdf_retry_at > UTC_TIMESTAMP() AS deferred FROM MEDICAL_CLEARANCES WHERE clearance_id = 2');
    assert.equal(deferred, 1);
    failUploads = false;
    const premature = await backfillDocumentPdfs();
    assert.equal(premature.metrics.recovered, 0);
    await pool.query('UPDATE MEDICAL_CLEARANCES SET pdf_retry_at = UTC_TIMESTAMP() WHERE clearance_id = 2');
    const recovered = await backfillDocumentPdfs();
    assert.equal(recovered.metrics.recovered, 1);
    checkPdf(await pdf(2));
    output('s3-pdf-recovery', { initialStatus: 503, deferredAfterFailure: true, prematureRetries: 0, recoveredAfterDue: 1, finalStatus: 200 });
  } finally {
    const { Contents = [] } = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME }));
    for (const item of Contents) await deleteFromS3(item.Key);
    await s3.send(new DeleteBucketCommand({ Bucket: BUCKET_NAME }));
  }
}

async function measureSurveillance() {
  const { encrypt } = await import('../src/utils/cryptoVault.js');
  const { loadSurveillance } = await import('../src/analytics/summary.js');
  const [[{ date }]] = await pool.query("SELECT DATE_FORMAT(NOW() - INTERVAL 1 DAY, '%Y-%m-%d %H:%i:%s') AS date");
  const diagnosisChoices = Array.from({ length: 20 }, (_, index) => encrypt(index % 2 ? 'Synthetic fever' : 'Synthetic other'));
  await insertLots(4000, async (count, offset) => {
    await pool.query('INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, encounter_date, chief_complaint, diagnosis) VALUES ?',
      [Array.from({ length: count }, (_, i) => [5, 2, date, diagnosisChoices[0], diagnosisChoices[(offset + i) % diagnosisChoices.length]])]);
  });
  await redis.del('analytics:risk-groups:v1');
  await loadSurveillance();
  let sqlMs = 0;
  let selectedRows = 0;
  const read = pool.query.bind(pool);
  const measure = mock.method(pool, 'query', async (sql, args) => {
    if (!String(sql).startsWith('SELECT diagnosis, encounter_date')) return read(sql, args);
    const started = performance.now();
    const result = await read(sql, args);
    sqlMs = performance.now() - started;
    selectedRows = result[0].length;
    return result;
  });
  const samples = { total: [], mysql: [], afterMySql: [] };
  try {
    for (let i = 0; i < 10; i++) {
      const started = performance.now();
      const result = await loadSurveillance();
      const total = performance.now() - started;
      assert.equal(result.fluStats.cases_past_7_days, 2000);
      samples.total.push(total);
      samples.mysql.push(sqlMs);
      samples.afterMySql.push(total - sqlMs);
    }
  } finally { measure.mock.restore(); }
  output('analytics-surveillance', { selectedRows, calls: samples.total.length, totalMs: timings(samples.total),
    mysqlMs: timings(samples.mysql), afterMysqlMs: timings(samples.afterMySql) });
}
