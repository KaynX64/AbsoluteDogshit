import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { inflateSync } from 'node:zlib';
import { test } from 'node:test';
import mysql from 'mysql2/promise';

Object.assign(process.env, { DB_PASSWORD: 'fixture', JWT_SECRET: 'fixture-jwt-'.repeat(8),
  ENCRYPTION_KEY: 'fixture-key-'.repeat(8), ENCRYPTION_SALT: 'fixture-salt-for-structured-rx',
  S3_ACCESS_KEY: 'fixture', S3_SECRET_KEY: 'fixture', STRUCTURED_PRESCRIBING_ENABLED: 'true' });
const { normalizeDraft, assessDraft, makeReviewToken, verifyReviewToken, validateAcknowledgements } = await import('../src/documents/prescriptions/structuredContract.js');
const { reviewStructuredPrescription, issueStructuredPrescription } = await import('../src/documents/prescriptions/structuredIssuance.js');
const { hydratePrescription, readSnapshot } = await import('../src/documents/prescriptions/structuredRead.js');
const { pool } = await import('../src/db/pool.js');
const { encrypt } = await import('../src/utils/cryptoVault.js');
const date = (days = 7) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const item = (values = {}) => ({ item_key: randomUUID(), fulfillment: 'external', catalog_medicine_id: null,
  generic_name: 'Fixture generic', brand_name: '', strength: '10 mg/5 mL', form: 'Suspension', generic_confirmed: true,
  dose_amount: '2.5', dose_unit: 'mL', route: 'Oral', schedule: { kind: 'fixed', frequency: 'Twice daily' },
  duration_days: 3, review_on: '', quantity: 15.5, quantity_unit: 'mL', pack_size: '', directions: 'Fixture directions entered by clinician.', ...values });
const draft = (items = [item()]) => ({ contract_version: 2, patient_user_id: 5, appointment_id: 201, expires_at: date(), notes: 'Fixture printed advice', items });
const ack = { patient_reviewed: true, coverage_reviewed: true, duplicates_reviewed: true, severe_reasons: { '401': 'Fixture clinician override reason' } };

test('structured validation accepts fractional doses and PRN/custom containers without inventing quantities', () => {
  for (const kind of ['prn', 'custom']) {
    const body = draft([item({ dose_amount: '1/2', dose_unit: 'tablet', quantity: 1.5, quantity_unit: 'bottle', pack_size: '60 mL',
      schedule: { kind, prn_reason: 'Fixture reason', prn_limits: 'Fixture explicit limits' }, duration_days: null, review_on: date(3) })]);
    const result = normalizeDraft(body);
    assert.deepEqual(result.errors, []);
    assert.equal(result.draft.items[0].quantity, 1.5);
    assert.equal(result.draft.items[0].dose_amount, '1/2');
  }
});

test('structured validation rejects malformed fields, missing schedule limits and inventory fractions', () => {
  const invalid = [ { generic_confirmed: false }, { generic_name: '' }, { dose_amount: '0' }, { dose_amount: '1/0' },
    { dose_unit: 'bananas' }, { quantity_unit: 'bananas' }, { quantity: -1 }, { quantity: 0.00001 },
    { fulfillment: 'clinic', catalog_medicine_id: 101, quantity: 1.5 }, { quantity_unit: 'bottle', pack_size: '' },
    { schedule: { kind: 'prn', prn_reason: 'pain' } }, { schedule: { kind: 'custom' }, directions: '' },
    { duration_days: null }, { schedule: { kind: 'custom' }, review_on: '2000-02-30' }, { directions: 'x'.repeat(2001) },
    { quantity: true }, { duration_days: true } ];
  for (const values of invalid) assert.ok(normalizeDraft(draft([item(values)])).errors.length, JSON.stringify(values));
  assert.ok(normalizeDraft(draft(Array.from({ length: 21 }, () => item()))).errors.length);
  const duplicate = item();
  assert.ok(normalizeDraft(draft([duplicate, duplicate])).errors.some(it => it.field.endsWith('item_key')));
});

