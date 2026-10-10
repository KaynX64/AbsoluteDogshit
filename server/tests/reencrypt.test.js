// server/tests/reencrypt.test.js
//
// Run from the server folder:  node --test tests/reencrypt.test.js
// Exercises the v1 -> v2 migration core against an in-memory fake of the mysql2 connection.
// Needs a salt, so one is set before cryptoVault is imported. Legacy v1 ciphertext is produced
// in a child process (no salt configured there), exactly like pre-migration data.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const KEY = 'k'.repeat(40);
process.env.ENCRYPTION_KEY = KEY;
process.env.ENCRYPTION_SALT = 'reencrypt-test-salt-0123456789';

const { reencryptColumn } = await import('../src/utils/reencrypt.js');
const { decrypt } = await import('../src/utils/cryptoVault.js');

const VAULT_URL = pathToFileURL(join(import.meta.dirname, '../src/utils/cryptoVault.js')).href;
const CWD = mkdtempSync(join(tmpdir(), 'reenc-test-'));

/** Produces real legacy (enc:v1) ciphertexts, as the pre-migration database would hold. */
function legacyCiphertexts(plains) {
  const code = `
    const v = await import(${JSON.stringify(VAULT_URL)});
    process.stdout.write(JSON.stringify(${JSON.stringify(plains)}.map((p) => v.encrypt(p))));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: CWD,
    env: { PATH: process.env.PATH, ENCRYPTION_KEY: KEY },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

/** Minimal fake of a mysql2 connection holding one table: [{ id, val }]. */
function fakeConn(rows, { onUpdate } = {}) {
  const calls = { begin: 0, commit: 0, rollback: 0, updates: 0 };
  return {
    rows,
    calls,
    async beginTransaction() { calls.begin++; },
    async commit() { calls.commit++; },
    async rollback() { calls.rollback++; },
    async query(sql, params) {
      if (sql.startsWith('SELECT')) {
        const lastId = params[4];
        const limit = params[params.length - 1];
        const batch = rows
          .filter((r) => r.id > lastId && typeof r.val === 'string' && r.val.startsWith('enc:v1:'))
          .sort((a, b) => a.id - b.id)
          .slice(0, limit)
          .map((r) => ({ id: r.id, val: r.val }));
        return [batch];
      }
      if (sql.startsWith('UPDATE')) {
        calls.updates++;
        if (onUpdate) onUpdate(rows, params);
        const [, , next, , id, , old] = params;
        const row = rows.find((r) => r.id === id && r.val === old);
        if (!row) return [{ affectedRows: 0 }];
        row.val = next;
        return [{ affectedRows: 1 }];
      }
      throw new Error('unexpected sql: ' + sql);
    },
  };
}

const PLAINS = ['Hypertension', 'Asthma', 'Type 2 Diabetes', 'None recorded', 'Flu'];

describe('reencryptColumn', () => {
  test('dry run reports what would change and writes nothing', async () => {
    const v1 = legacyCiphertexts(PLAINS);
    const conn = fakeConn(v1.map((val, i) => ({ id: i + 1, val })));
    const before = conn.rows.map((r) => r.val);

    const s = await reencryptColumn(conn, 'EMR_RECORDS', 'diagnosis', 'emr_id', { apply: false });

    assert.equal(s.scanned, 5);
    assert.equal(s.converted, 5);
    assert.equal(s.failed, 0);
    assert.equal(conn.calls.updates, 0);
    assert.equal(conn.calls.begin, 0);
    assert.deepEqual(conn.rows.map((r) => r.val), before);
  });

  test('apply converts every row to v2 and preserves the plaintext', async () => {
    const v1 = legacyCiphertexts(PLAINS);
    const conn = fakeConn(v1.map((val, i) => ({ id: i + 1, val })));

    const s = await reencryptColumn(conn, 'EMR_RECORDS', 'diagnosis', 'emr_id', { apply: true });

    assert.equal(s.converted, 5);
    assert.equal(s.failed, 0);
    conn.rows.forEach((r, i) => {
      assert.match(r.val, /^enc:v2:/);
      assert.equal(decrypt(r.val), PLAINS[i]);
    });
  });

  test('is idempotent: a second run finds nothing left to convert', async () => {
    const v1 = legacyCiphertexts(PLAINS);
    const conn = fakeConn(v1.map((val, i) => ({ id: i + 1, val })));
    await reencryptColumn(conn, 'EMR_RECORDS', 'diagnosis', 'emr_id', { apply: true });
    const again = await reencryptColumn(conn, 'EMR_RECORDS', 'diagnosis', 'emr_id', { apply: true });
    assert.equal(again.scanned, 0);
    assert.equal(again.converted, 0);
  });

  test('works across multiple batches', async () => {
    const plains = Array.from({ length: 12 }, (_, i) => `diagnosis ${i}`);
    const v1 = legacyCiphertexts(plains);
    const conn = fakeConn(v1.map((val, i) => ({ id: (i + 1) * 3, val }))); // gaps in ids
    const s = await reencryptColumn(conn, 'EMR_RECORDS', 'diagnosis', 'emr_id', { apply: true, batchSize: 5 });
    assert.equal(s.converted, 12);
    assert.ok(conn.calls.commit >= 3);
    conn.rows.forEach((r, i) => assert.equal(decrypt(r.val), plains[i]));
  });

  test('leaves plaintext, null, empty and already-v2 rows alone', async () => {
    const [v1] = legacyCiphertexts(['Mixed']);
    const alreadyV2 = decrypt(v1) && (await import('../src/utils/cryptoVault.js')).encrypt('Already new');
    const conn = fakeConn([
      { id: 1, val: 'legacy plaintext seed' },
      { id: 2, val: null },
      { id: 3, val: '' },
      { id: 4, val: alreadyV2 },
      { id: 5, val: v1 },
    ]);
    const s = await reencryptColumn(conn, 'EMR_RECORDS', 'diagnosis', 'emr_id', { apply: true });
    assert.equal(s.scanned, 1);
    assert.equal(s.converted, 1);
    assert.equal(conn.rows[0].val, 'legacy plaintext seed');
    assert.equal(conn.rows[1].val, null);
    assert.equal(conn.rows[2].val, '');
    assert.equal(conn.rows[3].val, alreadyV2);
    assert.match(conn.rows[4].val, /^enc:v2:/);
  });

  test('an unreadable row is left untouched and counted, never destroyed', async () => {
    const [good] = legacyCiphertexts(['Fine']);
    const corrupt = `enc:v1:${'0'.repeat(24)}:${'0'.repeat(32)}:abcd`;
    const conn = fakeConn([{ id: 1, val: corrupt }, { id: 2, val: good }]);
    const logs = [];
    const s = await reencryptColumn(conn, 'EMR_RECORDS', 'diagnosis', 'emr_id', { apply: true, log: (m) => logs.push(m) });
    assert.equal(s.failed, 1);
    assert.equal(s.converted, 1);
    assert.equal(conn.rows[0].val, corrupt);       // untouched
    assert.match(conn.rows[1].val, /^enc:v2:/);
    assert.equal(logs.length, 1);
    assert.ok(!logs[0].includes(corrupt));          // the log never prints ciphertext
  });

  test('a row edited by someone else mid-run is skipped, not overwritten', async () => {
    const [a, b] = legacyCiphertexts(['One', 'Two']);
    const conn = fakeConn(
      [{ id: 1, val: a }, { id: 2, val: b }],
      { onUpdate: (rows) => { rows[0].val = 'enc:v1:changed-by-someone-else'; } } // races the first UPDATE
    );
    const s = await reencryptColumn(conn, 'EMR_RECORDS', 'diagnosis', 'emr_id', { apply: true });
    assert.equal(s.skipped, 1);
    assert.equal(s.converted, 1);
    assert.equal(conn.rows[0].val, 'enc:v1:changed-by-someone-else');
  });

  test('rolls back the batch if a write throws', async () => {
    const [a] = legacyCiphertexts(['One']);
    const conn = fakeConn([{ id: 1, val: a }]);
    const origQuery = conn.query.bind(conn);
    conn.query = async (sql, params) => {
      if (sql.startsWith('UPDATE')) throw new Error('db down');
      return origQuery(sql, params);
    };
    await assert.rejects(() => reencryptColumn(conn, 'EMR_RECORDS', 'diagnosis', 'emr_id', { apply: true }), /db down/);
    assert.equal(conn.calls.rollback, 1);
    assert.equal(conn.calls.commit, 0);
  });

  test('refuses non-numeric primary keys', async () => {
    const [a] = legacyCiphertexts(['One']);
    const conn = fakeConn([{ id: 'abc', val: a }]);
    conn.query = async (sql) => (sql.startsWith('SELECT') ? [[{ id: 'abc', val: a }]] : [{ affectedRows: 1 }]);
    await assert.rejects(() => reencryptColumn(conn, 'T', 'c', 'id'), /numeric primary key/);
  });
});