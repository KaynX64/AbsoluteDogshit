// Exercises mounted API routes with service doubles to verify permissions and response contracts.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { once } from 'node:events';
import { after, before, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { inflateSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { OAuth2Client } from 'google-auth-library';

Object.assign(process.env, {
  DB_PASSWORD: 'fixture-password',
  JWT_SECRET: 'fixture-jwt-secret'.repeat(3),
  ENCRYPTION_KEY: 'fixture-encryption-key'.repeat(3),
  ENCRYPTION_SALT: 'fixture-encryption-salt',
  S3_ACCESS_KEY: 'fixture-access',
  S3_SECRET_KEY: 'fixture-secret',
  SMTP_HOST: '',
  CORS_ALLOWED_ORIGINS: '',
  MIXED_LOAD_CONTROLS: 'true',
  LOGIN_RATE_LIMIT_MAX: '30',
});

const keyPath = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
const existsSync = fs.existsSync;
// Hide the local Firebase credential when loading the test app.
const hideKey = mock.method(fs, 'existsSync', filename => filename !== keyPath && existsSync(filename));
let createApp, mountApiRoutes;
try {
  ({ createApp, mountApiRoutes } = await import('../src/app.js'));
} finally {
  hideKey.mock.restore();
}
const { pool } = await import('../src/db/pool.js');

const { loadAuthorizedAnalytics } = await import('../src/analytics/summary.js');
let readAnalyticsSnapshot = async scopes => ({ asOf: Date.now(), data: await loadAuthorizedAnalytics(scopes) });

let listener;
let baseUrl;
// Mount the real API with a read-only realtime double and open a test listener.
before(async () => {
  const app = createApp();
  mountApiRoutes(app, {
    // Fail if the read-only test API attempts to broadcast.
    emit() { assert.fail('Read-only fixture unexpectedly broadcast an event'); },
    // Fail if the read-only test API attempts to emit to a room.
    to() { assert.fail('Read-only fixture unexpectedly targeted a realtime room'); },
  }, { readAnalyticsSnapshot: scopes => readAnalyticsSnapshot(scopes) });
  listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  baseUrl = 'http://127.0.0.1:' + listener.address().port;
});
// Close the API test listener after the suite finishes.
after(async () => {
  if (listener?.listening) /* Wrap listener cleanup in a promise so the hook waits for it. */ await new Promise((resolve, reject) => {
    // Resolve when the fixture listener closes or surface a close error.
    listener.close(error => error ? reject(error) : resolve());
  });
  await pool.end();
});

// Make an HTTP request to the test API with an optional signed session and JSON body.
const request = (path, { roles, userId = 21, method = 'GET', headers = {}, json, signal } = {}) => {
  if (roles) {
    const token = jwt.sign({ purpose: 'HEALTHLINK_SESSION', auth_method: 'desktop_password', user_id: userId, roles }, process.env.JWT_SECRET, { expiresIn: '5m' });
    headers = { ...headers, authorization: 'Bearer ' + token };
  }
  const body = json === undefined ? undefined : JSON.stringify(json);
  if (body !== undefined) headers = { ...headers, 'content-type': 'application/json' };
  return fetch(baseUrl + path, { method, headers, body, signal });
};

test('mobile Google login verifies the token audience and workspace before linking an existing account', async t => {
  const audience = 'healthlink.apps.googleusercontent.com';
  const originalAudience = process.env.GOOGLE_OAUTH_CLIENT_ID;
  t.after(() => {
    if (originalAudience === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = originalAudience;
  });
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  const signIn = idToken => request('/api/auth/mobile/google', { method: 'POST', json: { idToken } });
  assert.equal((await signIn('signed-token')).status, 503);
  process.env.GOOGLE_OAUTH_CLIENT_ID = audience;
  const valid = { hd: 'psu.edu.ph', email_verified: true, email: 'Psu.User@PSU.EDU.PH', sub: 'psu-google-user' };
  const claimsByToken = {
    'personal': { ...valid, hd: undefined, email: 'person@gmail.com' },
    'non-workspace': { ...valid, hd: undefined },
    'unverified': { ...valid, email_verified: false },
    'look-alike': { ...valid, email: 'psu.user@psu.edu.ph.example.org' },
    'workspace': valid,
  };
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async ({ idToken, audience: received }) => {
    assert.equal(received, audience);
    if (!Object.hasOwn(claimsByToken, idToken)) throw new Error('Invalid token signature');
    return { getPayload: () => claimsByToken[idToken] };
  });
  assert.equal((await signIn('forged')).status, 401);
  for (const token of ['personal', 'non-workspace', 'unverified', 'look-alike']) {
    assert.equal((await signIn(token)).status, 403);
  }

  const { bindGoogleAccount } = await import('../src/auth/oauth/googleAccount.js');
  const { verifiedPsuIdentity } = await import('../src/auth/oauth/googleIdentity.js');
  const identity = verifiedPsuIdentity(valid);
  assert.deepEqual(identity, { email: 'psu.user@psu.edu.ph', subject: 'psu-google-user' });
  let user;
  let bindings = 0;
  let roleRows = [];
  const connection = {
    async query(sql, params) {
      if (sql.includes('FROM ROLES')) return [roleRows];
      if (sql.includes('FROM USERS WHERE email')) {
        assert.deepEqual(params, [identity.email]);
        return [[user].filter(Boolean)];
      }
      if (sql.startsWith('UPDATE USERS SET google_subject')) {
        assert.deepEqual(params, [identity.subject, 21]);
        user = { ...user, google_subject: identity.subject };
        bindings += 1;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SET SESSION') || sql.includes('FOR SHARE')) return [];
      if (sql.includes('SELECT last_entry_hash')) return [[{ last_entry_hash: '0'.repeat(64) }]];
      if (sql.includes('INSERT INTO AUDIT_LOGS')) return [{ insertId: 1 }];
      assert.match(sql, /^UPDATE AUDIT_CHAIN_STATE/);
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, destroy() {},
  };
  assert.equal(await bindGoogleAccount(connection, identity), null);
  const normal = { user_id: 21, email: identity.email, google_subject: null, is_active: 1, deleted_at: null };
  for (const change of [{ is_demo_account: 1 }, { is_active: 0 }, { deleted_at: new Date() }, { google_subject: 'other' }, { email: 'psu.usér@psu.edu.ph' }]) {
    user = { ...normal, ...change };
    assert.equal(await bindGoogleAccount(connection, identity), null);
  }
  assert.equal(bindings, 0);
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('FROM ROLES')) return [[{ code: 'STUDENT' }]];
    assert.match(sql, /^SELECT is_active,deleted_at,is_qualified_responder/);
    return [[]];
  });
  user = normal;
  assert.equal((await signIn('workspace')).status, 403);
  assert.equal(bindings, 0);
  roleRows = [{ code: 'STUDENT' }];
  const response = await signIn('workspace');
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal(session.auth_method, 'mobile_google');
  const decoded = jwt.verify(session.token, process.env.JWT_SECRET);
  assert.equal(decoded.purpose, 'HEALTHLINK_SESSION');
  assert.equal(decoded.user_id, 21);
  assert.deepEqual(decoded.roles, ['STUDENT']);
  assert.equal(decoded.auth_method, 'mobile_google');
  assert.equal((await signIn('workspace')).status, 200);
  assert.equal(bindings, 1);

  roleRows = [{ code: 'ADMIN' }];
  pool.query.mock.mockImplementation(async sql => {
    assert.match(sql, /FROM ADMIN_PERMISSIONS/);
    throw new Error('Fixture permission lookup unavailable');
  });
  const unavailable = await signIn('workspace');
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).token, undefined);
});

