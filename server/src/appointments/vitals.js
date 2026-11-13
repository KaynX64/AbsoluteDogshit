// Pure input rules shared by the API and the desktop intake form.
export const VITAL_RULES = {
  systolic_bp: { label: 'Systolic pressure', unit: 'mmHg', min: 1, max: 350, integer: true },
  diastolic_bp: { label: 'Diastolic pressure', unit: 'mmHg', min: 0, max: 300, integer: true },
  temperature: { label: 'Temperature', unit: '°C', min: 10, max: 50, integer: false },
  pulse: { label: 'Pulse', unit: 'bpm', min: 0, max: 300, integer: true },
  spo2: { label: 'SpO₂', unit: '%', min: 0, max: 100, integer: false },
  resp_rate: { label: 'Respiratory rate', unit: 'breaths/min', min: 0, max: 170, integer: true },
  height: { label: 'Height', unit: 'cm', min: 30, max: 300, integer: false },
  weight: { label: 'Weight', unit: 'kg', min: 1, max: 500, integer: false },
};

export function validateVitals(input) {
  const values = {};
  const errors = {};
  if (input == null) return { values, errors };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { values, errors: { vitals: 'Vitals must be an object.' } };
  }

  for (const [metric, raw] of Object.entries(input)) {
    if (!Object.hasOwn(VITAL_RULES, metric)) {
      errors.vitals = 'Vitals contain an unsupported measurement.';
      continue;
    }
    const { label, unit, min, max, integer } = VITAL_RULES[metric];
    const text = typeof raw === 'string' ? raw.trim() : raw;
    if (text == null || text === '') continue;

    const isDecimal = (typeof text === 'string' || typeof text === 'number') &&
      /^\d+(?:\.\d{1,2})?$/.test(String(text));
    const value = isDecimal ? Number(text) : NaN;
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      const format = integer ? 'a whole number' : 'a number with up to two decimal places';
      errors[metric] = `Enter ${label.toLowerCase()} as ${format} from ${min} to ${max} ${unit}.`;
      continue;
    }
    values[metric] = value;
  }

  if (values.systolic_bp !== undefined && values.diastolic_bp !== undefined &&
      values.systolic_bp <= values.diastolic_bp) {
    errors.systolic_bp = 'Systolic pressure must be higher than diastolic pressure.';
  }
  return { values, errors };
}

export function validateTriageVitals({ blood_pressure, temperature, pulse, spo2, resp_rate, height, weight }) {
  const pressure = typeof blood_pressure === 'string' ? blood_pressure.trim() : blood_pressure;
  const parts = typeof pressure === 'string' ? /^(\d{1,3})[ \t]*\/[ \t]*(\d{1,3})$/.exec(pressure) : null;
  const { values, errors } = validateVitals({
    systolic_bp: parts?.[1], diastolic_bp: parts?.[2], temperature, pulse, spo2, resp_rate, height, weight,
  });

  if (pressure != null && pressure !== '' && !parts) {
    errors.blood_pressure = 'Enter blood pressure as systolic/diastolic in mmHg, for example 120/80.';
  } else if (errors.systolic_bp || errors.diastolic_bp) {
    errors.blood_pressure = errors.systolic_bp || errors.diastolic_bp;
    delete errors.systolic_bp;
    delete errors.diastolic_bp;
  }
  return { values, errors };
}

// Reject impossible edits without stripping characters or changing the reading.
// A partial reading can be edited but still fails full triage validation.
export function triageDraftError(field, draft) {
  const text = draft.trim();
  if (text === '') return undefined;
  if (field === 'blood_pressure') {
    const parts = /^(\d{1,3})(?:[ \t]*\/[ \t]*(\d{0,3}))?$/.exec(text);
    if (!parts) return 'Edit rejected. Enter blood pressure as systolic/diastolic, for example 120/80.';
    if (Number(parts[1]) > VITAL_RULES.systolic_bp.max || Number(parts[2]) > VITAL_RULES.diastolic_bp.max) {
      return `Edit rejected. Systolic can be at most ${VITAL_RULES.systolic_bp.max} and diastolic ${VITAL_RULES.diastolic_bp.max} mmHg.`;
    }
    return undefined;
  }

  const { integer, max, unit } = VITAL_RULES[field];
  const pattern = integer ? /^\d+(?:\.0{0,2})?$/ : /^\d+(?:\.\d{0,2})?$/;
  if (!pattern.test(text)) {
    return integer ? 'Edit rejected. Enter a whole number.' : 'Edit rejected. Enter a number with up to two decimal places.';
  }
  return Number(text) > max ? `Edit rejected. The maximum is ${max} ${unit}.` : undefined;
}

export function formatTriageNote(vitals) {
  const { systolic_bp, diastolic_bp, temperature, pulse, spo2, resp_rate, height, weight } = vitals;
  const readings = [
    systolic_bp !== undefined && diastolic_bp !== undefined && `BP: ${systolic_bp}/${diastolic_bp}`,
    temperature !== undefined && `Temp: ${temperature}°C`,
    pulse !== undefined && `Pulse: ${pulse} bpm`,
    spo2 !== undefined && `SpO2: ${spo2}%`,
    resp_rate !== undefined && `Resp: ${resp_rate} cpm`,
    height !== undefined && `Height: ${height} cm`,
    weight !== undefined && `Weight: ${weight} kg`,
  ].filter(Boolean);
  return readings.length ? `[TRIAGE VITALS] ${readings.join(', ')}\n` : '';
}
