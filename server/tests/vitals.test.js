// Checks vital input ranges, formats, precision, and intake note output.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTriageNote, triageDraftError, validateTriageVitals, validateVitals, VITAL_RULES } from '../src/appointments/vitals.js';

test('intake rejects every reported malformed or above-limit edit in full', () => {
  const examples = { blood_pressure: '121ggreterlertlriert', temperature: '4234244', pulse: '131131',
    spo2: '2343242', resp_rate: '333', height: '112362.50', weight: '531234.00' };
  for (const [field, draft] of Object.entries(examples)) assert.ok(triageDraftError(field, draft), field);
  assert.deepEqual(validateTriageVitals(examples).values, {});
});

test('partial intake edits are permitted for correction while complete validation still blocks them', () => {
  assert.equal(triageDraftError('blood_pressure', '120/'), undefined);
  assert.ok(validateTriageVitals({ blood_pressure: '120/' }).errors.blood_pressure);
  assert.equal(triageDraftError('temperature', '3'), undefined);
  assert.ok(validateTriageVitals({ temperature: '3' }).errors.temperature);
  assert.equal(triageDraftError('height', '162.'), undefined);
  assert.ok(validateTriageVitals({ height: '162.' }).errors.height);
  assert.equal(triageDraftError('weight', ''), undefined);
  assert.equal(triageDraftError('pulse', '0'), undefined);
  assert.equal(triageDraftError('blood_pressure', '120/0'), undefined);
  assert.deepEqual(validateTriageVitals({ blood_pressure: '120/0' }).errors, {});
});

test('triage normalizes units-free values and preserves explicitly recorded zeros', () => {
  const result = validateTriageVitals({
    blood_pressure: ' 120 / 80 ', temperature: '36.65', pulse: '0', spo2: 0, resp_rate: 0,
    height: '162.50', weight: '54.00',
  });
  assert.deepEqual(result, {
    values: { systolic_bp: 120, diastolic_bp: 80, temperature: 36.65, pulse: 0, spo2: 0, resp_rate: 0, height: 162.5, weight: 54 },
    errors: {},
  });
  assert.match(formatTriageNote(result.values), /Pulse: 0 bpm, SpO2: 0%, Resp: 0 cpm/);
});

test('missing measurements remain blank in triage notes and do not invent readings', () => {
  const result = validateTriageVitals({ blood_pressure: '  ', temperature: null, pulse: '' });
  assert.deepEqual(result, { values: {}, errors: {} });
  assert.equal(formatTriageNote(result.values), '');
  assert.equal(formatTriageNote({ height: 162.5 }), '[TRIAGE VITALS] Height: 162.5 cm\n');
});

test('blood pressure requires a valid pair in intake and correct ordering wherever both are present', () => {
  for (const pressure of ['120', '120/', '120/80/60', '120/80 mmHg', '80/120', '90/90', '351/80', '120/-1', [120, 80]]) {
    assert.ok(validateTriageVitals({ blood_pressure: pressure }).errors.blood_pressure, String(pressure));
  }
  assert.ok(validateVitals({ systolic_bp: 80, diastolic_bp: 120 }).errors.systolic_bp);
  assert.deepEqual(validateVitals({ systolic_bp: 120 }).errors, {});
});

test('every metric enforces its configured bounds and stored precision', () => {
  for (const [metric, { min, max, integer }] of Object.entries(VITAL_RULES)) {
    for (const value of [min, max]) {
      assert.deepEqual(validateVitals({ [metric]: value }).values, { [metric]: value });
    }
    for (const value of [min - 1, max + 1, `${min}.123`, '1e2', '0x50', '80 mmHg', true, [80], Infinity]) {
      assert.ok(validateVitals({ [metric]: value }).errors[metric], `${metric}: ${value}`);
    }
    if (integer) assert.ok(validateVitals({ [metric]: min + 0.5 }).errors[metric]);
  }
});

test('structured vitals reject malformed payloads and unrecognized metrics', () => {
  for (const input of [[], 'pulse=72', { unknown: 72 }, JSON.parse('{"__proto__":72}')]) {
    assert.ok(validateVitals(input).errors.vitals);
  }
});