test('mobile demo login and desktop passwords cannot sign in regular patient accounts', async t => {
  const keys = ['NODE_ENV', 'ALLOW_MOBILE_DEMO_LOGIN', 'DB_HOST'];
  const original = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => {
    if (original[i] === undefined) delete process.env[key];
    else process.env[key] = original[i];
  }));
  const { mobileDemoLoginEnabled } = await import('../src/auth/loginPolicy.js');
  Object.assign(process.env, { NODE_ENV: 'production', ALLOW_MOBILE_DEMO_LOGIN: 'true', DB_HOST: '127.0.0.1' });
  const password = 'Fixture password';
  const email = 'patient@psu.edu.ph';
  const signIn = path => request(path, { method: 'POST', json: { email, password } });
  assert.equal((await signIn('/api/auth/mobile/demo')).status, 403);
  process.env.NODE_ENV = 'development';
  assert.equal(mobileDemoLoginEnabled({ ...process.env, DB_HOST: 'shared-mysql' }), false);
  const user = { user_id: 21, email, password_hash: await bcrypt.hash(password, 4), is_active: 1, deleted_at: null, is_demo_account: 0 };
  t.mock.method(pool, 'query', async sql => {
    if (sql.startsWith('SELECT is_active,deleted_at,is_qualified_responder')) return [[]];
    return sql.includes('FROM USERS') ? [[user]] : [[{ code: 'STUDENT' }]];
  });
  assert.equal((await signIn('/api/auth/mobile/demo')).status, 401);
  assert.equal((await signIn('/api/auth/login')).status, 403);
  user.is_demo_account = 1;
  t.mock.method(pool, 'getConnection', async () => ({
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql) {
      if (sql.includes('SELECT last_entry_hash')) return [[{ last_entry_hash: '0'.repeat(64) }]];
      return [{ insertId: 1 }];
    },
  }));
  const demo = await signIn('/api/auth/mobile/demo');
  assert.equal(demo.status, 200);
  const { token } = await demo.json();
  assert.equal(jwt.verify(token, process.env.JWT_SECRET).auth_method, 'mobile_demo');
  process.env.ALLOW_MOBILE_DEMO_LOGIN = 'false';
  const disabled = await request('/api/profile/me', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(disabled.status, 401);
});

