// server/tests/dbStudioGuard.test.js
//
// Run from the server folder:  node --test tests/dbStudioGuard.test.js
// (a throwaway test key is used if ENCRYPTION_KEY is unset)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// cryptoVault throws at import time without a key, so set it BEFORE importing.
process.env.ENCRYPTION_KEY ||= 'x'.repeat(40);

const guard = await import('../src/utils/dbStudioGuard.js');
const vault = await import('../src/utils/cryptoVault.js');

const {
  REDACTED,
  READ_ONLY_TABLES,
  isReadOnlyTable,
  isEncryptedCol,
  isSecretCol,
  maskRowForDisplay,
  isValidCiphertext,
  protectValues,
  auditSafe,
  fingerprint,
  assertKnownColumns,
  assertPrimaryKey,
  planDelete,
  shouldBumpVersion,
  normalizeValue,
} = guard;
const { encrypt, decrypt } = vault;

// A syntactically valid bcrypt hash (cost 10, 53 chars after the prefix).
const BCRYPT = '$2b$10$' + 'a'.repeat(53);

describe('read-only ledger tables', () => {
  test('statutory ledgers are read-only', () => {
    for (const t of ['AUDIT_LOGS', 'PHI_ACCESS_LOGS', 'INVENTORY_LOGS']) {
      assert.equal(isReadOnlyTable(t), true, t);
    }
    assert.deepEqual([...READ_ONLY_TABLES].sort(), ['AUDIT_LOGS', 'INVENTORY_LOGS', 'PHI_ACCESS_LOGS']);
  });

  test('ordinary tables are editable', () => {
    assert.equal(isReadOnlyTable('USERS'), false);
    assert.equal(isReadOnlyTable('EMR_RECORDS'), false);
  });
});

describe('column classification', () => {
  test('encrypted columns', () => {
    assert.equal(isEncryptedCol('EMR_RECORDS', 'diagnosis'), true);
    assert.equal(isEncryptedCol('HEALTH_PROFILES', 'allergies'), true);
    assert.equal(isEncryptedCol('EMR_RECORDS', 'encounter_date'), false);
    assert.equal(isEncryptedCol('NO_SUCH_TABLE', 'diagnosis'), false);
  });

  test('secret columns', () => {
    assert.equal(isSecretCol('USERS', 'password_hash'), true);
    assert.equal(isSecretCol('USERS', 'email'), false);
  });
});

describe('maskRowForDisplay', () => {
  test('redacts password_hash', () => {
    const out = maskRowForDisplay('USERS', { user_id: 1, email: 'a@b.c', password_hash: BCRYPT });
    assert.equal(out.password_hash, REDACTED);
    assert.equal(out.email, 'a@b.c');
  });

  test('does not mutate the input row', () => {
    const row = { password_hash: BCRYPT };
    maskRowForDisplay('USERS', row);
    assert.equal(row.password_hash, BCRYPT);
  });

  test('leaves null hashes alone and other tables untouched', () => {
    assert.equal(maskRowForDisplay('USERS', { password_hash: null }).password_hash, null);
    assert.deepEqual(maskRowForDisplay('QUEUE', { a: 1 }), { a: 1 });
  });
});

describe('protectValues - encrypted columns', () => {
  test('plaintext is encrypted, never stored as plaintext', () => {
    const out = protectValues('EMR_RECORDS', { diagnosis: 'Hypertension' });
    assert.match(out.diagnosis, /^enc:v[12]:/);
    assert.equal(decrypt(out.diagnosis), 'Hypertension');
  });

  test('objects are JSON-stringified before encrypting', () => {
    const out = protectValues('DENTAL_CHARTS', { chart_data: { 1: { condition: 'sound' } } });
    assert.equal(decrypt(out.chart_data), JSON.stringify({ 1: { condition: 'sound' } }));
  });

  test('valid existing ciphertext passes through unchanged', () => {
    const ct = encrypt('Asthma');
    assert.equal(protectValues('EMR_RECORDS', { diagnosis: ct }).diagnosis, ct);
  });

  test('null and empty string pass through (clearing a field)', () => {
    assert.equal(protectValues('EMR_RECORDS', { diagnosis: null }).diagnosis, null);
    assert.equal(protectValues('EMR_RECORDS', { diagnosis: '' }).diagnosis, '');
  });

  test('malformed enc:v1: string is rejected', () => {
    assert.throws(
      () => protectValues('EMR_RECORDS', { diagnosis: 'enc:v1:not-real' }),
      (err) => err.status === 400 && /malformed or tampered/.test(err.message)
    );
  });

  test('tampered ciphertext fails GCM authentication and is rejected', () => {
    const ct = encrypt('Diabetes');
    const parts = ct.split(':');
    // flip the first hex digit of the ciphertext body
    parts[4] = (parts[4][0] === 'a' ? 'b' : 'a') + parts[4].slice(1);
    assert.throws(() => protectValues('EMR_RECORDS', { diagnosis: parts.join(':') }), /malformed or tampered/);
  });

  test('non-encrypted columns pass through', () => {
    assert.deepEqual(protectValues('QUEUE', { status: 'waiting' }), { status: 'waiting' });
  });
});

