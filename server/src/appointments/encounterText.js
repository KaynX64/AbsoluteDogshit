export function readEncounterText(input) {
  const values = {};
  for (const field of ['chief_complaint', 'diagnosis', 'treatment_plan', 'notes']) {
    const value = input[field];
    if (value != null && typeof value !== 'string') throw new Error(`${field} must be text.`);
    values[field] = value?.trim() || '';
  }
  if (!values.chief_complaint || !values.diagnosis) {
    throw new Error('Chief complaint and diagnosis are required.');
  }
  return values;
}