test('Socket.IO rejects legacy sessions, unknown methods and attachment tokens', { timeout: 5000 }, async t => {
  const { createServer } = await import('node:http');
  const { attachRealtime } = await import('../src/realtime/socket.js');
  const server = createServer();
  const io = attachRealtime(server, { isOriginAllowed: () => true });
  t.after(() => new Promise(resolve => io.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/socket.io/?EIO=4&transport=polling';
  for (const claims of [{}, { purpose: 'EMR_ATTACHMENT_DOWNLOAD' }, { purpose: 'HEALTHLINK_SESSION', auth_method: 'unknown' }]) {
    const opening = await (await fetch(endpoint)).text();
    const session = endpoint + '&sid=' + JSON.parse(opening.slice(1)).sid;
    const token = jwt.sign({ user_id: 21, ...claims }, process.env.JWT_SECRET);
    await fetch(session, { method: 'POST', body: '40' + JSON.stringify({ token }) });
    assert.match(await (await fetch(session)).text(), /^44.*Session is no longer valid/);
  }
});

test('mobile session requires a primary mobile token and returns live roles before consent', async t => {
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1 }]];
    if (sql.includes('FROM ROLES')) return [[{ code: 'FACULTY' }]];
    assert.match(sql, /^SELECT is_active,deleted_at,is_qualified_responder/);
    return [[]];
  });
  const get = claims => request('/api/auth/mobile/session', { headers: {
    authorization: 'Bearer ' + jwt.sign({ user_id: 21, ...claims }, process.env.JWT_SECRET),
  } });
  for (const claims of [{}, { purpose: 'EMR_ATTACHMENT_DOWNLOAD' }, { purpose: 'HEALTHLINK_SESSION', auth_method: 'unknown' }]) {
    assert.equal((await get(claims)).status, 401);
  }
  assert.equal((await get({ purpose: 'HEALTHLINK_SESSION', auth_method: 'desktop_password' })).status, 403);
  const response = await get({ purpose: 'HEALTHLINK_SESSION', auth_method: 'mobile_google', roles: ['STUDENT'] });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user_id: 21, auth_method: 'mobile_google', roles: ['FACULTY'], is_qualified_responder: false });
});

// Verify that account appearance reads only the authenticated user and shares desktop preference writes.
test('account appearance reads only the authenticated user and shares desktop preference writes', async t => {
  const theme = { theme_mode: 'dark', theme_preset: 'blossom' };
  // Respond to active account and theme preference queries for the fixture user.
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    if (sql.startsWith('SELECT theme_mode, theme_preset')) {
      assert.deepEqual(params, [21]);
      return [[theme]];
    }
    assert.match(sql, /^UPDATE USERS SET theme_mode/);
    assert.deepEqual(params, ['light', 'sunrise', 21]);
    return [{ affectedRows: 1 }];
  });
  assert.equal((await request('/api/profile/theme')).status, 401);
  const read = await request('/api/profile/theme?user_id=42', { roles: ['STUDENT'] });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), theme);
  const invalid = await request('/api/profile/theme', { roles: ['STUDENT'], method: 'PUT', json: { theme_mode: 'system', theme_preset: 'other' } });
  assert.equal(invalid.status, 400);
  const save = await request('/api/profile/theme', { roles: ['STUDENT'], method: 'PUT', json: { theme_mode: 'light', theme_preset: 'sunrise', user_id: 42 } });
  assert.equal(save.status, 200);
});

