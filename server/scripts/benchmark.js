// Runs a synthetic HTTP and Socket.IO workload against a disposable loopback MySQL instance.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { availableParallelism, cpus, totalmem } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';

const loopback = '127.0.0.1';
const fixtureJwt = 'load-test-session-' + randomUUID();
const patientBase = 1000;
const doctorIds = [2, 20, 21, 22];
const patientCount = 2000;
const historyCount = 25000;
const requestsPerStage = 800;
const workload = [
  'queue', 'booking', 'history', 'checkin', 'analytics', 'queue', 'booking', 'queue', 'history', 'checkin',
  'booking', 'queue', 'sos', 'history', 'booking', 'analytics', 'queue', 'checkin', 'booking', 'queue',
];

const round = value => Math.round(value * 10) / 10;
function percentiles(values) {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const at = fraction => round(sorted[Math.ceil(sorted.length * fraction) - 1]);
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) };
}

async function listen(server, scheme = 'http') {
  server.listen(0, loopback);
  await once(server, 'listening');
  return `${scheme}://${loopback}:${server.address().port}`;
}

async function seed(admin, database) {
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  await admin.query(schema.replaceAll('`valetudo_healthlink`', '`' + database + '`'));
  await admin.query('USE ??', [database]);
  const { encrypt } = await import('../src/utils/cryptoVault.js');
  const users = Array.from({ length: patientCount }, (_, index) => patientBase + index);
  const diagnosisLabels = Array.from({ length: 2500 }, (_, index) => 'Synthetic diagnosis ' + index);
  const complaints = encrypt('Synthetic consultation');
  for (const id of doctorIds.slice(1)) {
    await admin.query('INSERT INTO USERS (user_id, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [id, `doctor-${id}@example.invalid`, 'fixture', 'Synthetic', 'Doctor']);
    await admin.query("INSERT INTO USER_ROLES SELECT ?, role_id FROM ROLES WHERE code = 'DOCTOR'", [id]);
  }
  for (let offset = 0; offset < users.length; offset += 500) {
    const batch = users.slice(offset, offset + 500);
    await admin.query('INSERT INTO USERS (user_id, email, password_hash, first_name, last_name) VALUES ?',
      [batch.map(id => [id, `${id}@example.invalid`, 'fixture', 'Synthetic', 'Patient'])]);
    await admin.query("INSERT INTO USER_ROLES (user_id, role_id) SELECT user_id, 1 FROM USERS WHERE user_id IN (?)", [batch]);
    await admin.query('INSERT INTO CONSENT_RECORDS (user_id, consent_type, is_granted, ip_address) VALUES ?',
      [batch.map(id => [id, 'PHI_PROCESSING_RA_10173', true, loopback])]);
    await admin.query('INSERT INTO HEALTH_PROFILES (user_id, allergies, chronic_conditions) VALUES ?',
      [batch.map(id => [id, encrypt(id % 31 === 0 ? 'Synthetic pollen' : 'None'), encrypt(id % 23 === 0 ? 'Asthma' : 'None')])]);
  }
  const [[{ clinicDate }]] = await admin.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS clinicDate");
  for (let offset = 0; offset < historyCount; offset += 500) {
    const records = Array.from({ length: 500 }, (_, index) => {
      const row = offset + index;
      const date = new Date(Date.parse(clinicDate) - (1 + row % 90) * 86400000).toISOString().slice(0, 10);
      const patient = row % 5 === 0 ? 5 : users[row % users.length];
      return [patient, 2, `${date} 10:00:00`, complaints, encrypt(diagnosisLabels[row % diagnosisLabels.length])];
    });
    await admin.query('INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, encounter_date, chief_complaint, diagnosis) VALUES ?', [records]);
  }
  await admin.query('INSERT INTO APPOINTMENTS (appointment_id, patient_user_id, doctor_user_id, date_time, appointment_type) VALUES ?',
    [Array.from({ length: 120 }, (_, index) => [index + 1, patientBase + 1000 + index, 2, `${clinicDate} 08:00:00`, 'General consultation'])]);
  await admin.query(`INSERT INTO MEDICAL_CLEARANCES (clearance_id, user_id, purpose, issued_by, expires_at, qr_token, signature_metadata)
    VALUES (1, 5, 'Synthetic clearance', 2, CURRENT_DATE + INTERVAL 30 DAY, 'synthetic-load-check', JSON_OBJECT())`);
  return clinicDate;
}

// Keep S3 I/O local while exercising the real SDK, renderer, upload, publish and download paths.
function storageFixture() {
  const objects = new Map();
  const counts = { PUT: 0, GET: 0, DELETE: 0 };
  const server = createServer(async (req, res) => {
    const key = new URL(req.url, 'http://local.invalid').pathname;
    counts[req.method]++;
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks));
      await delay(25);
      res.end();
    } else if (req.method === 'DELETE') {
      objects.delete(key);
      res.writeHead(204).end();
    } else if (objects.has(key)) {
      const pdf = objects.get(key);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length }).end(pdf);
    } else {
      res.writeHead(404).end();
    }
  });
  return { server, counts, objects };
}

