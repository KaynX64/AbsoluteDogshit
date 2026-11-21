import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const page = await readFile(new URL('../public/verify.html', import.meta.url), 'utf8');
const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
const prescription = values => ({ type: 'PRESCRIPTION', valid: true, verified: true, status: 'active',
  patient: 'Fixture S.', issuedBy: 'Fixture Clinician', issuedAt: '2026-11-16T16:01:00Z', expiresAt: '2026-11-23', ...values });

async function render(payload, { token = 'fixture-token', ok = true } = {}) {
  const elements = new Map();
  const calls = [];
  const context = vm.createContext({
    URLSearchParams,
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { style: {}, innerHTML: '' });
      return elements.get(id);
    } },
    window: { location: { pathname: '/api/documents/verify/fixture-token', search: '?token=' + encodeURIComponent(token) } },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok, json: async () => payload }; },
  });
  vm.runInContext(script, context, { timeout: 1000 });
  await setImmediate();
  return { html: elements.get('document-view')?.innerHTML, calls, context };
}

test('public prescription rendering excludes clinical fields, fallback medication and remote QR images', async () => {
  const payload = prescription({ studentNo: 'SECRET-ID', course: 'SECRET-COURSE', age: 'SECRET-AGE', sex: 'SECRET-SEX',
    dateOfBirth: 'SECRET-DOB', notes: 'SECRET-NOTE', items: [{ medicine_name: 'SECRET-MEDICINE', dosage: 'SECRET-DOSE' }] });
  const { html, calls } = await render(payload);
  assert.match(html, /ISSUANCE VERIFIED/);
  assert.match(html, /Patient \(masked\)/);
  assert.match(html, /Fixture S\./);
  assert.match(html, /Print verification/);
  assert.match(html, /Medication details require authorized access/);
  assert.doesNotMatch(html, /SECRET-|500mg|Take as directed|Daily|10 pcs|<img|qrserver\.com|Print Prescription/);
  assert.doesNotMatch(html, /Cryptographically signed|partner dispensaries|R\.A\. 10173.*(?:Seal|Official)/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/documents/verify/fixture-token');
  assert.equal(calls[0].options.headers.Accept, 'application/json');
});

test('prescription status comes from the server, including cancelled and expired records', async () => {
  for (const [status, valid, label] of [['active', true, 'ISSUANCE VERIFIED'], ['dispensed', true, 'ISSUANCE VERIFIED'],
    ['cancelled', false, 'CANCELLED PRESCRIPTION'], ['expired', false, 'EXPIRED PRESCRIPTION'],
    ['active', false, 'VERIFICATION UNAVAILABLE'], ['unknown', false, 'VERIFICATION UNAVAILABLE']]) {
    const { html } = await render(prescription({ status, valid, verified: valid, expiresAt: '2000-01-01' }));
    assert.ok(html.includes(label), status);
    assert.equal(html.includes('status-badge verified'), valid);
  }
});

test('prescription text and invalid-token errors are escaped before insertion', async () => {
  const attack = '<img src="x" onerror="globalThis.pwned=1">&\'"';
  const { html, context, calls } = await render(prescription({ patient: attack, issuedBy: attack, issuedAt: attack }), { token: attack });
  assert.doesNotMatch(html, /<img|src="x"/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&amp;&#39;&quot;/);
  assert.match(html, /Not recorded/);
  assert.equal(context.pwned, undefined);
  assert.equal(calls[0].url, '/api/documents/verify/' + encodeURIComponent(attack));
  const invalid = await render({ error: attack }, { token: attack, ok: false });
  assert.doesNotMatch(invalid.html, /<img/);
  assert.match(invalid.html, /&lt;img/);
  assert.doesNotMatch(invalid.html, /retention rules/);
});

test('dates display in the clinic timezone without shifting a validity calendar date', async () => {
  const { context } = await render(prescription());
  assert.match(vm.runInContext("formatDate('2026-11-16')", context), /16/);
  assert.match(vm.runInContext("formatDate('2026-11-16T16:01:00Z')", context), /17/);
  assert.equal(vm.runInContext("formatDate('bad date')", context), 'Not recorded');
  assert.equal(vm.runInContext("formatDate('2026-02-30')", context), 'Not recorded');
});
