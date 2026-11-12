import assert from 'node:assert/strict';
import fs from 'node:fs';
import { once } from 'node:events';
import { after, before, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

Object.assign(process.env, {
  DB_PASSWORD: 'fixture-password',
  JWT_SECRET: 'fixture-jwt-secret'.repeat(3),
  ENCRYPTION_KEY: 'fixture-encryption-key'.repeat(3),
  ENCRYPTION_SALT: 'fixture-encryption-salt',
  S3_ACCESS_KEY: 'fixture-access',
  S3_SECRET_KEY: 'fixture-secret',
  CORS_ALLOWED_ORIGINS: '',
});

const keyPath = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
const existsSync = fs.existsSync;
const hideKey = mock.method(fs, 'existsSync', filename => filename !== keyPath && existsSync(filename));
let createApp, mountApiRoutes;
try {
  ({ createApp, mountApiRoutes } = await import('../src/app.js'));
} finally {
  hideKey.mock.restore();
}
const { pool } = await import('../src/db/pool.js');

let listener;
let baseUrl;
before(async () => {
  const app = createApp();
  mountApiRoutes(app, {
    emit() { assert.fail('Read-only fixture unexpectedly broadcast an event'); },
    to() { assert.fail('Read-only fixture unexpectedly targeted a realtime room'); },
  });
  listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  baseUrl = 'http://127.0.0.1:' + listener.address().port;
});
after(async () => {
  if (listener?.listening) await new Promise((resolve, reject) => {
    listener.close(error => error ? reject(error) : resolve());
  });
  await pool.end();
});

const request = (path, { roles, userId = 21, method = 'GET', headers = {} } = {}) => {
  if (roles) {
    const token = jwt.sign({ user_id: userId, roles }, process.env.JWT_SECRET, { expiresIn: '5m' });
    headers = { ...headers, authorization: 'Bearer ' + token };
  }
  return fetch(baseUrl + path, { method, headers });
};

test('the mounted liveness route applies the HTTP allow-list and security headers', async t => {
  t.mock.method(pool, 'query', () => assert.fail('Liveness probe accessed MySQL'));
  t.mock.method(console, 'warn', () => {});
  for (const [origin, allowed] of [['http://localhost:5173', true], ['https://other.invalid', false]]) {
    const response = await request('/api/ping', { headers: { origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), allowed ? origin : null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal((await response.json()).ok, true);
  }
});

test('public QR verification serves HTML and privacy-minimized JSON', async t => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /FROM MEDICAL_CLEARANCES/);
    assert.deepEqual(params, ['fixture-qr']);
    return [[{
      purpose: 'Fixture clearance', status: 'approved', issued_at: '2026-01-01',
      expires_at: '2099-01-01', signature_metadata: '{"signer_role":"DOCTOR"}',
      patient_first_name: 'Fixture', patient_last_name: 'Surname',
      doc_first_name: 'Fixture', doc_last_name: 'Clinician',
    }]];
  });
  const route = '/api/documents/verify/fixture-qr';
  const html = await request(route, { headers: { accept: 'text/html' } });
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(await html.text(), /<!doctype html>/i);
  const json = await request(route, { headers: { accept: 'application/json' } });
  assert.equal(json.status, 200);
  const data = await json.json();
  assert.equal(data.valid, true);
  assert.equal(data.patient, 'Fixture S.');
  assert.equal(data.studentNo, 'N/A');
});

test('attachment downloads require authentication and enforce ownership', async t => {
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /FROM EMR_ATTACHMENTS/);
    return [[{ attachment_id: 7, patient_user_id: 42, mime_type: 'application/pdf' }]];
  });
  const route = '/api/documents/attachments/7/download';
  const anonymous = await request(route);
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error, 'Access token required.');
  const otherPatient = await request(route, { roles: ['STUDENT'] });
  assert.equal(otherPatient.status, 403);
  await otherPatient.json();
});

test('the mounted server policy checks the live Super Admin grant', async t => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /FROM ADMIN_PERMISSIONS/);
    return [[{ code: params[0] === 22 ? 'SUPER_ADMIN' : 'USERS_MANAGE' }]];
  });
  const route = '/api/admin/server-policy';
  const anonymous = await request(route);
  assert.equal(anonymous.status, 401);
  await anonymous.json();
  const limited = await request(route, { roles: ['ADMIN', 'DOCTOR'] });
  assert.equal(limited.status, 403);
  assert.match((await limited.json()).error, /requires Super Admin/);
  const superAdmin = await request(route, { roles: ['ADMIN'], userId: 22 });
  assert.equal(superAdmin.status, 200);
  assert.equal(superAdmin.headers.get('cache-control'), 'no-store');
  assert.ok(Number.isInteger((await superAdmin.json()).version));
});

test('the mounted history route retains role checks and paging validation', async t => {
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /FROM EMR_RECORDS|INSERT INTO PHI_ACCESS_LOGS/);
    return [[]];
  });
  const route = '/api/appointments/patient/42/history';
  const forbidden = await request(route, { roles: ['STUDENT'] });
  assert.equal(forbidden.status, 403);
  await forbidden.json();
  const invalid = await request(route + '?limit=0', { roles: ['DOCTOR'] });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /limit/);
  const page = await request(route + '?limit=2', { roles: ['DOCTOR'] });
  assert.equal(page.status, 200);
  assert.deepEqual(await page.json(), { records: [], nextCursor: null });
});

test('the feature routes are mounted behind authentication', async () => {
  for (const [method, path] of [
    ['POST', '/api/emergency/sos'],
    ['GET', '/api/emergency/active'],
    ['GET', '/api/emergency/incident-reports'],
    ['GET', '/api/analytics/summary'],
    ['GET', '/api/analytics/export/csv'],
    ['GET', '/api/inventory/batches'],
    ['POST', '/api/inventory/receive'],
    ['POST', '/api/inventory/medicines'],
    ['POST', '/api/inventory/deduct'],
    ['POST', '/api/documents/prescriptions'],
    ['GET', '/api/documents/prescriptions/my'],
    ['PATCH', '/api/documents/prescriptions/7/cancel'],
  ]) {
    const response = await request(path, { method });
    assert.equal(response.status, 401, method + ' ' + path);
    await response.json();
  }
});
