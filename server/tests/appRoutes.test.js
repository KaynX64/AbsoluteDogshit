// Exercises mounted API routes with service doubles to verify permissions and response contracts.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { once } from 'node:events';
import { after, before, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { inflateSync } from 'node:zlib';
import ExcelJS from 'exceljs';

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

test('inventory expiry alerts and summary use a 30-day window', async t => {
  const expiryQueries = [];
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    if (sql.includes('CASE') && sql.includes('days_until_expiry')) {
      expiryQueries.push(sql);
      return [[{
        batch_id: 1, name: 'Fixture medicine', generic_name: 'Fixture generic',
        batch_no: 'Fixture batch', quantity_on_hand: 7, expiry_date: '2027-01-01',
        days_until_expiry: 2, alert_level: 'CRITICAL (<30d)',
      }]];
    }
    if (sql.includes('COALESCE(m.reorder_level')) return [[{ count: 0 }]];
    if (sql.includes('DATEDIFF(b.expiry_date, CURDATE()) <= 30')) {
      expiryQueries.push(sql);
      return [[{ count: 1 }]];
    }
    if (sql.includes('b.expiry_date <= CURDATE()')) return [[{ count: 0 }]];
    assert.fail(`Unexpected inventory query: ${sql}`);
  });

  const options = { roles: ['NURSE'] };
  const expiryResponse = await request('/api/inventory/expiring-soon', options);
  assert.equal(expiryResponse.status, 200);
  assert.equal((await expiryResponse.json()).length, 1);
  const summaryResponse = await request('/api/inventory/dashboard-summary', options);
  assert.equal(summaryResponse.status, 200);
  assert.equal((await summaryResponse.json()).expiringSoonCount, 1);
  assert.equal(expiryQueries.length, 2);
  for (const sql of expiryQueries) {
    assert.match(sql, /DATEDIFF\(b\.expiry_date, CURDATE\(\)\) <= 30/);
    assert.doesNotMatch(sql, /DATEDIFF\(b\.expiry_date, CURDATE\(\)\) <= 90/);
  }
});

test('analytics headcount scope skips all other loaders and limits every report format', async t => {
  let codes = ['ANALYTICS_VIEW', 'ANALYTICS_HEADCOUNT', 'ANALYTICS_EXPORT'];
  const unexpected = [];
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    if (sql.includes('AS permission_code')) return [codes.map(permission_code => ({ role_code: 'ADMIN', permission_code }))];
    if (sql.includes('SELECT r.code, r.name')) return [[{ code: 'STUDENT', name: 'Fixture headcount', count: 12 }]];
    unexpected.push(sql);
    throw new Error('Unexpected analytics query');
  });
  const roles = ['ADMIN', 'DOCTOR'];
  const analytics = (path) => request('/api/analytics/' + path, { roles });
  const summary = await analytics('summary');
  assert.equal(summary.status, 200);
  assert.deepEqual(await summary.json(), {
    scopes: ['ANALYTICS_HEADCOUNT', 'ANALYTICS_EXPORT'],
    operations: null, clinical: null, pharmacy: null,
    headcount: { roleDistribution: [{ role_code: 'STUDENT', role_name: 'Fixture headcount', count: 12 }] },
  });
  assert.equal((await analytics('by-department')).status, 403);
  assert.deepEqual(await (await analytics('report-access')).json(), { scopes: ['ANALYTICS_HEADCOUNT', 'ANALYTICS_EXPORT'] });
  const csv = await analytics('export/csv');
  assert.equal(csv.status, 200);
  const csvText = await csv.text();
  assert.match(csvText, /SECTION 1: CAMPUS ROLES & USER HEADCOUNT[\s\S]*Fixture headcount/);
  assert.doesNotMatch(csvText, /SECTION 2|DIAGNOSES|DEPARTMENT|PHARMACY/);
  const excel = await analytics('export/excel');
  assert.equal(excel.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await excel.arrayBuffer());
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Campus Headcount']);
  const pdf = await analytics('export/pdf');
  assert.equal(pdf.status, 200);
  const pdfText = await readPdfText(pdf);
  assert.match(pdfText, /CAMPUS ROLES & USER HEADCOUNT/);
  assert.doesNotMatch(pdfText, /DIAGNOSES|DEPARTMENT|PHARMACY/);

  codes = ['ANALYTICS_VIEW', 'ANALYTICS_HEADCOUNT'];
  for (const path of ['report-access', 'export/csv', 'export/excel', 'export/pdf']) {
    assert.equal((await analytics(path)).status, 403, path);
  }
  codes = ['ANALYTICS_VIEW', 'ANALYTICS_EXPORT'];
  assert.equal((await analytics('report-access')).status, 403);
  codes = ['USERS_MANAGE'];
  assert.equal((await analytics('summary')).status, 403);
  assert.deepEqual(unexpected, []);
});

