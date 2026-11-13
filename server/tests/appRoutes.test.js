import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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

const request = (path, { roles, userId = 21, method = 'GET', headers = {}, json } = {}) => {
  if (roles) {
    const token = jwt.sign({ user_id: userId, roles }, process.env.JWT_SECRET, { expiresIn: '5m' });
    headers = { ...headers, authorization: 'Bearer ' + token };
  }
  const body = json === undefined ? undefined : JSON.stringify(json);
  if (body !== undefined) headers = { ...headers, 'content-type': 'application/json' };
  return fetch(baseUrl + path, { method, headers, body });
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
  const cwd = process.cwd();
  try {
    // The verify page must resolve from the module when cwd is unrelated.
    process.chdir(os.tmpdir());
    const html = await request(route, { headers: { accept: 'text/html' } });
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type'), /text\/html/);
    assert.match(await html.text(), /<!doctype html>/i);
  } finally {
    process.chdir(cwd);
  }
  const json = await request(route, { headers: { accept: 'application/json' } });
  assert.equal(json.status, 200);
  const data = await json.json();
  assert.equal(data.valid, true);
  assert.equal(data.patient, 'Fixture S.');
  assert.equal(data.studentNo, 'N/A');
});

test('protected routes reject inactive accounts before doing clinical work', async t => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /SELECT is_active, deleted_at FROM USERS/);
    assert.deepEqual(params, [21]);
    return [[{ is_active: 0, deleted_at: null }]];
  });
  const response = await request('/api/documents/verify/fixture-qr/details', { roles: ['DOCTOR'] });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'ACCOUNT_INACTIVE');
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

test('attachment tokens are bound to one file and consumed once', async t => {
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /FROM EMR_ATTACHMENTS/);
    return [sql.includes('a.s3_key') ? [] : [{ attachment_id: 7, patient_user_id: 21 }]];
  });
  const response = await request('/api/documents/attachments/7/download-token', { method: 'POST', roles: ['STUDENT'] });
  assert.equal(response.status, 200);
  const { downloadUrl } = await response.json();
  const wrongFile = await request(downloadUrl.replace('/7/download', '/8/download'));
  assert.equal(wrongFile.status, 403);
  await wrongFile.json();
  const firstUse = await request(downloadUrl);
  assert.equal(firstUse.status, 404);
  assert.equal((await firstUse.json()).error, 'Attachment not found.');
  const repeated = await request(downloadUrl);
  assert.equal(repeated.status, 401);
  assert.match((await repeated.json()).error, /already used/);
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
    ['GET', '/api/documents/verify/fixture-qr/details'],
    ['GET', '/api/appointments/lookup'],
    ['POST', '/api/appointments/7/checkin'],
    ['POST', '/api/appointments/walk-in'],
    ['GET', '/api/appointments/patient/7/active-ticket'],
    ['GET', '/api/appointments/slots'],
    ['POST', '/api/appointments'],
    ['PATCH', '/api/appointments/7/cancel'],
    ['GET', '/api/profile/me'],
    ['PUT', '/api/profile/me'],
    ['PUT', '/api/profile/theme'],
    ['POST', '/api/profile/fcm-token'],
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

test('admin role and account updates require the live user-management permission', async t => {
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /FROM ADMIN_PERMISSIONS/);
    return [[{ code: 'AUDIT_VIEW' }]];
  });
  t.mock.method(pool, 'getConnection', () => assert.fail('Denied admin opened a transaction'));

  for (const [method, path] of [
    ['PATCH', '/api/admin/users/7/role'],
    ['PUT', '/api/admin/users/7'],
  ]) {
    const response = await request(path, { method, roles: ['ADMIN'] });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).requiredPermission, 'USERS_MANAGE');
  }
});

test('Database Studio enforces its grant and blocks protected writes before opening a transaction', async t => {
  t.mock.method(pool, 'query', async (sql, [userId]) => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /FROM ADMIN_PERMISSIONS/);
    return [[{ code: userId === 21 ? 'DATABASE_MANAGE' : 'AUDIT_VIEW' }]];
  });
  t.mock.method(pool, 'getConnection', () => assert.fail('Denied write opened a transaction'));

  const admin = { roles: ['ADMIN'] };
  const denied = await request('/api/admin/db/tables', { ...admin, userId: 22 });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).requiredPermission, 'DATABASE_MANAGE');

  for (const method of ['POST', 'PUT', 'DELETE']) {
    const audit = await request('/api/admin/db/tables/AUDIT_LOGS/rows', { ...admin, method, json: {} });
    assert.equal(audit.status, 403);
    assert.match((await audit.json()).error, /append-only/);

    for (const table of ['USERS', 'users']) {
      const security = await request(`/api/admin/db/tables/${table}/rows`, { ...admin, method, json: {} });
      assert.equal(security.status, 403);
      assert.match((await security.json()).error, /Super Admin/);
    }
  }
});

test('Database Studio masks password hashes and logs PHI reads', async t => {
  const phiAccess = t.mock.fn();
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    if (sql.includes('FROM ADMIN_PERMISSIONS')) return [[{ code: 'DATABASE_MANAGE' }]];
    if (sql.includes('information_schema.TABLES')) return [[{ tableName: 'USERS', estimatedRows: 1 }]];
    if (sql.includes('information_schema.COLUMNS')) {
      return [[
        { columnName: 'user_id', dataType: 'bigint', columnKey: 'PRI' },
        { columnName: 'password_hash', dataType: 'varchar' },
      ]];
    }
    if (sql.includes('INSERT INTO PHI_ACCESS_LOGS')) {
      phiAccess(params.slice(0, 4));
      return [{}];
    }
    assert.ok(!params.includes('password_hash'), 'Search included a secret field');
    if (sql.includes('COUNT(*)')) return [[{ total: 1 }]];
    assert.match(sql, /SELECT \* FROM \?\?/);
    return [[{ user_id: 42, password_hash: 'fixture-secret-hash' }]];
  });
  const response = await request('/api/admin/db/tables/USERS?search=42', { roles: ['ADMIN'] });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.rows, [{ user_id: 42, password_hash: '[REDACTED]' }]);
  assert.equal(body.readOnlyReason, 'security');
  assert.deepEqual(phiAccess.mock.calls.map(call => call.arguments[0]), [[21, 42, 'USERS', 42]]);
});

test('Database Studio rolls back and releases when an audit write fails', async t => {
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /FROM ADMIN_PERMISSIONS/);
    return [[{ code: 'DATABASE_MANAGE' }]];
  });
  t.mock.method(console, 'error', () => {});
  const calls = [];
  t.mock.method(pool, 'getConnection', async () => ({
    async beginTransaction() { calls.push('begin'); },
    async commit() { assert.fail('Committed a failed audit write'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
    async query(sql) {
      if (sql.includes('information_schema.COLUMNS')) return [[{ name: 'name' }]];
      if (sql.includes('INSERT INTO ??')) {
        calls.push('insert');
        return [{ insertId: 4 }];
      }
      if (sql.includes('SELECT entry_hash')) return [[]];
      assert.match(sql, /INSERT INTO AUDIT_LOGS/);
      throw new Error('Fixture audit failure');
    },
  }));
  const response = await request('/api/admin/db/tables/MEDICINES/rows', {
    method: 'POST', roles: ['ADMIN'], json: { name: 'Fixture' },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Fixture audit failure');
  assert.deepEqual(calls, ['begin', 'insert', 'rollback', 'release']);
});
