// Tests Firebase OAuth token retrieval, refresh, and invalid service-account handling.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { JWT } from 'google-auth-library';
import { createFcmAppOptions } from '../src/utils/fcmCredential.js';

// Verify that Firebase gets and refreshes a scoped OAuth token through the JWT credential.
test('Firebase gets and refreshes a scoped OAuth token through the JWT credential', async (t) => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });
  let exchanges = 0;
  // Verify the JWT identity and scopes and return a controlled OAuth token.
  t.mock.method(JWT.prototype, 'refreshTokenNoCache', async function () {
    assert.equal(this.email, 'fixture@example.test');
    assert.deepEqual(this.scopes, ['https://www.googleapis.com/auth/firebase.messaging']);
    exchanges += 1;
    return { tokens: {
      access_token: `fixture-token-${exchanges}`,
      expiry_date: Date.now() + (exchanges === 1 ? 120_000 : 3_600_000),
    } };
  });

  const app = initializeApp(createFcmAppOptions({
    type: 'service_account',
    project_id: 'fixture-project',
    client_email: 'fixture@example.test',
    private_key: privateKey,
  }), 'fcm-credential-fixture');
  // Delete the Firebase test app after the test.
  t.after(() => deleteApp(app));

  assert.equal(app.options.projectId, 'fixture-project');
  const first = await app.options.credential.getAccessToken();
  assert.equal(first.access_token, 'fixture-token-1');
  assert.ok(first.expires_in > 0 && first.expires_in <= 120);
  const refreshed = await app.options.credential.getAccessToken();
  assert.equal(refreshed.access_token, 'fixture-token-2');
  assert.ok(refreshed.expires_in > 120);
  assert.equal((await app.options.credential.getAccessToken()).access_token, 'fixture-token-2');
  assert.equal(exchanges, 2);
});

// Verify that FCM setup rejects missing, malformed and unsupported service-account credentials.
test('FCM setup rejects missing, malformed and unsupported service-account credentials', () => {
  // Try constructing options without a service account.
  assert.throws(() => createFcmAppOptions(undefined), /service-account credential/);
  // Try constructing options with an unsupported credential type.
  assert.throws(() => createFcmAppOptions({ type: 'external_account' }), /service-account credential/);
  // Try constructing options with missing signing fields.
  assert.throws(() => createFcmAppOptions({ project_id: 'fixture-project' }), /missing/);
  // Try constructing options with an invalid private key.
  assert.throws(() => createFcmAppOptions({
    project_id: 'fixture-project', client_email: 'fixture@example.test', private_key: 'invalid fixture key',
  }), /valid RSA private key/);
});
