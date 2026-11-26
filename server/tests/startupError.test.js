import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StartupError, describeStartupError } from '../src/bootstrap/startupError.js';

test('startup diagnostics show trusted migration context and safe driver codes', () => {
  const driver = Object.assign(new Error('SQL contains private patient values and a password'), {
    code: 'ER_ACCESS_DENIED_ERROR', sql: 'private SQL',
  });
  const error = new StartupError('Migration 16 (Single-row audit chain state) failed.', { cause: driver });
  assert.equal(describeStartupError(error),
    'Migration 16 (Single-row audit chain state) failed. Caused by: ER_ACCESS_DENIED_ERROR');
  assert.equal(describeStartupError(new Error('private values')), 'Error');
  assert.equal(describeStartupError({ code: 'private text\nwith values' }), 'Error');
});

test('startup diagnostics bound recursive causes', () => {
  const error = new StartupError('Stored server policy is invalid.');
  error.cause = error;
  assert.equal(describeStartupError(error), error.message);
  assert.equal(describeStartupError(null), 'Unknown startup failure.');
});
