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

// Create a response double for testing authorization middleware.
function fakeResponse() {
  return {
    statusCode: 200,
    // Record the returned HTTP status and allow response chaining.
    status(code) { this.statusCode = code; return this; },
    // Capture the response body for assertions.
    json(body) { this.body = body; return this; },
  };
}

// Run the permission guard against a fixture account and capture its decision.
async function authorize(guard, roles) {
  const res = fakeResponse();
  let allowed = false;
  // Record that the guard passed control to the next middleware.
  await guard({ user: { user_id: 42, roles } }, res, () => { allowed = true; });
  return { allowed, res };
}

// Verify that additional roles cannot bypass a missing admin grant.
test('additional roles cannot bypass a missing admin grant', async (t) => {
  // Return grants that lack the requested audit permission.
  const grants = t.mock.method(pool, 'query', async () => [[{ code: 'USERS_MANAGE' }]]);
  for (const roles of [['ADMIN'], ['ADMIN', 'NURSE'], ['ADMIN', 'STUDENT']]) {
    const { allowed, res } = await authorize(requirePermission('AUDIT_VIEW'), roles);
    assert.equal(allowed, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'ADMIN_PERMISSION_DENIED');
  }
  assert.equal(grants.mock.callCount(), 3);
});

// Verify that mixed-role admins can use their grants and existing Super Admin access.
test('mixed-role admins can use their grants and existing Super Admin access', async (t) => {
  const guard = requirePermission('AUDIT_VIEW');
  const roles = ['ADMIN', 'NURSE'];
  // Return the explicit audit grant for the mixed-role admin.
  const grants = t.mock.method(pool, 'query', async () => [[{ code: 'AUDIT_VIEW' }]]);
  assert.equal((await authorize(guard, roles)).allowed, true);
  // Replace the test grants with an explicit Super Admin marker.
  grants.mock.mockImplementation(async () => [[{ code: 'SUPER_ADMIN' }]]);
  assert.equal((await authorize(guard, roles)).allowed, true);
  // Simulate the legacy full-access administrator with no grant rows.
  grants.mock.mockImplementation(async () => [[]]);
  assert.equal((await authorize(guard, roles)).allowed, true);
});

// Verify that shared clinical access requires explicit roles and still checks grants for admins.
test('shared clinical access requires explicit roles and still checks grants for admins', async (t) => {
  const guard = requirePermission('ANALYTICS_VIEW', { nonAdminRoles: ['DOCTOR', 'DENTIST'] });
  // Return an unrelated grant for the mixed-role admin check.
  const grants = t.mock.method(pool, 'query', async () => [[{ code: 'USERS_MANAGE' }]]);
  assert.equal((await authorize(guard, ['DOCTOR'])).allowed, true);
  assert.equal((await authorize(guard, ['DENTIST'])).allowed, true);
  assert.equal((await authorize(guard, ['STUDENT'])).res.statusCode, 403);
  assert.equal((await authorize(requirePermission('AUDIT_VIEW'), ['DOCTOR'])).res.statusCode, 403);
  assert.equal((await authorize(guard, ['ADMIN', 'DOCTOR'])).res.statusCode, 403);
  assert.equal(grants.mock.callCount(), 1);
});

// Verify that booking releases before confirmation lookup and broadcasts only an empty refresh payload.
test('booking releases before confirmation lookup and broadcasts only an empty refresh payload', async (t) => {
  const serviceAccount = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
  const existsSync = fs.existsSync;
  // Hide the local Firebase credential from the fixture.
  t.mock.method(fs, 'existsSync', (path) => path !== serviceAccount && existsSync(path));
  const { default: appointmentRoutes } = await import('../src/routes/appointments/index.js');

  const actions = [];
  const connection = {
    // Stand in for opening the booking transaction.
    async beginTransaction() {},
    // Record the commit in the operation sequence.
    async commit() { actions.push('commit'); },
    // Record a rollback if the handler takes its failure path.
    async rollback() { actions.push('rollback'); },
    // Record when the booking handler releases its connection.
    release() { actions.push('release'); },
    // Supply booking policy and appointment fixtures for the expected transaction queries.
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
  // Return the simulated booking transaction connection.
  t.mock.method(pool, 'getConnection', async () => connection);
  // Skip the live cache invalidation during the booking test.
  t.mock.method(console, 'error', () => {});
  // Fail the confirmation lookup after recording when it was attempted.
  t.mock.method(pool, 'query', async () => {
    actions.push('confirmation lookup');
    throw new Error('Synthetic lookup failure');
  });

  const events = [];
  // Collect realtime event names and arguments for comparison.
  const router = appointmentRoutes({ emit(...args) { events.push(args); } });
  // Locate the POST handler for creating a booking.
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