// Verify that password change releases only the submitted device when the change commits.
test('password change releases only the submitted device when the change commits', async t => {
  const priorPassword = 'Original21!';
  let passwordHash = await bcrypt.hash(priorPassword, 4);
  const devices = new Map([['this-device', 21], ['other-device', 21], ['another-account', 42]]);
  let failAudit = false;
  let loseRace = false;
  // Supply the current password hash and active account status.
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /SELECT u\.password_hash/);
    return [[{ password_hash: passwordHash }]];
  });
  // Create a transaction double that stages credential and device updates.
  t.mock.method(pool, 'getConnection', async () => {
    let nextHash;
    let nextDevice;
    return {
      // Stand in for beginning the fixture password transaction.
      async beginTransaction() {},
      // Stage the password hash and push device removal and accept the audit write.
      async query(sql, params) {
        if (sql.startsWith('UPDATE USERS SET password_hash')) {
          assert.match(sql, /CAST\(password_hash AS BINARY\) = \?/);
          assert.deepEqual(params.slice(1), [21, passwordHash]);
          if (loseRace) return [{ affectedRows: 0 }];
          nextHash = params[0];
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('DELETE FROM DEVICE_TOKENS')) {
          assert.match(sql, /WHERE user_id = \? AND fcm_token = CAST\(\? AS BINARY\)/);
          const [owner, token] = params;
          assert.equal(owner, 21);
          if (devices.get(token) === owner) nextDevice = token;
          return [{ affectedRows: nextDevice ? 1 : 0 }];
        }
        if (sql.includes('FROM USERS FORCE INDEX (PRIMARY)') || sql.includes('UPDATE AUDIT_CHAIN_STATE')) return [[]];
        if (sql.includes('FROM AUDIT_CHAIN_STATE')) return [[{ last_entry_hash: '0'.repeat(64) }]];
        assert.match(sql, /INSERT INTO AUDIT_LOGS/);
        if (failAudit) throw new Error('fixture audit failure');
        return [{ affectedRows: 1 }];
      },
      // Apply the staged password and device changes on commit.
      async commit() {
        if (nextHash) passwordHash = nextHash;
        if (nextDevice) devices.delete(nextDevice);
      },
      // Provide the rollback method required by the password transaction fixture.
      async rollback() {},
      // Provide connection cleanup without a live pool.
      release() {},
    };
  });
  // Submit a password change as the fixture student.
  const change = (currentPassword, newPassword, fcm_token) => request('/api/auth/change-password', {
    roles: ['STUDENT'],
    method: 'PUT',
    json: { currentPassword, newPassword, fcm_token },
  });

  assert.equal((await change(priorPassword, 'short', 'this-device')).status, 400);
  assert.equal((await change('wrong', 'Replacement1', 'this-device')).status, 400);
  loseRace = true;
  assert.equal((await change(priorPassword, 'Replacement1', 'this-device')).status, 409);
  loseRace = false;
  failAudit = true;
  assert.equal((await change(priorPassword, 'Replacement1', 'this-device')).status, 500);
  failAudit = false;
  assert.equal(devices.size, 3);
  assert.ok(await bcrypt.compare(priorPassword, passwordHash));

  const changed = await change(priorPassword, 'Replacement1', 'this-device');
  assert.equal(changed.status, 200);
  assert.ok(await bcrypt.compare('Replacement1', passwordHash));
  assert.deepEqual([...devices], [['other-device', 21], ['another-account', 42]]);

  assert.equal((await change('Replacement1', 'secondpassphrase', 'another-account')).status, 200);
  assert.equal((await change('secondpassphrase', 'thirdpassphrase')).status, 200);
  assert.equal(devices.size, 2);
});

