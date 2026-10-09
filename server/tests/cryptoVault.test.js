// server/tests/cryptoVault.test.js
//
// Run from the server folder:  node --test tests/cryptoVault.test.js
//
// cryptoVault reads its keys when it is first imported, so every scenario runs in a fresh
// child process, started from an empty temp folder so a real server/.env is never loaded.
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

describe('without ENCRYPTION_SALT (legacy mode)', () => {
  test('writes enc:v1 and round-trips', () => {
    const out = run({}, `const c = v.encrypt('Hypertension'); return { c, p: v.decrypt(c), ver: v.ACTIVE_VERSION };`);
    assert.match(out.c, /^enc:v1:/);
    assert.equal(out.p, 'Hypertension');
    assert.equal(out.ver, 'v1');
  });

  test('cannot read enc:v2 data (no salt) and reports integrity failure, not garbage', () => {
    const v2 = run({ ENCRYPTION_SALT: SALT_A }, `return v.encrypt('secret');`);
    const out = run({}, `return v.decrypt(${JSON.stringify(v2)});`);
    assert.equal(out, '[ENCRYPTED PHI - INTEGRITY VERIFICATION FAILED]');
  });
});

describe('with ENCRYPTION_SALT', () => {
  test('writes enc:v2 and round-trips', () => {
    const out = run({ ENCRYPTION_SALT: SALT_A }, `const c = v.encrypt('Asthma'); return { c, p: v.decrypt(c), ver: v.ACTIVE_VERSION };`);
    assert.match(out.c, /^enc:v2:/);
    assert.equal(out.p, 'Asthma');
    assert.equal(out.ver, 'v2');
  });

  test('existing enc:v1 data still decrypts after the salt is configured', () => {
    const v1 = run({}, `return v.encrypt('Old record');`);
    assert.match(v1, /^enc:v1:/);
    const out = run({ ENCRYPTION_SALT: SALT_A }, `return v.decrypt(${JSON.stringify(v1)});`);
    assert.equal(out, 'Old record');
  });

  test('a different salt cannot read v2 data (salt actually separates deployments)', () => {
    const v2 = run({ ENCRYPTION_SALT: SALT_A }, `return v.encrypt('secret');`);
    const out = run({ ENCRYPTION_SALT: SALT_B }, `return v.decrypt(${JSON.stringify(v2)});`);
    assert.equal(out, '[ENCRYPTED PHI - INTEGRITY VERIFICATION FAILED]');
  });

  test('v1 ciphertext is NOT affected by the salt (legacy key is fixed)', () => {
    const v1 = run({}, `return v.encrypt('stable');`);
    const a = run({ ENCRYPTION_SALT: SALT_A }, `return v.decrypt(${JSON.stringify(v1)});`);
    const b = run({ ENCRYPTION_SALT: SALT_B }, `return v.decrypt(${JSON.stringify(v1)});`);
    assert.equal(a, 'stable');
    assert.equal(b, 'stable');
  });

  test('tampered v2 ciphertext fails authentication', () => {
    const out = run({ ENCRYPTION_SALT: SALT_A }, `
      const parts = v.encrypt('Diabetes').split(':');
      parts[4] = (parts[4][0] === 'a' ? 'b' : 'a') + parts[4].slice(1);
      return v.decrypt(parts.join(':'));`);
    assert.equal(out, '[ENCRYPTED PHI - INTEGRITY VERIFICATION FAILED]');
  });

  test('plaintext, null and blank values behave as before', () => {
    const out = run({ ENCRYPTION_SALT: SALT_A }, `
      return [v.decrypt('plain text'), v.decrypt(null) === null, v.encrypt(null) === null, v.encrypt('   ')];`);
    assert.deepEqual(out, ['plain text', true, true, '']);
  });
});

describe('helpers', () => {
  test('ciphertextVersion / isEncryptedValue', () => {
    const out = run({ ENCRYPTION_SALT: SALT_A }, `
      return [v.ciphertextVersion('enc:v1:x'), v.ciphertextVersion('enc:v2:x'),
              v.ciphertextVersion('hello'), v.ciphertextVersion(null), v.isEncryptedValue('enc:v2:x')];`);
    assert.deepEqual(out, ['v1', 'v2', null, null, true]);
  });

  test('needsReencrypt: v1 needs it only once a salt is active', () => {
    const noSalt = run({}, `return [v.needsReencrypt('enc:v1:x'), v.needsReencrypt('enc:v2:x')];`);
    const withSalt = run({ ENCRYPTION_SALT: SALT_A }, `return [v.needsReencrypt('enc:v1:x'), v.needsReencrypt('enc:v2:x'), v.needsReencrypt('plain')];`);
    assert.deepEqual(noSalt, [false, true]);       // v2 data with no salt is "wrong version" but unreadable
    assert.deepEqual(withSalt, [true, false, false]);
  });
});

describe('startup validation', () => {
  test('rejects a salt shorter than 16 characters', () => {
    assert.equal(run({ ENCRYPTION_SALT: 'short' }, `return 1;`).crashed, true);
  });

  test('rejects reusing the legacy hardcoded salt', () => {
    assert.equal(run({ ENCRYPTION_SALT: 'valetudo-healthlink-v1' }, `return 1;`).crashed, true);
  });

  test('still refuses a missing or short ENCRYPTION_KEY', () => {
    assert.equal(run({ ENCRYPTION_KEY: 'too-short' }, `return 1;`).crashed, true);
  });

  test('an empty ENCRYPTION_SALT is treated as unset (legacy mode)', () => {
    assert.equal(run({ ENCRYPTION_SALT: '' }, `return v.ACTIVE_VERSION;`), 'v1');
  });
});