async function readPdfText(response) {
  const body = Buffer.from(await response.arrayBuffer()).toString('latin1');
  const streams = [...body.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  return streams.flatMap(([, stream]) => {
    try {
      const operators = inflateSync(Buffer.from(stream, 'latin1')).toString();
      return [...operators.matchAll(/<([a-f0-9]+)>/gi)].map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'));
    } catch { return []; }
  }).join('');
}

test('analytics report permissions map staff and Super Admin roles independently of the dashboard', async t => {
  let codes = [];
  let liveRoles = [];
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /AS permission_code/);
    return [liveRoles.flatMap(role_code => role_code === 'ADMIN' && codes.length
      ? codes.map(permission_code => ({ role_code, permission_code })) : [{ role_code }])];
  });
  const common = ['ANALYTICS_OPERATIONS', 'ANALYTICS_EXPORT', 'ANALYTICS_SURVEILLANCE', 'ANALYTICS_DISPENSING'];
  const clinical = [...common, 'ANALYTICS_CLINICAL'];
  const all = [...clinical, 'ANALYTICS_PHARMACY', 'ANALYTICS_HEADCOUNT'];
  const token = jwt.sign({ user_id: 21, roles: ['ADMIN'] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const session = { headers: { authorization: 'Bearer ' + token } };
  for (const [roles, expected] of [
    [['DOCTOR'], clinical],
    [['DENTIST'], clinical],
    [['NURSE'], [...common, 'ANALYTICS_PHARMACY']],
    [['NURSE', 'DENTIST'], [...clinical, 'ANALYTICS_PHARMACY']],
    [['ADMIN'], all],
  ]) {
    liveRoles = roles;
    const response = await request('/api/analytics/report-access', session);
    assert.equal(response.status, 200);
    assert.deepEqual(new Set((await response.json()).scopes), new Set(expected));
  }
  codes = ['SUPER_ADMIN'];
  assert.equal((await request('/api/analytics/report-access', session)).status, 200);
  liveRoles = ['STUDENT'];
  assert.equal((await request('/api/analytics/summary', session)).status, 403);
});