test('cancelled inventory requests stay quiet and real catalogue failures still return 500', { timeout: 5000 }, async t => {
  const medicine = { medicine_id: 1, name: 'Fixture medicine', available_stock: 5 };
  let hold;
  let catalogueError = null;
  // Stub the driver below the tracked pool so disconnects exercise real admission cleanup.
  t.mock.method(pool.pool, 'query', (sql, params, callback = params) => {
    if (hold && sql.includes(hold.fragment)) return hold.started.resolve(callback);
    if (sql.includes('SELECT is_active, deleted_at')) return callback(null, [{ is_active: 1, deleted_at: null }]);
    if (sql.includes('COALESCE(m.reorder_level')) return callback(null, [{ count: 0 }]);
    assert.match(sql, /AS available_stock/);
    return callback(catalogueError, [medicine]);
  });
  const log = t.mock.method(console, 'error', () => {});
  const options = { roles: ['NURSE'] };

  for (const [route, fragment, rows] of [
    ['/medicines', 'SELECT is_active, deleted_at', [{ is_active: 1, deleted_at: null }]],
    ['/dashboard-summary', 'COALESCE(m.reorder_level', [{ count: 0 }]],
  ]) {
    hold = { fragment, started: Promise.withResolvers() };
    const closed = Promise.withResolvers();
    listener.prependOnceListener('request', (_req, res) => res.once('close', closed.resolve));
    const controller = new AbortController();
    const cancelled = assert.rejects(request(`/api/inventory${route}`, { ...options, signal: controller.signal }), { name: 'AbortError' });
    const completeQuery = await hold.started.promise;
    controller.abort();
    await Promise.all([cancelled, closed.promise]);
    completeQuery(null, rows);
    await setImmediate();
    assert.equal(log.mock.callCount(), 0);
  }
  hold = undefined;

  const result = await request('/api/inventory/medicines', options);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), [medicine]);
  catalogueError = new Error('Fixture database failure');
  const failed = await request('/api/inventory/medicines', options);
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'Failed to fetch medicines catalogue.' });
  assert.equal(log.mock.callCount(), 1);
});

// Verify that inventory expiry alerts and summary use a 30-day window.
test('inventory expiry alerts and summary use a 30-day window', async t => {
  const expiryQueries = [];
  // Provide active-account and consent fixtures for the protected profile request.
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

// Verify that analytics headcount scope skips all other loaders and limits every report format.
test('analytics serves a fresh snapshot and rejects an expired snapshot under live permissions', async t => {
  const previous = readAnalyticsSnapshot;
  const previousFlag = process.env.MIXED_LOAD_CONTROLS;
  t.after(() => {
    readAnalyticsSnapshot = previous;
    if (previousFlag === undefined) delete process.env.MIXED_LOAD_CONTROLS;
    else process.env.MIXED_LOAD_CONTROLS = previousFlag;
  });
  let roles = ['ANALYTICS_VIEW', 'ANALYTICS_HEADCOUNT'].map(permission_code => ({ role_code: 'ADMIN', permission_code }));
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    if (sql.includes('AS permission_code')) return [roles];
    if (sql.includes('SELECT r.code, r.name')) return [[]];
    assert.fail('Unexpected query for a snapshot response');
  });
  let asOf = Date.now();
  readAnalyticsSnapshot = async () => ({ asOf, data: { headcount: [], topDiagnoses: [{ diagnosis: 'private scope', count: 1 }] } });
  const fetchSnapshot = () => request('/api/analytics/summary', { roles: ['ADMIN'] });
  const fresh = await fetchSnapshot();
  assert.equal(fresh.status, 200);
  assert.equal(fresh.headers.get('x-analytics-as-of'), new Date(asOf).toISOString());
  assert.equal((await fresh.json()).clinical, null);
  asOf -= 6_000;
  const expired = await fetchSnapshot();
  assert.equal(expired.status, 503);
  assert.equal(expired.headers.get('retry-after'), '1');
  roles = [{ role_code: 'ADMIN', permission_code: 'USERS_MANAGE' }];
  assert.equal((await fetchSnapshot()).status, 403);
  roles = ['ANALYTICS_VIEW', 'ANALYTICS_HEADCOUNT'].map(permission_code => ({ role_code: 'ADMIN', permission_code }));
  process.env.MIXED_LOAD_CONTROLS = 'false';
  const duringCutover = await fetchSnapshot();
  assert.equal(duringCutover.status, 200);
  assert.equal(duringCutover.headers.get('x-analytics-as-of'), null);
});

test('analytics headcount scope skips all other loaders and limits every report format', async t => {
  let codes = ['ANALYTICS_VIEW', 'ANALYTICS_HEADCOUNT', 'ANALYTICS_EXPORT'];
  const unexpected = [];
  // Build analytics grant and department query results for the current test role.
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    if (sql.includes('AS permission_code')) return [codes.map(/* Pair each administrator grant with the Admin role in the joined result. */ permission_code => ({ role_code: 'ADMIN', permission_code }))];
    if (sql.includes('SELECT r.code, r.name')) return [[{ code: 'STUDENT', name: 'Fixture headcount', count: 12 }]];
    unexpected.push(sql);
    throw new Error('Unexpected analytics query');
  });
  const roles = ['ADMIN', 'DOCTOR'];
  // Request an analytics endpoint with the selected roles.
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
  assert.deepEqual(workbook.worksheets.map(/* Extract worksheet names to check report section access. */ sheet => sheet.name), ['Campus Headcount']);
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

