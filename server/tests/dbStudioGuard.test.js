// Tests Database Studio table restrictions, value masking, and safe writes.
// server/tests/dbStudioGuard.test.js
//
// Run from the server folder:  node --test tests/dbStudioGuard.test.js
// (a throwaway test key is used if ENCRYPTION_KEY is unset)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// cryptoVault throws at import time without a key, so set it BEFORE importing.
process.env.ENCRYPTION_KEY ||= 'x'.repeat(40);
// ... and it is v2-only, so a salt is equally mandatory at import time.
process.env.ENCRYPTION_SALT ||= 'dbstudio-test-salt-0123456789';

const guard = await import('../src/routes/admin/databaseStudio/tablePolicy.js');
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

// Group tests for read-only ledger tables.
describe('read-only ledger tables', () => {
  // Verify that statutory and operational ledgers are read-only.
  test('statutory and operational ledgers are read-only', () => {
    for (const t of ['AUDIT_CHAIN_STATE', 'AUDIT_LOGS', 'PHI_ACCESS_LOGS', 'INVENTORY_LOGS', 'LOCAL_SYNC_LOGS']) {
      assert.equal(isReadOnlyTable(t), true, t);
    }
    assert.deepEqual([...READ_ONLY_TABLES].sort(), [
      'AUDIT_CHAIN_STATE', 'AUDIT_LOGS', 'INVENTORY_LOGS', 'LOCAL_SYNC_LOGS', 'PHI_ACCESS_LOGS', 'QUEUE_TICKET_COUNTERS', 'SCHEMA_MIGRATIONS', 'SERVER_POLICY', 'STAFF_ANALYTICS_PERMISSIONS',
      'RESPONDER_REVIEWERS', 'RESPONDER_QUALIFICATION_SETTINGS', 'RESPONDER_APPLICATIONS', 'RESPONDER_APPOINTMENTS',
      'RESPONDER_QUALIFICATION_EVENTS', 'RESPONDER_EVIDENCE', 'RESPONDER_QUALIFICATION_NOTICES',
    ].sort());
    assert.equal(isReadOnlyTable('schema_migrations'), true);
  });

  // Verify that server policy writes must use its dedicated editor.
  test('server policy writes must use its dedicated editor', () => {
    assert.equal(isReadOnlyTable('SERVER_POLICY'), true);
    assert.equal(isReadOnlyTable('server_policy'), true);
  });

  // Verify that ordinary tables are editable.
  test('ordinary tables are editable', () => {
    assert.equal(isReadOnlyTable('USERS'), false);
    assert.equal(isReadOnlyTable('EMR_RECORDS'), false);
  });
});

// Group tests for column classification.
describe('column classification', () => {
  // Check the classification of known encrypted and ordinary columns.
  test('encrypted columns', () => {
    assert.equal(isEncryptedCol('EMR_RECORDS', 'diagnosis'), true);
    assert.equal(isEncryptedCol('HEALTH_PROFILES', 'allergies'), true);
    assert.equal(isEncryptedCol('PRESCRIPTIONS', 'clinical_snapshot'), true);
    assert.equal(isEncryptedCol('PRESCRIPTION_ITEMS', 'structured_details'), true);
    assert.equal(isEncryptedCol('EMR_RECORDS', 'encounter_date'), false);
    assert.equal(isEncryptedCol('NO_SUCH_TABLE', 'diagnosis'), false);
  });

  // Check the classification of password hashes and ordinary fields.
  test('secret columns', () => {
    assert.equal(isSecretCol('USERS', 'password_hash'), true);
    assert.equal(isSecretCol('USERS', 'email'), false);
  });
});