test('analytics outputs contain only the live clinical and pharmacy subsections', async t => {
  let role = 'NURSE';
  const unexpected = [];
  const reject = sql => { unexpected.push(sql); throw new Error('Unexpected analytics query'); };
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    if (sql.includes('AS permission_code')) return [[{ role_code: role }]];
    if (sql.includes('WITH RECURSIVE calendar') || sql.includes('SELECT department, COUNT')) return [[]];
    if (sql.includes('as total FROM APPOINTMENTS')) return [[{ total: 0 }]];
    if (sql.includes('as total_students')) return [[{ total_students: 0 }]];
    if (sql.includes('as active,')) return [[{ active: 0, timedClosures: 0, avgResponseSeconds: 0 }]];
    if (sql.includes('SELECT diagnosis, encounter_date')) return [[{ diagnosis: 'Fixture cough', encounter_date: new Date() }]];
    if (sql.includes('SELECT profile_id, chronic_conditions')) return [[]];
    if (sql.includes('SELECT emr_id, diagnosis')) return role === 'NURSE' ? reject(sql) : [[{ emr_id: 1, diagnosis: 'Private fixture diagnosis' }]];
    if (sql.includes('WITH reporting_window')) {
      assert.equal(sql.includes('AS reorder_rank'), role === 'NURSE');
      return [[{
        usage_rank: 1, reorder_rank: 1, medicine_id: 1, name: 'Fixture medicine', availability: 'IN_STOCK',
        quantity_prescribed: 5, quantity_dispensed: 2, quantity_returned: 1, net_dispensed: 1,
        stock_status: 'CRITICAL_BUFFER', total_stock_on_hand: 7, suggested_reorder_qty: 23, reorder_level: 15,
      }]];
    }
    if (sql.includes('FROM MEDICINE_BATCHES b')) {
      return role !== 'NURSE' ? reject(sql) : [[{ name: 'Fixture medicine', batch_no: 'SecretBatch', quantity_on_hand: 7, expiry_date: '2027-01-01' }]];
    }
    return reject(sql);
  });
  const analytics = path => request('/api/analytics/' + path, { roles: ['DOCTOR'] });
  for (role of ['NURSE', 'DOCTOR', 'DENTIST']) {
    const nurse = role === 'NURSE';
    const summary = await analytics('summary');
    assert.equal(summary.status, 200, role);
    const data = await summary.json();
    assert.equal(data.clinical.surveillance.fluStats.cases_past_7_days, 1);
    assert.equal(data.clinical.topDiagnoses?.[0]?.diagnosis ?? null, nurse ? null : 'Private fixture diagnosis');
    assert.equal(data.pharmacy.dispensing[0].availability, 'IN_STOCK');
    assert.equal(Object.hasOwn(data.pharmacy.dispensing[0], 'total_stock_on_hand'), false);
    assert.equal(data.pharmacy.inventory?.lowStockMeds[0]?.batch_no ?? null, nurse ? 'SecretBatch' : null);
    assert.equal((await analytics('by-department')).status, 200);
    for (const format of ['csv', 'excel', 'pdf']) {
      const response = await analytics('export/' + format);
      assert.equal(response.status, 200, role + ' ' + format);
      let content;
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await response.arrayBuffer());
        content = workbook.worksheets.flatMap(sheet => [sheet.name, JSON.stringify(sheet.getSheetValues())]).join('\n');
      } else {
        content = format === 'pdf' ? await readPdfText(response) : await response.text();
      }
      assert.match(content, /respiratory surveillance/i);
      assert.match(content, /in stock/i);
      assert.equal(content.includes('Private fixture diagnosis'), !nurse);
      assert.equal(content.includes('SecretBatch'), nurse);
      assert.equal(/reorder priorities/i.test(content), nurse);
      assert.doesNotMatch(content, /campus (?:roles|headcount)/i);
    }
  }
  assert.deepEqual(unexpected, []);
});

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
    ['GET', '/api/analytics/report-access'],
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


test('audit pagination keeps the array contract and applies the cursor under the live grant', async t => {
  const queries = [];
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    if (sql.includes('FROM USER_ROLES') && !sql.includes('FROM PHI_ACCESS_LOGS')) return [[{ code: 'ADMIN' }]];
    if (sql.includes('FROM ADMIN_PERMISSIONS')) return [[{ code: 'AUDIT_VIEW' }]];
    if (sql.includes('FROM PHI_ACCESS_LOGS') || sql.includes('FROM AUDIT_LOGS')) {
      queries.push({ sql, params });
      return [[{ id: 8 }]];
    }
    assert.fail('Unexpected audit query');
  });
  for (const path of ['/api/admin/audit-logs', '/api/admin/phi-access-logs']) {
    const session = { roles: ['ADMIN'] };
    assert.equal((await request(path + '?before=0', session)).status, 400);
    const result = await request(path + '?before=9&limit=1', session);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), [{ id: 8 }]);
  }
  assert.deepEqual(queries.map(query => query.params), [['9', 1], ['9', 1]]);
  assert.match(queries[0].sql, /WHERE a.audit_id < \?/);
  assert.match(queries[1].sql, /WHERE p.access_id < \?/);
  assert.match(queries[1].sql, /GROUP_CONCAT/);
});