async function serve() {
  assert(process.send && process.env.DB_HOST === loopback && /^valetudo_load_[0-9a-f]{32}$/.test(process.env.DB_NAME),
    'The load-test API requires an isolated schema and the benchmark parent process.');
  const fs = await import('node:fs');
  const keyPath = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
  const exists = fs.default.existsSync;
  fs.default.existsSync = path => path !== keyPath && exists(path);
  const { createApp, createOriginCheck, mountApiRoutes } = await import('../src/app.js');
  fs.default.existsSync = exists;
  const { pool, sosPool } = await import('../src/db/pool.js');
  const { runMigrations } = await import('../src/db/migrate.js');
  const { attachRealtime } = await import('../src/realtime/socket.js');
  const { startScheduler } = await import('../src/workers/scheduler.js');
  const { dispatchPendingSos } = await import('../src/emergency/sosDispatch.js');
  const { drainServer } = await import('../src/bootstrap/shutdown.js');
  const { closeDependencies } = await import('../src/bootstrap/dependencies.js');
  const { loadMetrics } = await import('../src/bootstrap/loadMetrics.js');
  await runMigrations(pool);
  if (process.env.VALETUDO_BENCHMARK_REDIS_PORT) {
    const { initRedis, isRedisActive } = await import('../src/utils/redisClient.js');
    await initRedis();
    assert(isRedisActive(), 'The requested benchmark Redis instance did not become ready.');
  }
  let waits = [];
  let enqueued = 0;
  let sosDeadlocks = 0;
  const logError = console.error.bind(console);
  console.error = (message, ...details) => {
    if (message === '[SOS Submission]:' && details[0] === 'ER_LOCK_DEADLOCK') sosDeadlocks++;
    logError(message, ...details);
  };
  for (const poolCore of [pool.pool, sosPool.pool]) {
    const take = poolCore.getConnection;
    poolCore.on('enqueue', () => enqueued++);
    poolCore.getConnection = function (callback) {
      const started = performance.now();
      return take.call(this, (error, connection) => {
        waits.push(performance.now() - started);
        callback(error, connection);
      });
    };
  }
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  let peakRss = process.memoryUsage.rss();
  let rssSamples = [];
  let lastSampleAt = performance.now();
  const rssTimer = setInterval(() => {
    const rss = process.memoryUsage.rss();
    const now = performance.now();
    peakRss = Math.max(peakRss, rss);
    if (now - lastSampleAt >= 29_000) {
      rssSamples.push(round(rss / 2 ** 20));
      lastSampleAt = now;
    }
  }, 1000).unref();
  const isOriginAllowed = createOriginCheck();
  const app = createApp({ isOriginAllowed });
  const tlsKey = process.env.VALETUDO_BENCHMARK_TLS_KEY;
  const tlsCert = process.env.VALETUDO_BENCHMARK_TLS_CERT;
  assert(Boolean(tlsKey) === Boolean(tlsCert), 'Provide both benchmark TLS paths.');
  const server = tlsKey ? createSecureServer({ key: await readFile(tlsKey), cert: await readFile(tlsCert) }, app) : createServer(app);
  const io = attachRealtime(server, { isHttps: Boolean(tlsKey), isOriginAllowed });
  mountApiRoutes(app, io);
  const origin = await listen(server, tlsKey ? 'https' : 'http');
  const stopWorkers = startScheduler([{ name: 'SOS Dispatch Worker', intervalMs: 5000, run: () => dispatchPendingSos(io) }]);
  process.on('message', async command => {
    if (command === 'shutdown') {
      loop.disable();
      clearInterval(rssTimer);
      await drainServer({ io, stopWorkers, closeDependencies });
      process.disconnect();
    } else {
      const rss = process.memoryUsage.rss();
      const stats = { acquires: waits.length, enqueued, sosDeadlocks, connectionWaitMs: percentiles(waits),
        loopDelayP99Ms: round(loop.percentile(99) / 1e6), rssMiB: round(rss / 2 ** 20), peakRssMiB: round(Math.max(rss, peakRss) / 2 ** 20),
        rssSamples, serverLoad: loadMetrics() };
      waits = [];
      enqueued = 0;
      sosDeadlocks = 0;
      peakRss = rss;
      rssSamples = [];
      lastSampleAt = performance.now();
      loop.reset();
      process.send(stats);
    }
  });
  process.send(origin);
}

