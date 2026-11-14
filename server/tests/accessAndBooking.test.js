// Tests mixed-role admin authorization and booking notification and pool-release behavior.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

process.env.DB_PASSWORD = 'fixture-password';
process.env.JWT_SECRET = 'fixture-jwt-secret'.repeat(3);
process.env.ENCRYPTION_KEY = 'fixture-encryption-key'.repeat(3);
process.env.ENCRYPTION_SALT = 'fixture-encryption-salt';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';

const { pool } = await import('../src/db/pool.js');
const { requirePermission } = await import('../src/middleware/rbac.js');

function fakeResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function authorize(guard, roles) {
  const res = fakeResponse();
  let allowed = false;
  await guard({ user: { user_id: 42, roles } }, res, () => { allowed = true; });
  return { allowed, res };
}

test('additional roles cannot bypass a missing admin grant', async (t) => {
  const grants = t.mock.method(pool, 'query', async () => [[{ code: 'USERS_MANAGE' }]]);
  for (const roles of [['ADMIN'], ['ADMIN', 'NURSE'], ['ADMIN', 'STUDENT']]) {
    const { allowed, res } = await authorize(requirePermission('AUDIT_VIEW'), roles);
    assert.equal(allowed, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'ADMIN_PERMISSION_DENIED');
  }
  assert.equal(grants.mock.callCount(), 3);
});

test('mixed-role admins can use their grants and existing Super Admin access', async (t) => {
  const guard = requirePermission('AUDIT_VIEW');
  const roles = ['ADMIN', 'NURSE'];
  const grants = t.mock.method(pool, 'query', async () => [[{ code: 'AUDIT_VIEW' }]]);
  assert.equal((await authorize(guard, roles)).allowed, true);
  grants.mock.mockImplementation(async () => [[{ code: 'SUPER_ADMIN' }]]);
  assert.equal((await authorize(guard, roles)).allowed, true);
  grants.mock.mockImplementation(async () => [[]]);
  assert.equal((await authorize(guard, roles)).allowed, true);
});

test('shared clinical access requires explicit roles and still checks grants for admins', async (t) => {
  const guard = requirePermission('ANALYTICS_VIEW', { nonAdminRoles: ['DOCTOR', 'DENTIST'] });
  const grants = t.mock.method(pool, 'query', async () => [[{ code: 'USERS_MANAGE' }]]);
  assert.equal((await authorize(guard, ['DOCTOR'])).allowed, true);
  assert.equal((await authorize(guard, ['DENTIST'])).allowed, true);
  assert.equal((await authorize(guard, ['STUDENT'])).res.statusCode, 403);
  assert.equal((await authorize(requirePermission('AUDIT_VIEW'), ['DOCTOR'])).res.statusCode, 403);
  assert.equal((await authorize(guard, ['ADMIN', 'DOCTOR'])).res.statusCode, 403);
  assert.equal(grants.mock.callCount(), 1);
});

test('booking releases before confirmation lookup and broadcasts only an empty refresh payload', async (t) => {
  const serviceAccount = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
  const existsSync = fs.existsSync;
  t.mock.method(fs, 'existsSync', (path) => path !== serviceAccount && existsSync(path));
  const { default: appointmentRoutes } = await import('../src/routes/appointments/index.js');

  const actions = [];
  const connection = {
    async beginTransaction() {},
    async commit() { actions.push('commit'); },
    async rollback() { actions.push('rollback'); },
    release() { actions.push('release'); },
    async query(sql) {
      if (sql.includes('FROM SERVER_POLICY')) return [[{ revision: 0, overrides: {} }]];
      if (sql.includes('FROM USERS WHERE')) return [[{ user_id: 21 }]];
      if (sql.includes('JOIN USER_ROLES')) return [[{ code: 'DOCTOR' }]];
      if (sql.includes('FROM APPOINTMENTS') || sql.includes('FROM AUDIT_LOGS')) return [[]];
      if (sql.includes('INSERT INTO APPOINTMENTS')) return [{ insertId: 53 }];
      if (sql.includes('INSERT INTO AUDIT_LOGS')) return [{}];
      throw new Error('Unexpected booking query');
    },
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(console, 'error', () => {});
  t.mock.method(pool, 'query', async () => {
    actions.push('confirmation lookup');
    throw new Error('Synthetic lookup failure');
  });

  const events = [];
  const router = appointmentRoutes({ emit(...args) { events.push(args); } });
  const booking = router.stack.find(({ route }) => route?.path === '/' && route.methods.post);
  const handler = booking.route.stack.at(-1).handle;
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  const day = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
  const res = fakeResponse();
  await handler({
    body: { doctor_user_id: 21, date_time: `${day} 09:00:00`, appointment_type: 'General consultation' },
    user: { user_id: 42 }, ip: '127.0.0.1',
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.appointmentId, 53);
  assert.deepEqual(events, [['appointment:booked', {}]]);
  assert.deepEqual(actions, ['commit', 'release', 'confirmation lookup']);
});