// Decode compressed PDF text streams for content assertions.
async function readPdfText(response) {
  const body = Buffer.from(await response.arrayBuffer()).toString('latin1');
  const streams = [...body.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  // Inflate a content stream and collect its encoded text chunks.
  return streams.flatMap(([, stream]) => {
    try {
      const operators = inflateSync(Buffer.from(stream, 'latin1')).toString();
      // Decode one hexadecimal PDF text segment for assertions.
      return [...operators.matchAll(/<([a-f0-9]+)>/gi)].map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'));
    } catch { return []; }
  }).join('');
}

// Verify that analytics report permissions map staff and Super Admin roles independently of the dashboard.
test('analytics report permissions map staff and Super Admin roles independently of the dashboard', async t => {
  let codes = [];
  let liveRoles = [];
  // Return the fixture account's live roles and grant rows.
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('SELECT is_active, deleted_at')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /AS permission_code/);
    // Return one joined row per live role and applicable admin grant.
    return [liveRoles.flatMap(role_code => role_code === 'ADMIN' && codes.length
      ? codes.map(/* Pair an admin grant with its role in the simulated account query. */ permission_code => ({ role_code, permission_code })) : [{ role_code }])];
  });
  const common = ['ANALYTICS_OPERATIONS', 'ANALYTICS_EXPORT', 'ANALYTICS_SURVEILLANCE', 'ANALYTICS_DISPENSING'];
  const clinical = [...common, 'ANALYTICS_CLINICAL'];
  const all = [...clinical, 'ANALYTICS_PHARMACY', 'ANALYTICS_HEADCOUNT'];
  const token = jwt.sign({ purpose: 'HEALTHLINK_SESSION', auth_method: 'desktop_password', user_id: 21, roles: ['ADMIN'] }, process.env.JWT_SECRET, { expiresIn: '5m' });
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

// Verify that analytics outputs contain only the live clinical and pharmacy subsections.
test('analytics outputs contain only the live clinical and pharmacy subsections', async t => {
  let role = 'NURSE';
  const unexpected = [];
  // Record and fail an unexpected analytics query.
  const reject = sql => { unexpected.push(sql); throw new Error('Unexpected analytics query'); };
  // Allow expected staff analytics reads and reject unauthorized section queries.
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
  // Request an analytics endpoint as a fixture doctor.
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
        content = workbook.worksheets.flatMap(/* Extract worksheet names and contents for restricted-section checks. */ sheet => [sheet.name, JSON.stringify(sheet.getSheetValues())]).join('\n');
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

// Verify that the mounted liveness route applies the HTTP allow-list and security headers.
test('the mounted liveness route applies the HTTP allow-list and security headers', async t => {
  // Fail the liveness test if the route attempts a MySQL query.
  t.mock.method(pool, 'query', () => assert.fail('Liveness probe accessed MySQL'));
  // Stub logging for the liveness test.
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

// Verify that public QR verification serves HTML and privacy-minimized JSON.
test('public QR verification serves HTML and privacy-minimized JSON', async t => {
  // Return a known clearance for the public verification token.
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

test('public v2 prescription status remains valid through the clinic day and excludes clinical data', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T15:59:59.999Z') });
  let status = 'active';
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('FROM MEDICAL_CLEARANCES')) return [[]];
    assert.match(sql, /FROM PRESCRIPTIONS/);
    assert.match(sql, /DATE_FORMAT\(p.expires_at/);
    assert.doesNotMatch(sql, /clinical_snapshot|p.notes|PRESCRIPTION_ITEMS/);
    return [[{ contract_version: 2, status, issued_at: '2026-11-16T00:00:00Z', expires_at: '2026-11-16',
      patient_first_name: 'Fixture', patient_last_name: 'Surname', doc_first_name: 'Fixture', doc_last_name: 'Clinician',
      signature_metadata: { signer_role: 'DOCTOR', hash_scope: 'prescription_payload_v2' } }]];
  });
  const route = '/api/documents/verify/fixture-prescription-date';
  const current = await (await request(route, { headers: { accept: 'application/json' } })).json();
  assert.equal(current.valid, true);
  assert.equal(current.patient, 'Fixture S.');
  assert.equal(current.expiresAt, '2026-11-16');
  assert.deepEqual(current.items, []);
  assert.equal(current.notes, null);
  assert.equal(current.clinical_snapshot, undefined);
  t.mock.timers.setTime(new Date('2026-11-16T16:00:00Z').getTime());
  const expired = await (await request(route, { headers: { accept: 'application/json' } })).json();
  assert.equal(expired.valid, false);
  assert.equal(expired.status, 'expired');
  status = 'cancelled';
  const cancelled = await (await request(route, { headers: { accept: 'application/json' } })).json();
  assert.equal(cancelled.status, 'cancelled');
});

test('public legacy prescriptions retain their original expiry timestamp response', async t => {
  const expires_at = new Date('2026-11-16T00:00:00+08:00');
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-15T16:00:01Z') });
  t.mock.method(pool, 'query', async sql => sql.includes('FROM MEDICAL_CLEARANCES') ? [[]] : [[{
    contract_version: 1, status: 'active', expires_at, validity_date: '2026-11-16',
    patient_first_name: 'Fixture', patient_last_name: 'Surname', signature_metadata: { signer_role: 'DOCTOR' },
  }]]);
  const response = await request('/api/documents/verify/fixture-legacy-expiry', { headers: { accept: 'application/json' } });
  const result = await response.json();
  assert.equal(result.valid, false);
  assert.equal(result.status, 'expired');
  assert.equal(result.expiresAt, expires_at.toISOString());
});

// Verify that protected routes reject inactive accounts before doing clinical work.
test('protected routes reject inactive accounts before doing clinical work', async t => {
  // Return an inactive account for the authorization check.
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /SELECT is_active, deleted_at FROM USERS/);
    assert.deepEqual(params, [21]);
    return [[{ is_active: 0, deleted_at: null }]];
  });
  const response = await request('/api/documents/verify/fixture-qr/details', { roles: ['DOCTOR'] });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'ACCOUNT_INACTIVE');
});

