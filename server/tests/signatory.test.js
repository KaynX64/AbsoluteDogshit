import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSignatureEnrolled, SignerError } from '../src/documents/signing/signatory.js';

test('assertSignatureEnrolled returns the saved signature metadata', async () => {
  const signature = { signature_s3_key: 'signatures/test.png', signature_sha256: 'abc123' };
  const connection = {
    async query(sql, values) {
      assert.match(sql, /FROM STAFF_PROFILES WHERE user_id = \?/);
      assert.deepEqual(values, [42]);
      return [[signature]];
    },
  };

  assert.deepEqual(await assertSignatureEnrolled(connection, 42), signature);
});

test('assertSignatureEnrolled blocks issuance without a saved signature', async () => {
  const connection = { async query() { return [[]]; } };

  await assert.rejects(
    assertSignatureEnrolled(connection, 42),
    (error) => {
      assert.ok(error instanceof SignerError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'SIGNATURE_NOT_ENROLLED');
      assert.match(error.message, /patient would receive a document without your signature/);
      return true;
    }
  );
});
