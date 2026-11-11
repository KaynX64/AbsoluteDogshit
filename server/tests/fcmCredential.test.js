import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { JWT } from 'google-auth-library';
import { createFcmAppOptions } from '../src/utils/fcmCredential.js';

test('Firebase gets and refreshes a scoped OAuth token through the JWT credential', async (t) => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });
  let exchanges = 0;
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

test('FCM setup rejects missing, malformed and unsupported service-account credentials', () => {
  assert.throws(() => createFcmAppOptions(undefined), /service-account credential/);
  assert.throws(() => createFcmAppOptions({ type: 'external_account' }), /service-account credential/);
  assert.throws(() => createFcmAppOptions({ project_id: 'fixture-project' }), /missing/);
  assert.throws(() => createFcmAppOptions({
    project_id: 'fixture-project', client_email: 'fixture@example.test', private_key: 'invalid fixture key',
  }), /valid RSA private key/);
});