// Verify that attachment downloads require authentication and enforce ownership.
test('attachment downloads require authentication and enforce ownership', async t => {
  // Return the fixture attachment used to check the ownership gate.
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

// Verify that attachment tokens are bound to one file and consumed once.
test('attachment tokens are bound to one file and consumed once', async t => {
  // Provide metadata for an attachment owned by the requesting account.
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

// Verify that the mounted server policy checks the live Super Admin grant.
test('the mounted server policy checks the live Super Admin grant', async t => {
  // Return the restricted administrator grants used in the Database Studio denial test.
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
  const emailTest = route + '/email-test';
  assert.equal((await request(emailTest)).status, 401);
  for (const method of ['GET', 'POST']) assert.equal((await request(emailTest, { roles: ['ADMIN'], method })).status, 403);
  const configuration = await request(emailTest, { roles: ['ADMIN'], userId: 22 });
  assert.equal((await configuration.json()).smtpConfigured, false);
  const unavailable = await request(emailTest, { roles: ['ADMIN'], userId: 22, method: 'POST',
    json: { template: 'reminder', recipients: ['mailbox@example.invalid'] } });
  assert.equal(unavailable.status, 503);
});

// Verify that the mounted history route retains role checks and paging validation.
test('the mounted history route retains role checks and paging validation', async t => {
  // Supply the clinical encounter rows and accept the resulting PHI audit entries.
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

// Verify that the feature routes are mounted behind authentication.
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
    ['GET', '/api/documents/prescription-capabilities'],
    ['POST', '/api/documents/prescriptions/review'],
    ['GET', '/api/documents/prescriptions/my'],
    ['PATCH', '/api/documents/prescriptions/7/cancel'],
  ]) {
    const response = await request(path, { method });
    assert.equal(response.status, 401, method + ' ' + path);
    await response.json();
  }
});

test('structured prescribing capabilities are clinician-only and the disabled rollout flag prevents issuance', async t => {
  const prior = process.env.STRUCTURED_PRESCRIBING_ENABLED;
  t.after(() => { if (prior == null) delete process.env.STRUCTURED_PRESCRIBING_ENABLED; else process.env.STRUCTURED_PRESCRIBING_ENABLED = prior; });
  t.mock.method(pool, 'query', async () => [[{ is_active: 1, deleted_at: null }]]);
  t.mock.method(pool, 'getConnection', () => assert.fail('Disabled prescribing must not open an issuance connection'));
  process.env.STRUCTURED_PRESCRIBING_ENABLED = 'false';
  for (const roles of [['STUDENT'], ['NURSE'], ['ADMIN']]) {
    assert.equal((await request('/api/documents/prescription-capabilities', { roles })).status, 403);
  }
  for (const roles of [['DOCTOR'], ['DENTIST']]) {
    const capability = await request('/api/documents/prescription-capabilities', { roles });
    assert.deepEqual(await capability.json(), { contract_versions: [1, 2], structured_issuance_enabled: false, max_items: 20 });
    for (const path of ['/api/documents/prescriptions/review', '/api/documents/prescriptions']) {
      const response = await request(path, { roles, method: 'POST', json: { contract_version: 2 } });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'PRESCRIBING_DISABLED');
    }
  }
});

// Verify that admin role and account updates require the live user-management permission.
test('admin role and account updates require the live user-management permission', async t => {
  // Return the administrator grants used to check write denial.
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /FROM ADMIN_PERMISSIONS/);
    return [[{ code: 'AUDIT_VIEW' }]];
  });
  // Fail if the denied administrator opens a database transaction.
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