function operations(clinicDate) {
  const counts = new Map();
  return Array.from({ length: requestsPerStage }, (_, position) => {
    const name = workload[position % workload.length];
    const index = counts.get(name) ?? 0;
    counts.set(name, index + 1);
    const patient = patientBase + index;
    const doctor = doctorIds[index % doctorIds.length];
    const day = new Date(Date.parse(clinicDate) + (2 + Math.floor(index / 20)) * 86400000).toISOString().slice(0, 10);
    const routes = {
      queue: ['/appointments/queue/today', 3, 'NURSE'],
      history: ['/appointments/patient/5/history?limit=25', 2, 'DOCTOR'],
      analytics: ['/analytics/summary', 2, 'DOCTOR'],
      checkin: [`/appointments/${index + 1}/checkin`, 3, 'NURSE', { height: 165, weight: 63 }],
      booking: ['/appointments', patient, 'STUDENT', { doctor_user_id: doctor, date_time: `${day} 08:00:00`, appointment_type: 'General consultation' }],
      sos: ['/emergency/sos/requests', patient, 'STUDENT', { client_sos_id: randomUUID().replaceAll('-', ''), latitude: 16.0298, longitude: 120.2285 }],
    };
    return { name, index, route: routes[name] };
  });
}

function bearer(userId, role) {
  return jwt.sign({ purpose: 'HEALTHLINK_SESSION', auth_method: 'desktop_password', user_id: userId, roles: [role] }, fixtureJwt, { expiresIn: '10m' });
}

// Spread the original write mix across the paced run and fill intervening slots with reads.
function pacedOperations(clinicDate, total) {
  const baseline = operations(clinicDate);
  const queue = baseline.find(job => job.name === 'queue');
  const history = baseline.find(job => job.name === 'history');
  const analytics = baseline.find(job => job.name === 'analytics');
  const reads = [queue, queue, queue, history, history, history, queue, queue, queue, analytics];
  const jobs = Array.from({ length: total }, (_, index) => reads[index % reads.length]);
  baseline.forEach((job, index) => { jobs[Math.floor(index * total / baseline.length)] = job; });
  return jobs;
}

