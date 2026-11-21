// Synthetic renderer fixtures. These are not treatment recommendations.
export const fixtureItem = (index = 1) => ({ contract_version: 2, item_key: `fixture-${index}`, is_outside: index % 2 === 1,
  medicine_name: `Fixture generic ${index}`, generic_name: `Fixture generic ${index}`, strength: '10 mg/5 mL', form: 'Suspension',
  dosage: '2.5 mL', route: 'Oral', frequency: 'As needed for fixture reason; clinician-entered fixture limits',
  duration_days: null, review_on: '2026-11-19', quantity: index % 2 === 1 ? 1.5 : 2, quantity_unit: 'bottle', pack_size: '60 mL',
  directions: `Fixture directions ${index}. Entered by the clinician; no dosing advice is generated.` });
export const fixturePrescription = (count = 1) => ({ contract_version: 2, prescription_id: 101,
  patient: { first_name: 'Synthetic', last_name: 'Patient', student_no: 'FIXTURE-1', age: 22, sex: 'FEMALE', allergies: 'Fixture recorded allergies' },
  doctor: { first_name: 'Synthetic', last_name: 'Clinician', role: 'DOCTOR', license_no: 'FIXTURE-ONLY' },
  issued_at: '2026-11-16T08:00:00Z', expires_at: '2026-11-23', notes: 'Fixture patient advice. For software verification only.',
  qr_token: 'fixture-token', verification_url: 'https://example.invalid/verify/fixture-token',
  items: Array.from({ length: count }, (_, index) => fixtureItem(index + 1)) });
