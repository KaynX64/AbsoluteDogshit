import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DB_PASSWORD = 'fixture-password';
process.env.JWT_SECRET = 'fixture-jwt-secret'.repeat(3);
process.env.ENCRYPTION_KEY = 'fixture-encryption-key'.repeat(3);
process.env.ENCRYPTION_SALT = 'fixture-encryption-salt';

const { pool } = await import('../src/db.js');
const { default: documentRoutes } = await import('../src/routes/documents/index.js');
const { encrypt } = await import('../src/utils/cryptoVault.js');
const { readEncounterText } = await import('../src/utils/encounterText.js');
const expires_at = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

const cases = [
  {
    path: '/prescriptions',
    body: { patient_user_id: 42, emr_id: 17, expires_at, items: [{
      outside_drug_name: 'Fixture medicine', dosage: 'Fixture dosage', frequency: 'Fixture frequency',
      route: 'Fixture route', duration_days: 2, quantity_prescribed: 4,
    }] },
    idField: 'prescriptionId',
    pdfTable: 'PRESCRIPTIONS p',
  },
  {
    path: '/clearances',
    body: { user_id: 42, purpose: 'Fixture clearance', remarks: 'Fixture remarks', expires_at },
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

test('issuer history returns saved prescription details and clearance remarks even without PDFs', async (t) => {
  const rx = { prescription_id: 53, emr_id: 17, status: 'active', notes: encrypt('Fixture notes'), pdf_s3_key: null };
  const rxItem = { prescription_id: 53, item_id: 2, medicine_name: 'Fixture medicine', dosage: 'Fixture dosage',
    frequency: 'Fixture frequency', route: 'Fixture route', instructions: encrypt('Fixture directions') };
  const clearance = { clearance_id: 54, purpose: 'Fixture clearance', status: 'approved',
    signature_metadata: JSON.stringify({ clinical_remarks: 'Fixture remarks' }), pdf_s3_key: null };
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('INSERT INTO PHI_ACCESS_LOGS')) return [{}];
    if (sql.includes('FROM PRESCRIPTION_ITEMS')) {
      assert.deepEqual(params, [[53]]);
      return [[rxItem]];
    }
    assert.deepEqual(params, [42, 21]);
    return sql.includes('FROM PRESCRIPTIONS') ? [[rx]] : [[clearance]];
  });

  const router = documentRoutes();
  for (const [path, expectedId, idField] of [
    ['/prescriptions/patient/:patientId', 53, 'prescription_id'],
    ['/clearances/patient/:patientId', 54, 'clearance_id'],
  ]) {
    const { route } = router.stack.find(({ route }) => route?.path === path && route.methods.get);
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(result) { this.body = result; return this; },
    };
    await route.stack.at(-1).handle({ params: { patientId: '42' }, user: { user_id: 21 } }, res);
    assert.equal(res.statusCode, 200);
    const [record] = res.body;
    assert.equal(record[idField], expectedId);
    assert.equal(record.pdfAvailable, false);
    if (idField === 'prescription_id') {
      assert.equal(record.notes, 'Fixture notes');
      assert.equal(record.items[0].instructions, 'Fixture directions');
      assert.equal(record.items[0].dosage, 'Fixture dosage');
    } else {
      assert.equal(record.remarks, 'Fixture remarks');
    }
  }
});

test('encounter text preserves blank optional fields and requires actual complaint and diagnosis', () => {
  assert.deepEqual(readEncounterText({ chief_complaint: ' Fixture complaint ', diagnosis: 'Fixture diagnosis', notes: '  ' }), {
    chief_complaint: 'Fixture complaint', diagnosis: 'Fixture diagnosis', treatment_plan: '', notes: '',
  });
  assert.throws(() => readEncounterText({ chief_complaint: ' ', diagnosis: 'Fixture diagnosis' }), /required/);
  assert.throws(() => readEncounterText({ chief_complaint: 'Complaint', diagnosis: 1 }), /must be text/);
});
