// Tests history paging, role-sensitive dental data, and attachment-only requests.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';

process.env.DB_PASSWORD = 'fixture-password';
process.env.JWT_SECRET = 'fixture-jwt-secret'.repeat(3);
process.env.ENCRYPTION_KEY = 'fixture-encryption-key'.repeat(3);
process.env.ENCRYPTION_SALT = 'fixture-encryption-salt';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';

const { pool } = await import('../src/db/pool.js');
const { encrypt } = await import('../src/utils/cryptoVault.js');
const serviceAccount = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
const existsSync = fs.existsSync;
// Hide the local Firebase credential from the history fixture.
const fsMock = mock.method(fs, 'existsSync', (path) => path !== serviceAccount && existsSync(path));
const { default: appointmentRoutes } = await import('../src/routes/appointments/index.js');
fsMock.mock.restore();
// Find the patient history route in the composed appointment router.
const { route } = appointmentRoutes().stack.find(({ route }) => route?.path === '/patient/:patientId/history');
const handler = route.stack.at(-1).handle;

// Invoke the patient history handler with a fake Express response and the supplied role.
async function request(query, role = 'DOCTOR') {
  const res = {
    statusCode: 200,
    // Record the status returned by the history handler.
    status(code) { this.statusCode = code; return this; },
    // Capture the history response for assertions.
    json(body) { this.body = body; return this; },
  };
  await handler({ query, params: { patientId: '42' }, user: { user_id: 21, roles: [role] }, ip: '127.0.0.1' }, res);
  return res;
}

// Verify that a dental history page batch-loads only the visible encounters.
test('a dental history page batch-loads only the visible encounters', async (t) => {
  // Build a cursor for a fixture encounter with a fixed timestamp.
  const cursorFor = (id) => `2026-01-05 09:00:00,${id}`;
  const chart = { 11: { condition: 'missing' } };
  // Return paged encounters and the associated history details and audit result.
  const query = t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes('FROM EMR_RECORDS')) return [[53, 52, 51].map(/* Build encrypted dental history records with deterministic cursor values. */ (id) => ({
      emr_id: id,
      history_cursor: cursorFor(id),
      diagnosis: encrypt('Fixture diagnosis'),
      chart_data: id === 53 ? encrypt(JSON.stringify(chart)) : null,
    }))];
    if (sql.includes('FROM VITAL_SIGNS')) return [[{ emr_id: 53, metric: 'pulse', value: '80.00', unit: 'bpm' }]];
    if (sql.includes('FROM EMR_ATTACHMENTS')) return [[{ emr_id: 52, attachment_id: 7, file_name: 'fixture.pdf' }]];
    if (sql.includes('FROM PRESCRIPTIONS')) return [[{ emr_id: 53, prescription_id: 8, notes: encrypt('Fixture notes') }]];
    if (sql.includes('INSERT INTO PHI_ACCESS_LOGS')) return [{}];
    throw new Error('Unexpected history query');
  });

  const res = await request({ limit: '2' }, 'DENTIST');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.nextCursor, cursorFor(52));
  const [first, second] = res.body.records;
  assert.deepEqual(res.body.records.map(/* Extract the returned encounter IDs for the page check. */ (row) => row.emr_id), [53, 52]);
  assert.equal(first.diagnosis, 'Fixture diagnosis');
  assert.deepEqual(first.dental_chart, chart);
  assert.equal(second.dental_chart, null);
  assert.equal(first.history_cursor, undefined);
  assert.deepEqual(first.vitals, [{ metric: 'pulse', value: '80.00', unit: 'bpm' }]);
  assert.deepEqual(first.prescriptions, [{ prescription_id: 8, notes: 'Fixture notes' }]);
  assert.deepEqual(second.attachments, [{ attachment_id: 7, file_name: 'fixture.pdf' }]);
  assert.deepEqual(second.vitals, []);
  // Inspect query arguments to verify only the visible encounters were loaded.
  const calls = query.mock.calls.map((call) => call.arguments);
  assert.equal(calls.length, 5);
  assert.match(calls[0][0], /LEFT JOIN DENTAL_CHARTS/);
  assert.deepEqual(calls[0][1], [42, 3]);
  for (const [sql, params] of calls.slice(1, 4)) {
    assert.match(sql, /emr_id IN \(\?\)/);
    assert.deepEqual(params, [[53, 52]]);
  }
  assert.match(calls[4][0], /INSERT INTO PHI_ACCESS_LOGS/);
});

// Verify that cursor and legacy history keep their response formats and exclude dental data for doctors.
test('cursor and legacy history keep their response formats and exclude dental data for doctors', async (t) => {
  // Return an encounter row and accept the PHI audit write for both response shapes.
  const query = t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes('FROM EMR_RECORDS')) return [[{ emr_id: 51 }]];
    if (sql.includes('INSERT INTO PHI_ACCESS_LOGS')) return [{}];
    return [[]];
  });
  const next = await request({ limit: '2', before: '2026-01-05 09:00:00,52' });
  const legacy = await request({});
  assert.equal(next.statusCode, 200);
  assert.deepEqual(next.body, { records: legacy.body, nextCursor: null });
  assert.ok(Array.isArray(legacy.body));
  assert.equal(legacy.body[0].dental_chart, null);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.doesNotMatch(sql, /DENTAL_CHARTS/);
  assert.match(sql, /e\.encounter_date = \? AND e\.emr_id </);
  assert.deepEqual(params, [42, '2026-01-05 09:00:00', '2026-01-05 09:00:00', '52', 3]);
});

// Verify that invalid page parameters are rejected before accessing patient data.
test('invalid page parameters are rejected before accessing patient data', async (t) => {
  // Stub the database to detect data access during invalid input tests.
  const query = t.mock.method(pool, 'query', async () => [[]]);
  for (const params of [
    { limit: '0' }, { limit: '51' }, { limit: ['25', '25'] }, { before: '2026-01-05 09:00:00,52' },
    { limit: '25', before: '2026-02-30 09:00:00,52' },
  ]) {
    assert.equal((await request(params)).statusCode, 400);
  }
  assert.equal(query.mock.callCount(), 0);
});

// Verify that the diagnostic attachment view reads and audits only attachments.
test('the diagnostic attachment view reads and audits only attachments', async (t) => {
  const attachments = [{ attachment_id: 7, file_name: 'fixture.pdf' }];
  // Provide attachment metadata and accept the PHI audit insert.
  const query = t.mock.method(pool, 'query', async (sql) =>
    sql.includes('INSERT INTO PHI_ACCESS_LOGS') ? [{}] : [attachments]);
  assert.deepEqual((await request({ view: 'attachments' })).body, attachments);
  // Extract query arguments to check the attachment-only read and audit.
  const calls = query.mock.calls.map((call) => call.arguments);
  assert.equal(calls.length, 2);
  assert.match(calls[0][0], /JOIN EMR_ATTACHMENTS/);
  assert.equal(calls[1][1][2], 'EMR_ATTACHMENTS');
});