test('review is bound to clinician, content, findings and expiry; manual identities never report safe', async () => {
  const assessment = await assessDraft({ query() { throw Error('Manual identity must not resolve implicitly'); } }, draft());
  assert.equal(assessment.safety.coverage, 'not_checked');
  const token = makeReviewToken(assessment, 2);
  verifyReviewToken(token, assessment, 2);
  for (const [value, clinician, now] of [[assessment, 6, Date.now()], [{ ...assessment, fingerprint: 'changed' }, 2, Date.now()], [assessment, 2, Date.now() + 6 * 60000]]) {
    assert.throws(() => verifyReviewToken(token, value, clinician, now), { code: 'REVIEW_CHANGED' });
  }
  assert.throws(() => validateAcknowledgements(assessment, { patient_reviewed: true }), { code: 'COVERAGE_REVIEW_REQUIRED' });
  assert.throws(() => validateAcknowledgements(assessment, {}), { code: 'PATIENT_REVIEW_REQUIRED' });
});

test('corrupt recorded content fails closed without including clinical text in parser diagnostics', () => {
  assert.throws(() => readSnapshot({ contract_version: 2, clinical_snapshot: '{patient: secret fixture' }), error => {
    assert.equal(error.code, 'PRESCRIPTION_INTEGRITY_ERROR');
    assert.ok(!error.message.includes('secret fixture'));
    return true;
  });
});

test('known-pair failures propagate; absent rules and duplicate generic identities require explicit review', async () => {
  const body = draft([item({ catalog_medicine_id: 101 }), item({ catalog_medicine_id: 102 })]);
  const catalog = [101, 102].map(medicine_id => ({ medicine_id, generic_name: 'Same generic', strength: '10 mg', form: 'Tablet', unit: 'pcs' }));
  const connection = { query: async sql => sql.includes('FROM MEDICINES') ? [catalog] : [[]] };
  const assessment = await assessDraft(connection, body);
  assert.equal(assessment.safety.coverage, 'partial');
  assert.equal(assessment.safety.catalog_pair_count, 1);
  assert.equal(assessment.safety.pairs_with_local_rules, 0);
  assert.equal(assessment.safety.duplicate_groups.length, 1);
  assert.throws(() => validateAcknowledgements(assessment, { ...ack, duplicates_reviewed: false }), { code: 'DUPLICATE_REVIEW_REQUIRED' });
  connection.query = async sql => { if (sql.includes('FROM MEDICINES')) return [catalog]; throw Error('Fixture unavailable rules'); };
  await assert.rejects(assessDraft(connection, body), /unavailable rules/);
  for (const severity of ['severe', 'contraindicated']) {
    assessment.safety.findings = [{ id: '401', severity }];
    assert.throws(() => validateAcknowledgements(assessment, { ...ack, severe_reasons: {} }), {
      code: severity === 'severe' ? 'SEVERE_OVERRIDE_REQUIRED' : 'CONTRAINDICATED_DRUG_INTERACTION' });
  }
});

