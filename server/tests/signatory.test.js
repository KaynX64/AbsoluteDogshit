// Verifies that official document issuance requires an enrolled clinician signature.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSignatureEnrolled, SignerError } from '../src/documents/signing/signatory.js';

// Verify that assertSignatureEnrolled returns the saved signature metadata.
test('assertSignatureEnrolled returns the saved signature metadata', async () => {
  const signature = { signature_s3_key: 'signatures/test.png', signature_sha256: 'abc123' };
  const connection = {
    // Assert the signature lookup targets the fixture clinician and return saved metadata.
    async query(sql, values) {
      assert.match(sql, /FROM STAFF_PROFILES WHERE user_id = \?/);
      assert.deepEqual(values, [42]);
      return [[signature]];
    },
  };

  assert.deepEqual(await assertSignatureEnrolled(connection, 42), signature);
});

// Verify that assertSignatureEnrolled blocks issuance without a saved signature.
test('assertSignatureEnrolled blocks issuance without a saved signature', async () => {
  // Return no matching signature enrollment for the rejection case.
  const connection = { async query() { return [[]]; } };

  // Verify the missing signature produces the expected signing error.
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