// Group tests for maskRowForDisplay.
describe('maskRowForDisplay', () => {
  // Assert that the displayed user row masks its password hash.
  test('redacts password_hash', () => {
    const out = maskRowForDisplay('USERS', { user_id: 1, email: 'a@b.c', password_hash: BCRYPT });
    assert.equal(out.password_hash, REDACTED);
    assert.equal(out.email, 'a@b.c');
  });

  // Confirm that masking returns a copy of the supplied row.
  test('does not mutate the input row', () => {
    const row = { password_hash: BCRYPT };
    maskRowForDisplay('USERS', row);
    assert.equal(row.password_hash, BCRYPT);
  });

  // Compare the display result for an empty hash and for an unprotected table.
  test('leaves null hashes alone and other tables untouched', () => {
    assert.equal(maskRowForDisplay('USERS', { password_hash: null }).password_hash, null);
    assert.deepEqual(maskRowForDisplay('QUEUE', { a: 1 }), { a: 1 });
  });
});

// Group tests for protectValues - encrypted columns.
describe('protectValues - encrypted columns', () => {
  // Verify that clinical text becomes decryptable vault ciphertext before storage.
  test('plaintext is encrypted, never stored as plaintext', () => {
    const out = protectValues('EMR_RECORDS', { diagnosis: 'Hypertension' });
    assert.match(out.diagnosis, /^enc:v[12]:/);
    assert.equal(decrypt(out.diagnosis), 'Hypertension');
  });

  // Verify that a structured protected value can be read back as JSON.
  test('objects are JSON-stringified before encrypting', () => {
    const out = protectValues('DENTAL_CHARTS', { chart_data: { 1: { condition: 'sound' } } });
    assert.equal(decrypt(out.chart_data), JSON.stringify({ 1: { condition: 'sound' } }));
  });

  // Preserve an already valid encrypted value without encrypting it again.
  test('valid existing ciphertext passes through unchanged', () => {
    const ct = encrypt('Asthma');
    assert.equal(protectValues('EMR_RECORDS', { diagnosis: ct }).diagnosis, ct);
  });

  // Confirm that clearing fields preserves null and blank values.
  test('null and empty string pass through (clearing a field)', () => {
    assert.equal(protectValues('EMR_RECORDS', { diagnosis: null }).diagnosis, null);
    assert.equal(protectValues('EMR_RECORDS', { diagnosis: '' }).diagnosis, '');
  });

  // Exercise the invalid ciphertext check with an obsolete envelope.
  test('malformed enc:v1: string is rejected', () => {
    assert.throws(
      // Call protectValues with these inputs for the failure assertion.
      () => protectValues('EMR_RECORDS', { diagnosis: 'enc:v1:not-real' }),
      // Match the bad request and malformed ciphertext error.
      (err) => err.status === 400 && /malformed or tampered/.test(err.message)
    );
  });

  // Verify that tampered ciphertext fails GCM authentication and is rejected.
  test('tampered ciphertext fails GCM authentication and is rejected', () => {
    const ct = encrypt('Diabetes');
    const parts = ct.split(':');
    // flip the first hex digit of the ciphertext body
    parts[4] = (parts[4][0] === 'a' ? 'b' : 'a') + parts[4].slice(1);
    // Call protectValues with these inputs for the failure assertion.
    assert.throws(() => protectValues('EMR_RECORDS', { diagnosis: parts.join(':') }), /malformed or tampered/);
  });

  // Preserve ordinary values when no column protection applies.
  test('non-encrypted columns pass through', () => {
    assert.deepEqual(protectValues('QUEUE', { status: 'waiting' }), { status: 'waiting' });
  });
});