// Verify that Database Studio enforces its grant and blocks protected writes before opening a transaction.
test('Database Studio enforces its grant and blocks protected writes before opening a transaction', async t => {
  // Provide the admin grant set used to test protected table writes.
  t.mock.method(pool, 'query', async (sql, [userId]) => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /FROM ADMIN_PERMISSIONS/);
    return [[{ code: userId === 21 ? 'DATABASE_MANAGE' : 'AUDIT_VIEW' }]];
  });
  // Fail if the denied write opens a database transaction.
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

// Verify that Database Studio masks password hashes and logs PHI reads.
test('Database Studio masks password hashes and logs PHI reads', async t => {
  const phiAccess = t.mock.fn();
  // Simulate live admin grants and Database Studio read results for the patient audit check.
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
  assert.deepEqual(phiAccess.mock.calls.map(/* Extract the audit record supplied to each PHI log call. */ call => call.arguments[0]), [[21, 42, 'USERS', 42]]);
});

// Verify that Database Studio rolls back and releases when an audit write fails.
test('Database Studio rolls back and releases when an audit write fails', async t => {
  // Return administrator access fixtures for the audit failure case.
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('FROM USERS')) return [[{ is_active: 1, deleted_at: null }]];
    assert.match(sql, /FROM ADMIN_PERMISSIONS/);
    return [[{ code: 'DATABASE_MANAGE' }]];
  });
  // Suppress the expected error log for a failed audit write.
  t.mock.method(console, 'error', () => {});
  const calls = [];
  // Supply a write transaction double that forces audit failure.
  t.mock.method(pool, 'getConnection', async () => ({
    // Record the start of the Database Studio write transaction.
    async beginTransaction() { calls.push('begin'); },
    // Fail if a write with a rejected audit is committed.
    async commit() { assert.fail('Committed a failed audit write'); },
    // Record rollback after the audit failure.
    async rollback() { calls.push('rollback'); },
    // Record that the connection was released after rollback.
    release() { calls.push('release'); },
    // Supply column metadata, stage the row insert, and fail the audit insert.
    async query(sql) {
      if (sql.includes('information_schema.COLUMNS')) return [[{ name: 'name' }]];
      if (sql.includes('INSERT INTO ??')) {
        calls.push('insert');
        return [{ insertId: 4 }];
      }
      if (sql.includes('FROM USERS FORCE INDEX (PRIMARY)') || sql.includes('UPDATE AUDIT_CHAIN_STATE')) return [[]];
      if (sql.includes('FROM AUDIT_CHAIN_STATE')) return [[{ last_entry_hash: '0'.repeat(64) }]];
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


// Verify that audit pagination keeps the array contract and applies the cursor under the live grant.
test('audit pagination keeps the array contract and applies the cursor under the live grant', async t => {
  const queries = [];
  // Capture PHI audit log queries and supply the expected authorization and page rows.
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
  assert.deepEqual(queries.map(/* Extract the bound pagination parameters for assertions. */ query => query.params), [['9', 1], ['9', 1]]);
  assert.match(queries[0].sql, /WHERE a.audit_id < \?/);
  assert.match(queries[1].sql, /WHERE p.access_id < \?/);
  assert.match(queries[1].sql, /GROUP_CONCAT/);
});


// Verify that connected users is restricted to admins with telemetry access.
test('connected users is restricted to admins with telemetry access', async t => {
  // Supply admin grants for the telemetry access check.
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


// Verify that server console grants diagnostics separately from Super Admin restart access.
test('server console grants diagnostics separately from Super Admin restart access', async t => {
  const { s3 } = await import('../src/utils/s3Vault.js');
  // Return a fixture MinIO version header for telemetry.
  t.mock.method(s3, 'send', async () => ({ $response: { headers: { 'x-minio-version': 'fixture-release' } } }));
  // Simulate the MySQL version result and authorized telemetry reads.
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
