// server/tests/cryptoVault.test.js
//
// Run from the server folder:  node --test tests/cryptoVault.test.js
//
// cryptoVault reads its keys when it is first imported, so every scenario runs in a fresh
// child process, started from an empty temp folder so a real server/.env is never loaded.
//
// The vault is v2-ONLY since the v1→v2 migration completed: ENCRYPTION_SALT is mandatory,
// leftover enc:v1 values decrypt to the DECRYPT_FAILED marker (they are NOT migrated on
// the fly), and there is no legacy/no-salt fallback mode. These tests pin that behaviour.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const VAULT_URL = pathToFileURL(join(import.meta.dirname, '../src/utils/cryptoVault.js')).href;
const CWD = mkdtempSync(join(tmpdir(), 'vault-test-'));
const KEY = 'k'.repeat(40);
const SALT_A = 'salt-A-0123456789abcdef';
const SALT_B = 'salt-B-0123456789abcdef';
const DECRYPT_FAILED = '[ENCRYPTED PHI - INTEGRITY VERIFICATION FAILED]';

/** Runs `body` (an async function body using `v`, the vault module) and returns its JSON result. */
function run(env, body) {
  const code = `
    const v = await import(${JSON.stringify(VAULT_URL)});
    const out = await (async () => { ${body} })();
    process.stdout.write('@@' + JSON.stringify(out));
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: CWD,
    env: { PATH: process.env.PATH, ENCRYPTION_KEY: KEY, ...env },
    encoding: 'utf8',
  });
  if (r.status !== 0) return { crashed: true, stderr: r.stderr };
  return JSON.parse(r.stdout.split('@@').pop());
}

describe('v2 envelope (the only supported format)', () => {
  test('writes enc:v2 and round-trips', () => {
    const out = run({ ENCRYPTION_SALT: SALT_A }, `const c = v.encrypt('Asthma'); return { c, p: v.decrypt(c) };`);
    assert.match(out.c, /^enc:v2:/);
    assert.equal(out.p, 'Asthma');
  });

  test('a different salt cannot read v2 data (salt actually separates deployments)', () => {
    const v2 = run({ ENCRYPTION_SALT: SALT_A }, `return v.encrypt('secret');`);
    const out = run({ ENCRYPTION_SALT: SALT_B }, `return v.decrypt(${JSON.stringify(v2)});`);
    assert.equal(out, DECRYPT_FAILED);
  });

  test('tampered v2 ciphertext fails authentication', () => {
    const out = run({ ENCRYPTION_SALT: SALT_A }, `
      const parts = v.encrypt('Diabetes').split(':');
      parts[4] = (parts[4][0] === 'a' ? 'b' : 'a') + parts[4].slice(1);
      return v.decrypt(parts.join(':'));`);
    assert.equal(out, DECRYPT_FAILED);
  });

  test('leftover pre-migration enc:v1 values return the integrity marker, never garbage', () => {
    // A real enc:v1 envelope from a pre-migration backup. The vault must not
    // attempt to decrypt it with the v2 key — it reports the marker instead.
    const v1 = 'enc:v1:8b4e6b1c2a3d4e5f6a7b:6f5e4d3c2b1a0f9e8d7c:9f8e7d6c5b4a3f2e1d0c';
    const out = run({ ENCRYPTION_SALT: SALT_A }, `return v.decrypt(${JSON.stringify(v1)});`);
    assert.equal(out, DECRYPT_FAILED);
  });

  test('malformed enc:v2 envelopes are rejected, not decrypted blindly', () => {
    const out = run({ ENCRYPTION_SALT: SALT_A }, `return v.decrypt('enc:v2:zzzz:zzzz:zzzz');`);
    assert.equal(out, DECRYPT_FAILED);
  });

  test('plaintext, null and blank values behave as before', () => {
    const out = run({ ENCRYPTION_SALT: SALT_A }, `
      return [v.decrypt('plain text'), v.decrypt(null) === null, v.encrypt(null) === null, v.encrypt('   ')];`);
    assert.deepEqual(out, ['plain text', true, true, '']);
  });
});

describe('helpers', () => {
  test('isEncryptedValue recognises only enc:v2 envelopes', () => {
    const out = run({ ENCRYPTION_SALT: SALT_A }, `
      return [v.isEncryptedValue('enc:v2:x'), v.isEncryptedValue('enc:v1:x'),
              v.isEncryptedValue('hello'), v.isEncryptedValue(null)];`);
    assert.deepEqual(out, [true, false, false, false]);
  });
});

describe('startup validation (fail-closed, v2-only)', () => {
  test('refuses to boot without ENCRYPTION_SALT (no legacy mode)', () => {
    assert.equal(run({}, `return 1;`).crashed, true);
  });

  test('an empty ENCRYPTION_SALT is treated as unset (refuses to boot)', () => {
    assert.equal(run({ ENCRYPTION_SALT: '' }, `return 1;`).crashed, true);
  });

  test('rejects a salt shorter than 16 characters', () => {
    assert.equal(run({ ENCRYPTION_SALT: 'short' }, `return 1;`).crashed, true);
  });

  test('rejects reusing the legacy hardcoded salt', () => {
    assert.equal(run({ ENCRYPTION_SALT: 'valetudo-healthlink-v1' }, `return 1;`).crashed, true);
  });

  test('still refuses a missing or short ENCRYPTION_KEY', () => {
    assert.equal(run({ ENCRYPTION_KEY: 'too-short' }, `return 1;`).crashed, true);
  });
});
