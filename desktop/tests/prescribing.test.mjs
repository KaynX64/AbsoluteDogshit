import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftError, newMedication } from '../src/features/documents/prescribingTypes.ts';

test('manual, fractional, container and PRN drafts require explicit clinical fields', () => {
  const medicine = { ...newMedication(), fulfillment: 'external', generic_name: 'Fixture generic', generic_confirmed: true,
    strength: '10 mg/5 mL', form: 'Suspension', dose_amount: '1/2', dose_unit: 'mL', route: 'Oral',
    schedule: { kind: 'prn', prn_reason: 'Fixture reason', prn_limits: 'Fixture limits', frequency: '' },
    quantity: '1.5', quantity_unit: 'bottle', pack_size: '60 mL', review_on: '2099-11-19', directions: 'Fixture patient directions' };
  const draft = { contract_version: 2, patient_user_id: 5, appointment_id: 10, expires_at: '2099-11-23', notes: '', items: [medicine] };
  assert.equal(draftError(draft), null);
  for (const patch of [{ generic_confirmed: false }, { dose_unit: 'unknown' }, { dose_amount: '1/0' }, { pack_size: '' },
    { review_on: '' }, { directions: '' }, { fulfillment: 'clinic', catalog_medicine_id: 1 }, { schedule: { ...medicine.schedule, prn_limits: '' } }]) {
    assert.equal(draftError({ ...draft, items: [{ ...medicine, ...patch }] }).item, 0);
  }
});