const port = Number(process.env.VALETUDO_MIGRATION_TEST_PORT);
test('v2 issuance, concurrent retry, rollback, cancellation and snapshot readers agree on disposable MySQL', {
  skip: !port && 'Set VALETUDO_MIGRATION_TEST_PORT for the disposable MySQL rehearsal',
}, async t => {
  const database = 'vhl_structured_test_' + randomUUID().replaceAll('-', '');
  const options = { host: '127.0.0.1', port, user: 'root', password: process.env.VALETUDO_MIGRATION_TEST_PASSWORD || '' };
  const admin = await mysql.createConnection({ ...options, multipleStatements: true });
  const db = mysql.createPool({ ...options, database, connectionLimit: 5 });
  t.after(async () => { await db.end(); try { await admin.query('DROP DATABASE IF EXISTS ??', [database]); } finally { await admin.end(); } });
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  await admin.query(schema.replaceAll('`valetudo_healthlink`', '`' + database + '`'));
  t.mock.method(pool, 'query', db.query.bind(db));
  t.mock.method(pool, 'getConnection', db.getConnection.bind(db));
  await db.query("UPDATE STAFF_PROFILES SET signature_s3_key = 'fixture-signature', signature_sha256 = ? WHERE user_id = 2", ['a'.repeat(64)]);
  await db.query(`INSERT INTO APPOINTMENTS (appointment_id, patient_user_id, doctor_user_id, date_time, appointment_type, status)
    VALUES (201, 5, 2, NOW(), 'Medical', 'checked_in')`);
  await db.query(`INSERT INTO MEDICINES (medicine_id, name, generic_name, strength, form, unit) VALUES
    (101, 'Fixture A', 'Generic A', '10 mg', 'Tablet', 'pcs'), (102, 'Fixture B', 'Generic B', '5 mg', 'Tablet', 'pcs')`);
  await db.query(`INSERT INTO MEDICINE_BATCHES (batch_id, medicine_id, batch_no, manufacture_date, expiry_date, quantity_on_hand) VALUES
    (301, 101, 'earlier', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 30 DAY, 3),
    (302, 101, 'later', CURDATE() - INTERVAL 1 YEAR, CURDATE() + INTERVAL 60 DAY, 4),
    (303, 101, 'expired', CURDATE() - INTERVAL 1 YEAR, CURDATE() - INTERVAL 1 DAY, 50)`);
  await db.query(`INSERT INTO DRUG_INTERACTIONS (interaction_id, medicine_id_a, medicine_id_b, severity, interaction_type, description)
    VALUES (401, 101, 102, 'severe', 'fixture', 'Fixture severe interaction')`);
  const clinic = () => item({ fulfillment: 'clinic', catalog_medicine_id: 101, quantity: 2, quantity_unit: 'pcs', dose_amount: '1', dose_unit: 'tablet' });
  const body = draft([item({ catalog_medicine_id: 102, quantity: 2 }), clinic(), item({ quantity: 1.5, quantity_unit: 'bottle', pack_size: '60 mL',
    duration_days: null, review_on: date(3), schedule: { kind: 'prn', prn_reason: 'Fixture reason', prn_limits: 'Fixture limits' } }), clinic()]);
  const review = () => reviewStructuredPrescription(body, 2, db);
  const issuedBody = async (overrides = {}) => ({ ...body, review_token: makeReviewToken(await review(), 2),
    issuance_request_id: randomUUID(), acknowledgements: ack, ...overrides });
  const state = async () => {
    const [[row]] = await db.query(`SELECT (SELECT COUNT(*) FROM PRESCRIPTIONS) AS prescriptions,
      (SELECT COUNT(*) FROM EMR_RECORDS) AS emrs, (SELECT COUNT(*) FROM INVENTORY_LOGS) AS movements,
      (SELECT COUNT(*) FROM AUDIT_LOGS) AS audits, (SELECT SUM(quantity_on_hand) FROM MEDICINE_BATCHES) AS stock`);
    return row;
  };
  const baseline = await state();
  await t.test('changed rules, appointment state and signature enrollment invalidate issuance without writes', async () => {
    const submitted = await issuedBody();
    await db.query("UPDATE DRUG_INTERACTIONS SET description = 'Changed fixture rule' WHERE interaction_id = 401");
    await assert.rejects(issueStructuredPrescription(submitted, 2, { database: db }), { code: 'REVIEW_CHANGED' });
    await db.query("UPDATE DRUG_INTERACTIONS SET description = 'Fixture severe interaction' WHERE interaction_id = 401");
    await db.query("UPDATE APPOINTMENTS SET status = 'completed' WHERE appointment_id = 201");
    await assert.rejects(issueStructuredPrescription(submitted, 2, { database: db }), { code: 'NOT_IN_QUEUE' });
    await db.query("UPDATE APPOINTMENTS SET status = 'checked_in' WHERE appointment_id = 201");
    await db.query('UPDATE STAFF_PROFILES SET signature_s3_key = NULL WHERE user_id = 2');
    await assert.rejects(issueStructuredPrescription(submitted, 2, { database: db }), { code: 'SIGNATURE_NOT_ENROLLED' });
    await db.query("UPDATE STAFF_PROFILES SET signature_s3_key = 'fixture-signature' WHERE user_id = 2");
    assert.deepEqual(await state(), baseline);
  });
  await t.test('direct submission without review, stale content, missing overrides, contraindications and shortages write nothing', async () => {
    for (const [patch, code] of [[{ review_token: '' }, 'REVIEW_CHANGED'],
      [{ acknowledgements: { ...ack, severe_reasons: {} } }, 'SEVERE_OVERRIDE_REQUIRED'],
      [{ notes: 'Changed after review' }, 'REVIEW_CHANGED']]) {
      await assert.rejects(issueStructuredPrescription(await issuedBody(patch), 2, { database: db }), { code });
      assert.deepEqual(await state(), baseline);
    }
    await db.query("UPDATE DRUG_INTERACTIONS SET severity = 'contraindicated' WHERE interaction_id = 401");
    await assert.rejects(issueStructuredPrescription(await issuedBody(), 2, { database: db }), { code: 'CONTRAINDICATED_DRUG_INTERACTION' });
    await db.query("UPDATE DRUG_INTERACTIONS SET severity = 'severe' WHERE interaction_id = 401");
    const shortage = structuredClone(body); shortage.items[1].quantity = 100;
    const assessment = await reviewStructuredPrescription(shortage, 2, db);
    await assert.rejects(issueStructuredPrescription({ ...shortage, issuance_request_id: randomUUID(), acknowledgements: ack,
      review_token: makeReviewToken(assessment, 2) }, 2, { database: db }), { code: 'INSUFFICIENT_STOCK' });
    assert.deepEqual(await state(), baseline);
  });
  await t.test('required check errors and audit failure roll back the header, EMR, items, allocations and movements', async () => {
    for (const fragment of ['FROM DRUG_INTERACTIONS', 'INSERT INTO AUDIT_LOGS']) {
      const submitted = await issuedBody();
      const proxy = { async getConnection() {
        const conn = await db.getConnection();
        return { beginTransaction: () => conn.beginTransaction(), commit: () => conn.commit(), rollback: () => conn.rollback(), release: () => conn.release(),
          query(sql, params) { if (sql.includes(fragment)) throw Error('Fixture required operation failed'); return conn.query(sql, params); } };
      } };
      await assert.rejects(issueStructuredPrescription(submitted, 2, { database: proxy }), /required operation failed/);
      assert.deepEqual(await state(), baseline);
    }
  });
  const submitted = await issuedBody();
  let renders = 0;
  const generatePdf = async id => { renders++; assert.ok((await db.query('SELECT prescription_id FROM PRESCRIPTIONS WHERE prescription_id = ?', [id]))[0].length); return null; };
  const results = await Promise.all(Array.from({ length: 3 }, () => issueStructuredPrescription(submitted, 2, { database: db, generatePdf })));
  const id = results[0].prescriptionId;
  assert.equal(new Set(results.map(it => it.prescriptionId)).size, 1);
  assert.equal(results.filter(it => !it.replayed).length, 1);
  assert.equal(renders, 1);
  assert.equal(results[0].pdfAvailable, false);
  const [[header]] = await db.query('SELECT * FROM PRESCRIPTIONS WHERE prescription_id = ?', [id]);
  const snapshot = readSnapshot(header);
  assert.throws(() => readSnapshot({ ...header, clinical_snapshot: encrypt(JSON.stringify({ ...snapshot, notes: 'Tampered content' })) }), { code: 'PRESCRIPTION_INTEGRITY_ERROR' });
  assert.match(header.clinical_snapshot, /^enc:v2:/);
  assert.deepEqual(snapshot.items.map(it => it.item_key), body.items.map(it => it.item_key));
  assert.deepEqual(snapshot.items.map(it => it.quantity_dispensed), [0, 2, 0, 2]);
  const [items] = await db.query('SELECT * FROM PRESCRIPTION_ITEMS WHERE prescription_id = ? ORDER BY item_sequence', [id]);
  assert.deepEqual(items.map(it => it.medicine_id), [null, 101, null, 101]);
  assert.deepEqual(items.map(it => Number(it.quantity_prescribed)), [2, 2, 1.5, 2]);
  assert.ok(items.every(it => it.structured_details.startsWith('enc:v2:')));
  assert.deepEqual((await db.query('SELECT quantity_on_hand FROM MEDICINE_BATCHES ORDER BY batch_id'))[0].map(it => it.quantity_on_hand), [0, 3, 50]);
  assert.equal(snapshot.acknowledgements.severe_reasons['401'], ack.severe_reasons['401']);
  await db.query("UPDATE MEDICINES SET generic_name = 'Changed after issue' WHERE medicine_id = 102");
  await db.query("UPDATE APPOINTMENTS SET status = 'completed' WHERE appointment_id = 201");
  assert.deepEqual(hydratePrescription(header).items, snapshot.items);
  assert.equal((await issueStructuredPrescription(submitted, 2, { database: db, generatePdf })).prescriptionId, id);
  await assert.rejects(issueStructuredPrescription({ ...submitted, notes: 'Different request content' }, 2, { database: db }), { code: 'REQUEST_CONTENT_MISMATCH' });
  assert.equal(renders, 1);
  await t.test('patient history, clinician history and protected verification return the same immutable ordered items', async () => {
    const { default: routes } = await import('../src/routes/documents/index.js');
    const { verificationUrl } = await import('../src/documents/publicLinks.js');
    const router = routes();
    for (const [path, userId, params] of [['/prescriptions/my', 5, {}], ['/prescriptions/patient/:patientId', 2, { patientId: '5' }], ['/verify/:qrToken/details', 2, { qrToken: header.qr_token }]]) {
      const route = router.stack.find(it => it.route?.path === path).route;
      const response = { status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
      await route.stack.at(-1).handle({ user: { user_id: userId }, params, ip: '127.0.0.1' }, response);
      assert.ok(!response.statusCode || response.statusCode === 200, JSON.stringify(response.body));
      const record = Array.isArray(response.body) ? response.body[0] : response.body;
      assert.deepEqual(record.items, snapshot.items);
      assert.equal(record.notes, body.notes);
      assert.equal(record.clinical_snapshot, undefined);
      assert.equal(record.items[0].generic_name, 'Generic B');
      if (path === '/prescriptions/my') assert.equal(record.verification_url, verificationUrl(header.qr_token));
    }
  });
  await t.test('PDF recovery renders recorded content and publishes a key after an initial failure', async () => {
    const { s3 } = await import('../src/utils/s3Vault.js');
    const { qrBuffer } = await import('../src/documents/pdf/renderer.js');
    const fixturePng = await qrBuffer('synthetic signature fixture', 100);
    const uploaded = [];
    t.mock.method(s3, 'send', async command => {
      if (command.constructor.name === 'GetObjectCommand') return { Body: Readable.from([fixturePng]) };
      uploaded.push(command.input); return {};
    });
    const { generateAndStorePrescriptionPDF } = await import('../src/documents/generation/prescription.js');
    const key = await generateAndStorePrescriptionPDF(id, db);
    assert.ok(key?.endsWith('.pdf'));
    assert.equal(uploaded.length, 1);
    assert.equal(uploaded[0].Body.subarray(0, 5).toString(), '%PDF-');
    const raw = uploaded[0].Body.toString('latin1');
    const text = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(([, stream]) => {
      try { return [...inflateSync(Buffer.from(stream, 'latin1')).toString().matchAll(/<([a-f0-9]+)>/gi)].map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1')); }
      catch { return []; }
    }).join('');
    assert.ok(text.includes('Generic B') && !text.includes('Changed after issue'), 'Regeneration uses the issued identity, not the edited catalog');
    for (const item of snapshot.items) assert.ok(text.includes(item.directions), 'Every recorded direction is printed');
    assert.equal((await db.query('SELECT pdf_s3_key FROM PRESCRIPTIONS WHERE prescription_id = ?', [id]))[0][0].pdf_s3_key, key);
  });
  await t.test('cancellation returns only actual clinic allocations, once', async () => {
    const { cancelPrescription } = await import('../src/documents/prescriptions/cancelPrescription.js');
    const request = { prescriptionId: id, user: { user_id: 2, roles: ['DOCTOR'] }, reason: 'Fixture cancellation' };
    await cancelPrescription(request);
    assert.deepEqual((await db.query('SELECT quantity_on_hand FROM MEDICINE_BATCHES ORDER BY batch_id'))[0].map(it => it.quantity_on_hand), [3, 4, 50]);
    await assert.rejects(cancelPrescription(request), { code: 'INVALID_STATE' });
    assert.deepEqual(readSnapshot((await db.query('SELECT * FROM PRESCRIPTIONS WHERE prescription_id = ?', [id]))[0][0]), snapshot);
  });
  await t.test('different requests racing for clinic stock cannot oversell', async () => {
    await db.query("UPDATE APPOINTMENTS SET status = 'serving' WHERE appointment_id = 201");
    const first = await issuedBody(); const second = await issuedBody();
    const outcomes = await Promise.allSettled([first, second].map(request => issueStructuredPrescription(request, 2, { database: db, generatePdf: async () => null })));
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'INSUFFICIENT_STOCK');
    assert.deepEqual((await db.query('SELECT quantity_on_hand FROM MEDICINE_BATCHES ORDER BY batch_id'))[0].map(it => it.quantity_on_hand), [0, 3, 50]);
  });
});
