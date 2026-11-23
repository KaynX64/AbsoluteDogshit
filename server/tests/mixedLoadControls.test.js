import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createAdmission, beginDatabaseWork } from '../src/bootstrap/admission.js';

test('admission keeps unfinished database work counted and reserves four SOS slots', async () => {
  const admit = createAdmission();
  const fakeResponse = () => Object.assign(new EventEmitter(), {
    writableFinished: false,
    set(header, value) { this[header] = value; return this; },
    status(code) { this.code = code; return this; },
    json() { this.emit('rejected'); },
  });
  const clinic = { path: '/appointments', method: 'GET' };
  const sos = { path: '/emergency/sos/requests', method: 'POST' };
  const admitted = Array.from({ length: 24 }, fakeResponse);
  let pending;
  admitted.forEach((res, index) => admit(clinic, res, () => { if (index === 0) pending = beginDatabaseWork(); }));
  admitted[0].emit('close');
  const rejected = fakeResponse();
  const rejection = new Promise(resolve => rejected.once('rejected', resolve));
  admit(clinic, rejected, () => assert.fail('Database work still owns the slot'));
  const urgent = Array.from({ length: 4 }, fakeResponse);
  let sosAdmissions = 0;
  urgent.forEach(res => admit(sos, res, () => { sosAdmissions++; }));
  assert.equal(sosAdmissions, 4);
  urgent[0].emit('finish');
  admit(sos, fakeResponse(), () => { sosAdmissions++; });
  assert.equal(sosAdmissions, 5);
  const keepAlive = setTimeout(() => {}, 250);
  try { await rejection; }
  finally { clearTimeout(keepAlive); }
  assert.equal(rejected.code, 503);
  assert.equal(rejected['Retry-After'], '1');
  const nextUrgent = fakeResponse();
  let admittedUrgent = false;
  admit(sos, nextUrgent, () => { admittedUrgent = true; });
  assert.equal(admittedUrgent, false);
  pending();
  assert.equal(admittedUrgent, true);
  nextUrgent.emit('finish');
  let resumed = false;
  admit(clinic, fakeResponse(), () => { resumed = true; });
  assert(resumed);
});

test('transaction retry only repeats work after a confirmed pre-commit rollback', async t => {
  process.env.DB_PASSWORD ||= 'fixture-only';
  const { pool } = await import('../src/db/pool.js');
  const { inTransaction } = await import('../src/db/transaction.js');
  const runs = [];
  let failCommit = false;
  let failRollback = false;
  t.mock.method(pool, 'getConnection', async () => {
    const state = { rollback: 0, destroyed: false };
    runs.push(state);
    return {
      query: async () => {}, beginTransaction: async () => {}, release() {},
      async commit() { if (failCommit) throw Object.assign(new Error('Connection lost'), { code: 'PROTOCOL_CONNECTION_LOST' }); },
      async rollback() { state.rollback++; if (failRollback) throw new Error('Rollback unavailable'); },
      destroy() { state.destroyed = true; },
    };
  });
  const deadlock = () => Object.assign(new Error('Fixture deadlock'), { code: 'ER_LOCK_DEADLOCK' });
  assert.equal(await inTransaction(() => {
    if (runs.length < 3) throw deadlock();
    return 5;
  }, { retries: 2 }), 5);
  assert.deepEqual(runs, [{ rollback: 1, destroyed: true }, { rollback: 1, destroyed: true }, { rollback: 0, destroyed: false }]);
  failCommit = true;
  await assert.rejects(inTransaction(() => {}, { retries: 2 }), error => error.commitUncertain === true);
  assert.equal(runs.length, 4);
  failRollback = true;
  await assert.rejects(inTransaction(() => { throw deadlock(); }, { retries: 2 }), /Fixture deadlock/);
  assert.equal(runs.length, 5);
});