describe('protectValues - password_hash', () => {
  test('accepts a bcrypt hash', () => {
    assert.equal(protectValues('USERS', { password_hash: BCRYPT }).password_hash, BCRYPT);
  });

  test('rejects plaintext passwords', () => {
    assert.throws(
      () => protectValues('USERS', { password_hash: 'hunter2' }),
      (err) => err.status === 400 && /bcrypt/.test(err.message)
    );
  });

  test('rejects non-string values', () => {
    assert.throws(() => protectValues('USERS', { password_hash: 12345 }), /bcrypt/);
  });

  test('the [REDACTED] placeholder is ignored, not written', () => {
    const out = protectValues('USERS', { password_hash: REDACTED, email: 'x@y.z' });
    assert.equal('password_hash' in out, false);
    assert.equal(out.email, 'x@y.z');
  });
});

describe('isValidCiphertext', () => {
  test('real ciphertext is valid', () => assert.equal(isValidCiphertext(encrypt('ok')), true));
  test('plaintext, null and numbers are not', () => {
    assert.equal(isValidCiphertext('hello'), false);
    assert.equal(isValidCiphertext(null), false);
    assert.equal(isValidCiphertext(42), false);
  });
});

describe('auditSafe - never leaks protected values', () => {
  test('encrypted column logs a fingerprint, not plaintext or ciphertext', () => {
    const ct = encrypt('Secret Diagnosis');
    const logged = auditSafe('EMR_RECORDS', 'diagnosis', ct);
    assert.match(logged, /^\[PROTECTED fp:[0-9a-f]{16}\]$/);
    assert.equal(logged.includes('Secret Diagnosis'), false);
    assert.equal(logged.includes(ct), false);
  });

  test('same plaintext gives the same fingerprint despite random IVs', () => {
    const a = auditSafe('EMR_RECORDS', 'diagnosis', encrypt('Flu'));
    const b = auditSafe('EMR_RECORDS', 'diagnosis', encrypt('Flu'));
    assert.equal(a, b);
    assert.notEqual(a, auditSafe('EMR_RECORDS', 'diagnosis', encrypt('Cold')));
  });

  test('password_hash is fingerprinted, not logged raw', () => {
    const logged = auditSafe('USERS', 'password_hash', BCRYPT);
    assert.match(logged, /^\[PROTECTED fp:/);
    assert.equal(logged.includes(BCRYPT), false);
  });

  test('null and empty protected values log as null', () => {
    assert.equal(auditSafe('EMR_RECORDS', 'diagnosis', null), null);
    assert.equal(auditSafe('EMR_RECORDS', 'diagnosis', ''), null);
  });

  test('unreadable ciphertext is flagged without leaking anything', () => {
    // valid envelope shape, wrong auth tag -> decrypt fails
    const bad = `enc:v1:${'0'.repeat(24)}:${'0'.repeat(32)}:abcd`;
    assert.equal(auditSafe('EMR_RECORDS', 'diagnosis', bad), '[PROTECTED unreadable]');
  });

  test('ordinary values are logged as strings and long ones truncated', () => {
    assert.equal(auditSafe('QUEUE', 'status', 'waiting'), 'waiting');
    const long = auditSafe('QUEUE', 'status', 'x'.repeat(600));
    assert.equal(long.length, 501);
    assert.ok(long.endsWith('…'));
  });

  test('fingerprint is deterministic and 16 hex chars', () => {
    assert.equal(fingerprint('abc'), fingerprint('abc'));
    assert.match(fingerprint('abc'), /^[0-9a-f]{16}$/);
  });
});

describe('assertPrimaryKey', () => {
  test('accepts exactly the primary-key columns (any order)', () => {
    assert.doesNotThrow(() => assertPrimaryKey({ a: 1, b: 2 }, ['b', 'a']));
  });

  test('rejects missing, extra, or wrong keys', () => {
    assert.throws(() => assertPrimaryKey({ a: 1 }, ['a', 'b']), /must contain exactly/);
    assert.throws(() => assertPrimaryKey({ a: 1, b: 2, c: 3 }, ['a', 'b']), /must contain exactly/);
    assert.throws(() => assertPrimaryKey({ x: 1 }, ['a']), /must contain exactly/);
  });

  test('rejects tables with no primary key', () => {
    assert.throws(() => assertPrimaryKey({}, []), /no primary key/);
  });
});

describe('assertKnownColumns', () => {
  const names = new Set(['id', 'name']);
  test('accepts known columns', () => assert.doesNotThrow(() => assertKnownColumns(['id', 'name'], names)));
  test('rejects unknown columns and lists them', () => {
    assert.throws(
      () => assertKnownColumns(['id', 'evil', 'x'], names),
      (err) => err.status === 400 && /evil, x/.test(err.message)
    );
  });
});

describe('planDelete / shouldBumpVersion', () => {
  test('soft delete only when deleted_at exists', () => {
    assert.equal(planDelete(new Set(['deleted_at', 'id'])), 'soft');
    assert.equal(planDelete(new Set(['id'])), 'hard');
  });

  test('version is bumped for sync tables unless the admin sets it', () => {
    assert.equal(shouldBumpVersion(new Set(['version']), { name: 'x' }), true);
    assert.equal(shouldBumpVersion(new Set(['version']), { version: 9 }), false);
    assert.equal(shouldBumpVersion(new Set(['name']), { name: 'x' }), false);
  });
});

describe('normalizeValue', () => {
  test('handles null, dates, buffers, objects', () => {
    assert.equal(normalizeValue(null), null);
    assert.equal(normalizeValue(undefined), null);
    assert.equal(normalizeValue(new Date('2026-01-02T03:04:05Z')), '2026-01-02T03:04:05.000Z');
    assert.equal(normalizeValue(Buffer.from('ab')), '6162');
    assert.equal(normalizeValue({ a: 1 }), '{"a":1}');
    assert.equal(normalizeValue(7), '7');
  });
});