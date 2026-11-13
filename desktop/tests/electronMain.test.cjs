const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
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
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const schema = readFileSync(resolve(__dirname, '../electron/offline/database.cjs'), 'utf8');
  const runtime = { module: {}, console: { log() {} }, require: name => ({
    electron: { app: { getPath: () => 'fixture' } },
    'node:path': { join: (...parts) => parts.join('/') },
    'node:fs': { existsSync: () => true },
    'node:sqlite': { DatabaseSync: function () { return db; } },
  })[name] };
  runInNewContext(schema, runtime);
  runtime.module.exports.initLocalDatabase();
  const handlers = new Map();
  registerOfflineHandlers({ handle: (name, handler) => handlers.set(name, handler) }, db);
  const call = (name, data) => handlers.get(name)(null, data);
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
  assert.equal((await call('offline-mark-synced', { client_mutation_id: 'fixture-mutation', server_record_id: 7 })).success, true);
  assert.deepEqual(await call('offline-get-pending-mutations'), []);
});
