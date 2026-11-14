const assert = require('node:assert/strict');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { join } = require('node:path');
const { test } = require('node:test');
const { tmpdir } = require('node:os');
const { openOfflineDatabase, initLocalDatabase } = require('../electron/offline/database.cjs');
const wrapKeyFixture = {
  isEncryptionAvailable: () => true,
  encryptString: key => Buffer.from(key, 'hex'),
  decryptString: buffer => buffer.toString('hex'),
};
const { registerCertificatePolicy } = require('../electron/certificatePolicy.cjs');
const { API_BASE_URL } = require('../electron/config.cjs');
const { registerOfflineHandlers } = require('../electron/offline/registerHandlers.cjs');

test('certificate policy preserves development and packaged trust boundaries', () => {
  const cases = [
    [false, 'https://127.0.0.1:5173', true],
    [false, API_BASE_URL, true],
    [true, 'https://127.0.0.1:5173', new URL(API_BASE_URL).origin === 'https://127.0.0.1:5173'],
    [true, API_BASE_URL, ['localhost', '127.0.0.1', '[::1]'].includes(new URL(API_BASE_URL).hostname)],
    [true, 'https://localhost:5000@unrelated.invalid/', false],
    [false, 'https://unrelated.invalid/', false],
  ];
  for (const [isPackaged, url, allowed] of cases) {
    let handler;
    registerCertificatePolicy({ isPackaged, on: (event, cb) => {
      assert.equal(event, 'certificate-error');
      handler = cb;
    } });
    let prevented = false;
    let result;
    handler({ preventDefault: () => { prevented = true; } }, null, url, null, null, value => { result = value; });
    assert.equal(result, allowed, url);
    assert.equal(prevented, allowed, url);
  }
});

test('offline IPC caches, queues, and completes mutations using the existing SQLite schema', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'healthlink-offline-'));
  const db = await openOfflineDatabase(dir, wrapKeyFixture);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const handlers = new Map();
  registerOfflineHandlers({ handle: (name, handler) => handlers.set(name, handler) }, db);
  const event = { sender: {} };
  const call = (name, data) => handlers.get(name)(event, data);
  call('offline-set-account', 2);
  const patient = {
    user_id: 1, student_no: 'fixture-1', first_name: 'Synthetic', last_name: 'Patient',
    email: null, phone: null, course: null, year_level: null, blood_type: null,
    allergies: null, chronic_conditions: null,
  };
  assert.equal((await call('offline-cache-bootstrap', { patients: [patient], emrRecords: [] })).success, true);
  assert.equal((await call('offline-search-patients', 'Synthetic'))[0].user_id, 1);
  const mutation = {
    client_mutation_id: 'fixture-mutation', user_id: 2, table_name: 'EMR_RECORDS',
    record_uuid: 'fixture-encounter', action: 'CREATE',
    payload: { patient_user_id: 1, chief_complaint: 'Fixture complaint', diagnosis: 'Fixture diagnosis' },
  };
  assert.equal((await call('offline-queue-mutation', mutation)).success, true);
  assert.equal((await call('offline-get-emr-history', 1))[0].is_draft, 1);
  assert.equal((await call('offline-get-pending-mutations'))[0].client_mutation_id, 'fixture-mutation');
  call('offline-set-account', 3);
  assert.deepEqual(await call('offline-get-pending-mutations'), []);
  assert.deepEqual(await call('offline-get-emr-history', 1), []);
  call('offline-set-account', 2);
  await assert.rejects(call('offline-queue-mutation', { ...mutation, client_mutation_id: 'broken', record_uuid: 'broken-draft', payload: {} }));
  assert.equal(call('offline-pending-count').pending, 1);
  const legacy = { ...mutation, client_mutation_id: 'legacy-only', record_uuid: 'legacy-draft', user_id: 0,
    payload: { ...mutation.payload, appointment_id: 17 } };
  call('offline-import-legacy', [legacy, legacy, mutation]);
  assert.deepEqual(call('offline-unassigned-appointments'), [17]);
  assert.equal(call('offline-pending-count').pending, 1);
  call('offline-assign-legacy', { userId: 3, ids: [17] });
  assert.equal(call('offline-pending-count').pending, 1);
  call('offline-assign-legacy', { userId: 2, ids: [17] });
  assert.equal(call('offline-pending-count').pending, 2);
  assert.deepEqual(call('offline-unassigned-appointments'), []);
  assert.equal((await call('offline-mark-synced', { client_mutation_id: 'fixture-mutation', user_id: 2, server_record_id: 7 })).success, true);
  assert.deepEqual((await call('offline-get-pending-mutations')).map(row => row.client_mutation_id), ['legacy-only']);
  assert.equal(db.prepare("SELECT payload FROM LOCAL_SYNC_LOGS WHERE client_mutation_id = 'fixture-mutation'").get().payload, '{}');
});

test('plaintext database upgrades once, preserving legacy queue data and encrypting the file', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'healthlink-upgrade-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const old = join(dir, 'valetudo_offline.db');
  const target = join(dir, 'valetudo_offline_encrypted.db');
  const db = new DatabaseSync(old);
  initLocalDatabase(db);
  db.prepare(`INSERT INTO LOCAL_SYNC_LOGS
    (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload)
    VALUES ('legacy', 0, 'desktop', 'EMR_RECORDS', 'draft', 'CREATE', ?)`).run(JSON.stringify({ appointment_id: 17, chief_complaint: 'private sentinel' }));
  db.close();
  await assert.rejects(openOfflineDatabase(dir, { isEncryptionAvailable: () => false }));
  assert.equal(existsSync(old), true);

  const encrypted = await openOfflineDatabase(dir, wrapKeyFixture);
  assert.equal(encrypted.prepare('SELECT COUNT(*) AS total FROM LOCAL_SYNC_LOGS').get().total, 1);
  encrypted.close();
  assert.equal(existsSync(old), false);
  assert.equal(readFileSync(target).includes(Buffer.from('private sentinel')), false);
  const plain = new DatabaseSync(target, { readOnly: true });
  try {
    assert.throws(() => plain.prepare('SELECT * FROM LOCAL_SYNC_LOGS').all());
  } finally {
    plain.close();
  }
  const reopened = await openOfflineDatabase(dir, wrapKeyFixture);
  assert.match(reopened.prepare('SELECT payload FROM LOCAL_SYNC_LOGS').get().payload, /private sentinel/);
  reopened.close();
});
