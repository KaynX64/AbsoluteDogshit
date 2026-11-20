import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

Object.assign(process.env, { DB_PASSWORD: 'fixture', JWT_SECRET: 'fixture-date-secret'.repeat(4),
  ENCRYPTION_KEY: 'fixture-date-key'.repeat(4), ENCRYPTION_SALT: 'fixture-date-salt-2026' });
const { today } = await import('../src/documents/prescriptions/structuredContract.js');
const { isPrescriptionExpired } = await import('../src/documents/prescriptions/structuredRead.js');
const prescription = values => ({ contract_version: 2, status: 'active', expires_at: '2026-11-16', ...values });

test('v2 validity includes the entire stated calendar day in Asia/Manila', () => {
  assert.equal(today(new Date('2026-11-15T16:00:00Z')), '2026-11-16');
  assert.equal(isPrescriptionExpired(prescription(), new Date('2026-11-15T16:00:00Z')), false);
  assert.equal(isPrescriptionExpired(prescription(), new Date('2026-11-16T15:59:59.999Z')), false);
  assert.equal(isPrescriptionExpired(prescription(), new Date('2026-11-16T16:00:00Z')), true);
});

test('date boundaries handle year rollover and leap days without using course or review dates', () => {
  assert.equal(isPrescriptionExpired(prescription({ expires_at: '2026-12-31' }), new Date('2026-12-31T15:59:59Z')), false);
  assert.equal(isPrescriptionExpired(prescription({ expires_at: '2026-12-31' }), new Date('2026-12-31T16:00:00Z')), true);
  assert.equal(isPrescriptionExpired(prescription({ expires_at: '2028-02-29' }), new Date('2028-02-29T15:59:59Z')), false);
  assert.equal(isPrescriptionExpired(prescription({ expires_at: '2028-02-29' }), new Date('2028-02-29T16:00:00Z')), true);
  assert.equal(isPrescriptionExpired(prescription({ expires_at: '2026-11-23', duration_days: 1,
    issued_at: '2026-01-01', review_on: '2026-11-15' }), new Date('2026-11-16T16:00:00Z')), false);
});

test('cancelled status retains precedence; legacy timestamp semantics remain unchanged', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  assert.equal(isPrescriptionExpired(prescription({ status: 'cancelled', expires_at: '2000-01-01' }), now), false);
  assert.equal(isPrescriptionExpired(prescription({ status: 'expired', expires_at: '2099-01-01' }), now), true);
  assert.equal(isPrescriptionExpired(prescription({ expires_at: null }), now), false);
  assert.equal(isPrescriptionExpired(prescription({ contract_version: 1, expires_at: '2026-11-16T11:59:59Z' }), now), true);
  assert.equal(isPrescriptionExpired(prescription({ contract_version: 1, expires_at: '2026-11-16T12:00:01Z' }), now), false);
});

test('SQL DATE objects and date-only strings agree across deployment timezones', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { isPrescriptionExpired } from './src/documents/prescriptions/structuredRead.js';
    const row = {contract_version: 2, status: 'active'};
    for (const value of ['2026-11-16', new Date(2026, 10, 16)]) {
      assert.equal(isPrescriptionExpired({...row, expires_at: value}, new Date('2026-11-16T15:59:59Z')), false);
      assert.equal(isPrescriptionExpired({...row, expires_at: value}, new Date('2026-11-16T16:00:00Z')), true);
    }
  `;
  for (const zone of ['UTC', 'Asia/Manila', 'America/Los_Angeles']) {
    execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: new URL('..', import.meta.url), env: { ...process.env, TZ: zone }, stdio: 'pipe',
    });
  }
});