// Group tests for protectValues - password_hash.
describe('protectValues - password_hash', () => {
  // Check that a correctly formatted bcrypt hash is accepted for storage.
  test('accepts a bcrypt hash', () => {
    assert.equal(protectValues('USERS', { password_hash: BCRYPT }).password_hash, BCRYPT);
  });

  // Check that plaintext passwords fail Database Studio write validation.
  test('rejects plaintext passwords', () => {
    assert.throws(
      // Call protectValues with these inputs for the failure assertion.
      () => protectValues('USERS', { password_hash: 'hunter2' }),
      // Match the bad request for a credential value that lacks a bcrypt hash.
      (err) => err.status === 400 && /bcrypt/.test(err.message)
    );
  });

  // Check that a non-string password hash fails validation.
  test('rejects non-string values', () => {
    // Call protectValues with these inputs for the failure assertion.
    assert.throws(() => protectValues('USERS', { password_hash: 12345 }), /bcrypt/);
  });

  // Verify that an unchanged masked password field is left out of the database update.
  test('the [REDACTED] placeholder is ignored, not written', () => {
    const out = protectValues('USERS', { password_hash: REDACTED, email: 'x@y.z' });
    assert.equal('password_hash' in out, false);
    assert.equal(out.email, 'x@y.z');
  });
});

// Group tests for isValidCiphertext.
describe('isValidCiphertext', () => {
  // Verify that real ciphertext is valid.
  test('real ciphertext is valid', () => assert.equal(isValidCiphertext(encrypt('ok')), true));
  // Exercise negative cases for the ciphertext detector.
  test('plaintext, null and numbers are not', () => {
    assert.equal(isValidCiphertext('hello'), false);
    assert.equal(isValidCiphertext(null), false);
    assert.equal(isValidCiphertext(42), false);
  });
});