async function runRequests(origin, jobs, concurrency, rate) {
  const tokens = new Map();
  const results = [];
  const started = performance.now();
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < jobs.length) {
      const index = next++;
      const job = jobs[index];
      const planned = rate ? started + index * 1000 / rate : performance.now();
      const wait = planned - performance.now();
      if (wait > 0) await delay(wait);
      const [route, userId, role, payload] = job.route;
      if (!tokens.has(userId)) tokens.set(userId, bearer(userId, role));
      const sent = Date.now();
      const begin = performance.now();
      let status;
      let reason;
      let alertId;
      let snapshotAgeMs;
      try {
        const response = await fetch(origin + '/api' + route, {
          method: payload ? 'POST' : 'GET', body: payload ? JSON.stringify(payload) : undefined,
          headers: { authorization: 'Bearer ' + tokens.get(userId), 'content-type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        status = response.status;
        const body = Buffer.from(await response.arrayBuffer());
        if (!response.ok) {
          const error = JSON.parse(body.toString());
          reason = error.code ?? (String(error.error).startsWith('Deadlock found') ? 'ER_LOCK_DEADLOCK' : 'unclassified');
        } else if (job.name === 'sos') {
          alertId = JSON.parse(body.toString()).alertId;
        } else if (job.name === 'analytics') {
          const snapshot = response.headers.get('x-analytics-as-of');
          if (snapshot) snapshotAgeMs = Date.now() - Date.parse(snapshot);
        } else if (job.name === 'pdf' && body.subarray(0, 5).toString() !== '%PDF-') {
          reason = 'invalid PDF';
        }
      } catch (error) {
        reason = error.name;
      }
      results.push({ ...job, status: status ?? 'no_response', reason, alertId, snapshotAgeMs, sent, ms: performance.now() - begin,
        position: index, startLagMs: Math.max(0, begin - planned) });
    }
  }));
  const seconds = (performance.now() - started) / 1000;
  const summarized = {};
  for (const name of new Set(jobs.map(job => job.name))) {
    const rows = results.filter(row => row.name === name);
    const ok = rows.filter(row => row.status >= 200 && row.status < 300 && !row.reason);
    const statuses = {};
    for (const row of rows) {
      const key = row.status + (row.reason ? ' ' + row.reason : '');
      statuses[key] = (statuses[key] ?? 0) + 1;
    }
    summarized[name] = { statuses, okMs: percentiles(ok.map(row => row.ms)) };
    if (name === 'analytics') {
      summarized[name].snapshotAgeMs = percentiles(ok.flatMap(row => Number.isFinite(row.snapshotAgeMs) ? [row.snapshotAgeMs] : []));
    }
  }
  const intervals = rate ? Array.from({ length: Math.ceil(jobs.length / rate / 60) }, (_, minute) => {
    const rows = results.filter(row => Math.floor(row.position / (60 * rate)) === minute);
    const success = rows.filter(row => row.status >= 200 && row.status < 300 && !row.reason);
    return { minute: minute + 1, finished: rows.length, failed: rows.length - success.length,
      okMs: percentiles(success.map(row => row.ms)), startLagMs: percentiles(rows.map(row => row.startLagMs)) };
  }) : undefined;
  return { results, summarized, throughput: round(results.length / seconds), seconds: round(seconds), intervals };
}

