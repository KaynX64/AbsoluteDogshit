import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DB_PASSWORD = 'fixture-password';
process.env.JWT_SECRET = 'fixture-jwt-secret'.repeat(3);
process.env.ENCRYPTION_KEY = 'fixture-encryption-key'.repeat(3);
process.env.ENCRYPTION_SALT = 'fixture-encryption-salt';

const { pool } = await import('../src/db.js');
const { default: documentRoutes } = await import('../src/routes/documents.js');

const cases = [
  {
    path: '/prescriptions',
    body: { patient_user_id: 42, emr_id: 17, items: [{ outside_drug_name: 'Fixture medicine' }] },
    idField: 'prescriptionId',
    pdfTable: 'PRESCRIPTIONS p',
  },
  {
    path: '/clearances',
    body: { user_id: 42, purpose: 'Fixture clearance', remarks: 'Fixture remarks' },
    idField: 'clearanceId',
    pdfTable: 'MEDICAL_CLEARANCES mc',
  },
];

for (const { path, body, idField, pdfTable } of cases) {
  test(`${path} releases the issuance connection before querying for the PDF`, async (t) => {
    const actions = [];
    const connection = {
      async beginTransaction() {},
      async commit() { actions.push('commit'); },
      async rollback() { actions.push('rollback'); },
      release() { actions.push('release'); },
      async query(sql) {
        if (sql.includes('sp.license_no')) {
          return [[{ user_id: 21, first_name: 'Fixture', last_name: 'Doctor', is_active: 1,
            role_code: 'DOCTOR', license_no: 'fixture-license' }]];
        }
        if (sql.includes('FROM STAFF_PROFILES')) return [[{ signature_s3_key: 'fixture-signature' }]];
        if (sql.includes('FROM USERS')) return [[{ user_id: 42, is_active: 1, role_code: 'STUDENT' }]];
        if (sql.includes('FROM APPOINTMENTS')) return [[{ status: 'checked_in' }]];
        if (sql.includes('FROM EMR_RECORDS')) return [[{ emr_id: 17 }]];
        if (sql.includes('FROM AUDIT_LOGS')) return [[]];
        if (/^INSERT INTO (PRESCRIPTIONS|PRESCRIPTION_ITEMS|MEDICAL_CLEARANCES|AUDIT_LOGS)\b/.test(sql)) {
          return [{ insertId: 53 }];
        }
        throw new Error('Unexpected issuance query');
      },
    };
    t.mock.method(pool, 'getConnection', async () => connection);
    t.mock.method(console, 'error', () => {});
    const pdfQuery = t.mock.method(pool, 'query', async () => {
      actions.push('PDF query');
      return [[]];
    });

    const router = documentRoutes();
    const { route } = router.stack.find(({ route }) => route?.path === path && route.methods.post);
    const handler = route.stack.at(-1).handle;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(result) { this.body = result; return this; },
    };
    await handler({
      body: { ...body, appointment_id: 8 },
      user: { user_id: 21 },
      ip: '127.0.0.1',
    }, res);

    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(res.body[idField], 53);
    assert.equal(res.body.pdfAvailable, false);
    assert.deepEqual(actions, ['commit', 'release', 'PDF query']);
    assert.equal(pdfQuery.mock.callCount(), 1);
    assert.ok(pdfQuery.mock.calls[0].arguments[0].includes(`FROM ${pdfTable}`));
  });
}