// Group tests for auditSafe - never leaks protected values.
describe('auditSafe - never leaks protected values', () => {
  // Check that the protected audit entry contains a fingerprint and masked value.
  test('encrypted column logs a fingerprint, not plaintext or ciphertext', () => {
    const ct = encrypt('Secret Diagnosis');
    const logged = auditSafe('EMR_RECORDS', 'diagnosis', ct);
    assert.match(logged, /^\[PROTECTED fp:[0-9a-f]{16}\]$/);
    assert.equal(logged.includes('Secret Diagnosis'), false);
    assert.equal(logged.includes(ct), false);
  });

  // Verify that same plaintext gives the same fingerprint despite random IVs.
  test('same plaintext gives the same fingerprint despite random IVs', () => {
    const a = auditSafe('EMR_RECORDS', 'diagnosis', encrypt('Flu'));
    const b = auditSafe('EMR_RECORDS', 'diagnosis', encrypt('Flu'));
    assert.equal(a, b);
    assert.notEqual(a, auditSafe('EMR_RECORDS', 'diagnosis', encrypt('Cold')));
  });

  // Check that password audit entries contain a fingerprint.
  test('password_hash is fingerprinted, not logged raw', () => {
    const logged = auditSafe('USERS', 'password_hash', BCRYPT);
    assert.match(logged, /^\[PROTECTED fp:/);
    assert.equal(logged.includes(BCRYPT), false);
  });

  // Verify that null and empty protected values log as null.
  test('null and empty protected values log as null', () => {
    assert.equal(auditSafe('EMR_RECORDS', 'diagnosis', null), null);
    assert.equal(auditSafe('EMR_RECORDS', 'diagnosis', ''), null);
  });

  // Verify that unreadable ciphertext is flagged without leaking anything.
  test('unreadable ciphertext is flagged without leaking anything', () => {
    // valid envelope shape, wrong auth tag -> decrypt fails
    const bad = `enc:v1:${'0'.repeat(24)}:${'0'.repeat(32)}:abcd`;
    assert.equal(auditSafe('EMR_RECORDS', 'diagnosis', bad), '[PROTECTED unreadable]');
  });

  // Verify that ordinary values are logged as strings and long ones truncated.
  test('ordinary values are logged as strings and long ones truncated', () => {
    assert.equal(auditSafe('QUEUE', 'status', 'waiting'), 'waiting');
    const long = auditSafe('QUEUE', 'status', 'x'.repeat(600));
    assert.equal(long.length, 501);
    assert.ok(long.endsWith('…'));
  });

  // Verify that fingerprint is deterministic and 16 hex chars.
  test('fingerprint is deterministic and 16 hex chars', () => {
    assert.equal(fingerprint('abc'), fingerprint('abc'));
    assert.match(fingerprint('abc'), /^[0-9a-f]{16}$/);
  });
});

// Group tests for assertPrimaryKey.
describe('assertPrimaryKey', () => {
  // Submit a complete composite key with its fields in a different order.
  test('accepts exactly the primary-key columns (any order)', () => {
    // Call assertPrimaryKey with these inputs for the success assertion.
    assert.doesNotThrow(() => assertPrimaryKey({ a: 1, b: 2 }, ['b', 'a']));
  });

  // Exercise the exact-field requirement with incomplete and unexpected primary keys.
  test('rejects missing, extra, or wrong keys', () => {
    // Call assertPrimaryKey with these inputs for the failure assertion.
    assert.throws(() => assertPrimaryKey({ a: 1 }, ['a', 'b']), /must contain exactly/);
    // Call assertPrimaryKey with these inputs for the failure assertion.
    assert.throws(() => assertPrimaryKey({ a: 1, b: 2, c: 3 }, ['a', 'b']), /must contain exactly/);
    // Call assertPrimaryKey with these inputs for the failure assertion.
    assert.throws(() => assertPrimaryKey({ x: 1 }, ['a']), /must contain exactly/);
  });

  // Check that rows in tables without a primary key cannot be edited through this validator.
  test('rejects tables with no primary key', () => {
    // Call assertPrimaryKey with these inputs for the failure assertion.
    assert.throws(() => assertPrimaryKey({}, []), /no primary key/);
  });
});

// Group tests for assertKnownColumns.
describe('assertKnownColumns', () => {
  const names = new Set(['id', 'name']);
  // Submit a field list that is fully represented in the table metadata.
  test('accepts known columns', () => assert.doesNotThrow(/* Call assertKnownColumns with these inputs for the success assertion. */ () => assertKnownColumns(['id', 'name'], names)));
  // Check that validation names each column missing from the table metadata.
  test('rejects unknown columns and lists them', () => {
    assert.throws(
      // Call assertKnownColumns with these inputs for the failure assertion.
      () => assertKnownColumns(['id', 'evil', 'x'], names),
      // Verify that the invalid-column error identifies the unsupported fields.
      (err) => err.status === 400 && /evil, x/.test(err.message)
    );
  });
});

// Group tests for planDelete / shouldBumpVersion.
describe('planDelete / shouldBumpVersion', () => {
  // Verify that a table with a deletion timestamp uses soft deletion.
  test('soft delete only when deleted_at exists', () => {
    assert.equal(planDelete(new Set(['deleted_at', 'id'])), 'soft');
    assert.equal(planDelete(new Set(['id'])), 'hard');
  });

  // Verify automatic version increments for writes that omit an explicit version.
  test('version is bumped for sync tables unless the admin sets it', () => {
    assert.equal(shouldBumpVersion(new Set(['version']), { name: 'x' }), true);
    assert.equal(shouldBumpVersion(new Set(['version']), { version: 9 }), false);
    assert.equal(shouldBumpVersion(new Set(['name']), { name: 'x' }), false);
  });
});

// Group tests for normalizeValue.
describe('normalizeValue', () => {
  // Compare how null values, dates, binary data, and objects are normalized for audit entries.
  test('handles null, dates, buffers, objects', () => {
    assert.equal(normalizeValue(null), null);
    assert.equal(normalizeValue(undefined), null);
    assert.equal(normalizeValue(new Date('2026-01-02T03:04:05Z')), '2026-01-02T03:04:05.000Z');
    assert.equal(normalizeValue(Buffer.from('ab')), '6162');
    assert.equal(normalizeValue({ a: 1 }), '{"a":1}');
    assert.equal(normalizeValue(7), '7');
  });
});