async function measure(port, password, concurrency, repeat, paced) {
  const database = 'valetudo_load_' + randomUUID().replaceAll('-', '');
  const admin = await mysql.createConnection({ host: loopback, port, user: 'root', password, multipleStatements: true });
  const storage = storageFixture();
  let child;
  let socket;
  try {
    const s3Endpoint = await listen(storage.server);
    const clinicDate = await seed(admin, database);
    const requireFromDesktop = createRequire(new URL('../../desktop/package.json', import.meta.url));
    const { io: connect } = requireFromDesktop('socket.io-client');
    child = fork(fileURLToPath(import.meta.url), ['--serve'], { silent: true, env: {
      ...process.env, DB_HOST: loopback, DB_PORT: String(port), DB_USER: 'root', DB_PASSWORD: password, DB_NAME: database,
      JWT_SECRET: fixtureJwt, S3_ENDPOINT: s3Endpoint, S3_BUCKET: 'load-test', S3_ACCESS_KEY: 'test-access', S3_SECRET_KEY: 'test-secret',
      SMTP_HOST: '', SMTP_USER: '', GOOGLE_MAPS_API_KEY: '', PUBLIC_API_BASE_URL: 'http://127.0.0.1',
      ANALYTICS_BATCH_SIZE: '1000', ANALYTICS_CACHE_TTL: '600',
      REDIS_HOST: loopback, REDIS_PORT: process.env.VALETUDO_BENCHMARK_REDIS_PORT ?? '6379',
      REDIS_PASSWORD: process.env.VALETUDO_BENCHMARK_REDIS_PASSWORD ?? '',
    } });
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    child.stdout.resume();
    const [origin] = await Promise.race([
      once(child, 'message', { signal: AbortSignal.timeout(20_000) }),
      once(child, 'exit').then(([code]) => { throw new Error(`API child exited early (${code})`); }),
    ]);
    socket = connect(origin, { transports: ['websocket'], reconnection: false, timeout: 5000, auth: { token: bearer(4, 'EMERGENCY_RESPONDER') } });
    const wsEvents = new Map();
    socket.on('emergency:new_alert', ({ alertId }) => {
      const times = wsEvents.get(alertId) ?? [];
      times.push(Date.now());
      wsEvents.set(alertId, times);
    });
    await Promise.race([once(socket, 'connect'), once(socket, 'connect_error').then(([error]) => Promise.reject(error))]);
    const analyticsWave = Array.from({ length: 16 }, (_, index) => ({ name: 'analytics', index, route: ['/analytics/summary', 2, 'DOCTOR'] }));
    await runRequests(origin, [{ name: 'queue', route: ['/appointments/queue/today', 3, 'NURSE'] }], 1);
    const stats = async () => {
      child.send('measure');
      return (await once(child, 'message', { signal: AbortSignal.timeout(5000) }))[0];
    };
    const initialStats = await stats();
    const cold = await runRequests(origin, analyticsWave, 16);
    const coldStats = await stats();
    const warm = await runRequests(origin, analyticsWave, 16);
    const warmStats = await stats();
    const jobs = paced ? pacedOperations(clinicDate, paced.seconds * paced.rate) : operations(clinicDate);
    const mixed = await runRequests(origin, jobs, concurrency, paced?.rate);
    const mixedStats = await stats();
    const [[engine]] = await admin.query('SHOW ENGINE INNODB STATUS');
    const latestDeadlock = engine.Status.split('LATEST DETECTED DEADLOCK')[1]?.split('TRANSACTIONS')[0] ?? '';
    const auditTailDeadlock = latestDeadlock.includes(database) && latestDeadlock.includes('INSERT INTO AUDIT_LOGS') &&
      latestDeadlock.includes('SELECT entry_hash FROM AUDIT_LOGS ORDER BY audit_id DESC LIMIT 1 FOR UPDATE');
    const expected = mixed.results.filter(row => row.alertId);
    const deadline = Date.now() + 16_000;
    while (expected.some(row => !wsEvents.has(row.alertId)) && Date.now() < deadline) await delay(50);
    const [[persisted]] = await admin.query(`SELECT
      (SELECT COUNT(*) FROM APPOINTMENTS WHERE appointment_id > 120) AS bookings,
      (SELECT COUNT(*) FROM QUEUE) AS tickets,
      (SELECT COUNT(*) FROM EMERGENCY_ALERTS) AS alerts,
      (SELECT COUNT(*) FROM EMERGENCY_ALERTS WHERE dispatch_after IS NOT NULL) AS pendingAlerts,
      (SELECT COUNT(*) FROM AUDIT_LOGS) AS auditEntries,
      (SELECT COUNT(*) FROM (SELECT prev_hash, LAG(entry_hash) OVER (ORDER BY audit_id) AS prior FROM AUDIT_LOGS) history
        WHERE prior IS NOT NULL AND prior <> prev_hash) AS auditLinkMismatches`);
    const pdfJobs = Array.from({ length: 16 }, (_, index) => ({ name: 'pdf', index, route: ['/documents/clearances/1/pdf', 5, 'STUDENT'] }));
    const coldPdf = await runRequests(origin, pdfJobs, 16);
    const pdfWrites = storage.counts.PUT;
    const pdfDeletes = storage.counts.DELETE;
    const warmPdf = await runRequests(origin, pdfJobs, 16);
    return { concurrency, repeat, paced, initialRssMiB: initialStats.rssMiB,
      mixed: { seconds: mixed.seconds, reqPerSecond: mixed.throughput, ...mixedStats, auditTailDeadlock, routes: mixed.summarized, intervals: mixed.intervals },
      coldAnalytics: { ...cold.summarized.analytics, ...coldStats }, warmAnalytics: { ...warm.summarized.analytics, ...warmStats },
      sos: { accepted: expected.length, received: expected.filter(row => wsEvents.has(row.alertId)).length,
        duplicates: [...wsEvents.values()].reduce((total, times) => total + times.length - 1, 0),
        requestToSocketMs: percentiles(expected.flatMap(row => wsEvents.has(row.alertId) ? [wsEvents.get(row.alertId)[0] - row.sent] : [])) },
      persisted, coldPdf: { ...coldPdf.summarized.pdf, uploads: pdfWrites, redundantObjectsDeleted: pdfDeletes, stored: storage.objects.size },
      warmPdf: warmPdf.summarized.pdf };
  } finally {
    socket?.disconnect();
    if (child?.connected) {
      const closed = once(child, 'exit');
      child.send('shutdown');
      const exited = await Promise.race([closed.then(() => true), delay(5000, false, { ref: false })]);
      if (!exited) { child.kill(); await closed; }
    }
    await admin.query('DROP DATABASE IF EXISTS ??', [database]);
    await admin.end();
    await new Promise(resolve => storage.server.close(resolve));
  }
}