test('connected users is restricted to admins with telemetry access', async t => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    if (sql.includes('FROM ADMIN_PERMISSIONS')) return [[{ code: params[0] === 22 ? 'TELEMETRY_VIEW' : 'AUDIT_VIEW' }]];
    assert.fail('Unexpected presence query');
  });
  const path = '/api/admin/connected-users';
  assert.equal((await request(path)).status, 401);
  assert.equal((await request(path, { roles: ['NURSE'] })).status, 403);
  assert.equal((await request(path, { roles: ['ADMIN'] })).status, 403);
  const response = await request(path, { roles: ['ADMIN'], userId: 22 });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).sessions, []);
});


test('server console grants diagnostics separately from Super Admin restart access', async t => {
  const { s3 } = await import('../src/utils/s3Vault.js');
  t.mock.method(s3, 'send', async () => ({ $response: { headers: { 'x-minio-version': 'fixture-release' } } }));
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.sql === 'SELECT VERSION() AS version') return [[{ version: 'fixture-mysql' }]];
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    if (sql.includes('FROM USER_ROLES')) {
      if (params[0] === 23) return [[]];
      if (params[0] === 24) return [[{ code: 'TERMINAL_VIEW' }]];
      return [[{ code: params[0] === 22 ? 'SUPER_ADMIN' : 'TELEMETRY_VIEW' }]];
    }
    assert.fail('Unexpected operations query');
  });
  const path = '/api/admin/operations';
  assert.equal((await request(path, { roles: ['ADMIN'] })).status, 403);
  const formerAdmin = { roles: ['ADMIN'], userId: 23 };
  assert.equal((await request(path, formerAdmin)).status, 403);
  assert.equal((await request(path + '/restart', { ...formerAdmin, method: 'POST', json: {} })).status, 403);
  const terminalViewer = { roles: ['ADMIN'], userId: 24 };
  const limitedStatus = await request(path, terminalViewer);
  assert.equal(limitedStatus.status, 200);
  const { restartAuthorized, restartAvailable } = await limitedStatus.json();
  assert.equal(restartAuthorized, false);
  assert.equal(restartAvailable, false);
  assert.equal((await request(path + '/command', { ...terminalViewer, method: 'POST', json: { command: 'memory' } })).status, 200);
  assert.equal((await request(path + '/restart', { ...terminalViewer, method: 'POST' })).status, 403);
  const admin = { roles: ['ADMIN'], userId: 22 };
  const status = await request(path, admin);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).restartAuthorized, true);
  const result = await request(path + '/command', { ...admin, method: 'POST', json: { command: 'status' } });
  assert.equal(result.status, 200);
  const { output } = await result.json();
  assert.ok(output.instanceId);
  assert.match(output.serverVersion, /^\d+\./);
  assert.equal(output.mysql.version, 'fixture-mysql');
  assert.equal(output.minio.version, 'fixture-release');
  assert.equal(output.redis.status, 'Fallback');
  assert.equal(output.overall, 'Degraded');
  assert.equal(output.ram.usedBytes + output.ram.availableBytes, output.ram.totalBytes);
  assert.equal((await request(path + '/command', { ...admin, method: 'POST', json: { command: 'constructor' } })).status, 400);
  assert.equal((await request(path + '/restart', { ...admin, method: 'POST', json: {} })).status, 409);
});