if (process.argv[2] === '--serve') {
  await serve();
} else {
  const mysqlPort = Number(process.env.VALETUDO_MIGRATION_TEST_PORT);
  const password = process.env.VALETUDO_MIGRATION_TEST_PASSWORD;
  assert(mysqlPort >= 1024 && mysqlPort < 65536 && password, 'Set the port and root password for a disposable local MySQL instance.');
  Object.assign(process.env, { ENCRYPTION_KEY: 'synthetic-load-secret-' + randomUUID(), ENCRYPTION_SALT: 'synthetic-load-salt' });
  const [levels = '1,8,24', repeats = '1', soak, duration, rate] = process.argv.slice(2);
  const concurrency = levels.split(',').map(Number);
  assert(concurrency.every(level => Number.isInteger(level) && level > 0 && level <= 64));
  assert(Number.isInteger(+repeats) && +repeats > 0 && +repeats <= 10);
  let paced;
  if (soak) {
    assert(soak === '--soak' && Number.isInteger(+duration) && Number.isInteger(+rate) &&
      +duration >= 60 && +duration <= 1800 && +rate > 0 && +rate <= 100 && +duration * +rate >= requestsPerStage,
      'Use --soak <seconds, 60–1800> <requests per second, 1–100> with at least 800 total requests.');
    paced = { seconds: +duration, rate: +rate };
  }
  console.log(JSON.stringify({ node: process.version, cpu: cpus()[0].model.trim(), threads: availableParallelism(), gibRam: Math.round(totalmem() / 2 ** 30), patientCount, historyCount, requestsPerStage }));
  for (let repeat = 1; repeat <= +repeats; repeat++) {
    for (const level of concurrency) console.log(JSON.stringify(await measure(mysqlPort, password, level, repeat, paced)));
  }
}
