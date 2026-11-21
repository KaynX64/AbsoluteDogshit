// Versioned prescribing data, review fingerprints and the shared local-rule policy.
import crypto from 'node:crypto';
import { JWT_SECRET } from '../../utils/secrets.js';
import { isCalendarDate } from '../../config/appointmentRules.js';
import { checkInteractions } from '../../utils/interactionChecker.js';

export const units = ['tablet', 'capsule', 'pcs', 'mL', 'g', 'mg', 'drop', 'puff', 'application',
  'bottle', 'tube', 'inhaler', 'pack', 'vial', 'ampoule', 'sachet', 'patch', 'suppository', 'unit'];
const containers = new Set(['bottle', 'tube', 'inhaler', 'pack', 'vial', 'ampoule']);
const doseUnits = new Set([...units, 'mcg', 'L', 'IU', 'mg/kg', 'mg/kg/dose', 'mEq', 'mmol']);
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
export const hash = value => crypto.createHash('sha256').update(JSON.stringify(ordered(JSON.parse(JSON.stringify(value))))).digest('hex');
export const today = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const fail = (message, code = 'INVALID_PRESCRIPTION', status = 400, extra = {}) =>
  Object.assign(new Error(message), { code, status, ...extra });
export const enabled = () => process.env.STRUCTURED_PRESCRIBING_ENABLED === 'true';

export function normalizeDraft(body, { allowPast = false } = {}) {
  const errors = [];
  if (body.contract_version !== 2) errors.push({ field: 'contract_version', message: 'Structured prescribing requires contract version 2.' });
  const field = (value, path, maximum, required = true) => {
    const result = typeof value === 'string' ? value.trim() : '';
    if ((required && !result) || result.length > maximum || (value != null && typeof value !== 'string')) {
      errors.push({ field: path, message: `Enter ${required ? 'non-empty ' : ''}text of at most ${maximum} characters.` });
    }
    return result;
  };
  const positiveId = (value, name) => {
    const number = Number(value);
    if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(number) || number <= 0) errors.push({ field: name, message: 'A positive identifier is required.' });
    return number;
  };
  const patient_user_id = positiveId(body.patient_user_id, 'patient_user_id');
  const appointment_id = positiveId(body.appointment_id, 'appointment_id');
  if (!isCalendarDate(body.expires_at) || (!allowPast && body.expires_at < today())) errors.push({ field: 'expires_at', message: 'Enter a current or future prescription validity date.' });
  const notes = field(body.notes ?? '', 'notes', 2000, false);
  const source = Array.isArray(body.items) ? body.items : [];
  if (!source.length || source.length > 20) errors.push({ field: 'items', message: 'Include 1 to 20 medicines.' });
  const keys = new Set();
  const items = source.slice(0, 20).map((raw, index) => {
    const it = raw && typeof raw === 'object' ? raw : {};
    const path = key => `items.${index}.${key}`;
    const item_key = field(it.item_key, path('item_key'), 36);
    if (!/^[a-zA-Z0-9-]{1,36}$/.test(item_key) || keys.has(item_key)) errors.push({ field: path('item_key'), message: 'Use a distinct item identifier.' });
    keys.add(item_key);
    const fulfillment = it.fulfillment;
    if (!['clinic', 'external'].includes(fulfillment)) errors.push({ field: path('fulfillment'), message: 'Choose clinic or external fulfillment.' });
    const catalog_medicine_id = it.catalog_medicine_id == null || it.catalog_medicine_id === '' ? null : positiveId(it.catalog_medicine_id, path('catalog_medicine_id'));
    if (fulfillment === 'clinic' && !catalog_medicine_id) errors.push({ field: path('catalog_medicine_id'), message: 'Clinic dispensing requires a catalog medicine.' });
    const generic_name = field(it.generic_name, path('generic_name'), 200, !catalog_medicine_id);
    const brand_name = field(it.brand_name ?? '', path('brand_name'), 200, false);
    const strength = field(it.strength, path('strength'), 100, !catalog_medicine_id);
    const form = field(it.form, path('form'), 50, !catalog_medicine_id);
    if (!catalog_medicine_id && it.generic_confirmed !== true) errors.push({ field: path('generic_confirmed'), message: 'Confirm the manually entered generic name.' });
    const dose_amount = field(it.dose_amount, path('dose_amount'), 32);
    const dose_unit = field(it.dose_unit, path('dose_unit'), 50);
    const doseParts = dose_amount.split('/');
    if (!/^\d*\.?\d+(?:\s*\/\s*\d*\.?\d+)?$/.test(dose_amount) || doseParts.some(part => !(Number(part) > 0))) {
      errors.push({ field: path('dose_amount'), message: 'Enter a positive dose, using a decimal or fraction when needed.' });
    }
    if (!doseUnits.has(dose_unit)) errors.push({ field: path('dose_unit'), message: 'Enter a supported dose unit.' });
    const route = field(it.route, path('route'), 50);
    const kind = it.schedule?.kind;
    if (!['fixed', 'prn', 'custom'].includes(kind)) errors.push({ field: path('schedule.kind'), message: 'Choose a schedule type.' });
    const frequency = field(it.schedule?.frequency ?? '', path('schedule.frequency'), 100, kind === 'fixed');
    const prn_reason = field(it.schedule?.prn_reason ?? '', path('schedule.prn_reason'), 200, kind === 'prn');
    const prn_limits = field(it.schedule?.prn_limits ?? '', path('schedule.prn_limits'), 300, kind === 'prn');
    const duration_days = it.duration_days == null || it.duration_days === '' ? null : Number(it.duration_days);
    if ((duration_days !== null && (!['number', 'string'].includes(typeof it.duration_days) || !Number.isInteger(duration_days) || duration_days < 1 || duration_days > 2147483647)) || (kind === 'fixed' && duration_days === null)) {
      errors.push({ field: path('duration_days'), message: 'Enter a positive whole-number duration.' });
    }
    const review_on = kind === 'fixed' ? '' : field(it.review_on ?? '', path('review_on'), 10, false);
    if ((review_on && (!isCalendarDate(review_on) || (!allowPast && review_on < today()))) || (kind !== 'fixed' && !duration_days && !review_on)) {
      errors.push({ field: path('review_on'), message: 'Enter a course duration or a current/future review date.' });
    }
    const quantity = Number(it.quantity);
    if (!['number', 'string'].includes(typeof it.quantity) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999.999 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.0001 || (fulfillment === 'clinic' && !Number.isInteger(quantity))) {
      errors.push({ field: path('quantity'), message: 'Use a positive quantity, at most three decimals externally or whole inventory units in clinic.' });
    }
    const quantity_unit = field(it.quantity_unit, path('quantity_unit'), 50);
    if (fulfillment === 'external' && !units.includes(quantity_unit)) errors.push({ field: path('quantity_unit'), message: 'Select a supported supply unit.' });
    const pack_size = field(it.pack_size ?? '', path('pack_size'), 100, fulfillment === 'external' && containers.has(quantity_unit));
    const directions = field(it.directions, path('directions'), 2000);
    return { item_key, fulfillment, catalog_medicine_id, generic_name, brand_name, strength, form,
      generic_confirmed: !catalog_medicine_id && it.generic_confirmed === true,
      dose_amount, dose_unit, route, schedule: { kind, frequency: kind === 'fixed' ? frequency : '',
        prn_reason: kind === 'prn' ? prn_reason : '', prn_limits: kind === 'prn' ? prn_limits : '' },
      duration_days, review_on, quantity, quantity_unit, pack_size, directions };
  });
  return { draft: { contract_version: 2, patient_user_id, appointment_id, expires_at: body.expires_at, notes, items }, errors };
}

export async function assessDraft(connection, input, { lock = false } = {}) {
  const { draft, errors } = normalizeDraft(input);
  if (errors.length) throw fail('Review the marked prescription fields.', 'INVALID_PRESCRIPTION', 400, { errors });
  const ids = [...new Set(draft.items.map(it => it.catalog_medicine_id).filter(Boolean))].sort((a, b) => a - b);
  const catalog = ids.length ? (await connection.query(
    'SELECT medicine_id, name, generic_name, strength, form, unit FROM MEDICINES WHERE medicine_id IN (?) AND is_active = TRUE AND deleted_at IS NULL ORDER BY medicine_id' + (lock ? ' FOR UPDATE' : ''), [ids]))[0] : [];
  const records = new Map(catalog.map(row => [Number(row.medicine_id), row]));
  for (const [index, item] of draft.items.entries()) {
    if (!item.catalog_medicine_id) continue;
    const medicine = records.get(item.catalog_medicine_id);
    if (!medicine) throw fail('A selected catalog medicine is unavailable. Review its identity.', 'CATALOG_CHANGED', 409);
    if (![medicine.generic_name, medicine.strength, medicine.form].every(value => typeof value === 'string' && value.trim())) {
      throw fail('The catalog identity is incomplete. Correct the catalog or use confirmed manual external entry.', 'CATALOG_INCOMPLETE', 400, { errors: [{ field: `items.${index}.catalog_medicine_id`, message: 'Generic name, strength and form must be recorded.' }] });
    }
    item.generic_name = medicine.generic_name.trim(); item.strength = medicine.strength.trim(); item.form = medicine.form.trim();
    if (item.fulfillment === 'clinic') {
      const stockUnit = medicine.unit?.trim() || 'pcs';
      if (item.quantity_unit !== stockUnit) throw fail('Clinic quantity must use the recorded inventory unit.', 'INVALID_INVENTORY_UNIT');
    }
  }
  const findings = ids.length >= 2 ? await checkInteractions(connection, ids, { lock }) : [];
  const mapped = draft.items.filter(it => it.catalog_medicine_id).length;
  const pairCount = ids.length * (ids.length - 1) / 2;
  const names = new Map();
  for (const item of draft.items) {
    const key = item.generic_name.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ');
    names.set(key, [...(names.get(key) ?? []), item.item_key]);
  }
  const safety = {
    coverage: ids.length < 2 ? 'not_checked' : mapped < draft.items.length || findings.length < pairCount ? 'partial' : 'local_rules_checked',
    catalog_pair_count: pairCount, pairs_with_local_rules: findings.length,
    known_item_count: mapped,
    unverified_item_keys: draft.items.filter(it => !it.catalog_medicine_id).map(it => it.item_key),
    duplicate_groups: [...names.values()].filter(group => group.length > 1),
    findings: findings.map(it => ({ id: String(it.interaction_id), severity: it.severity,
      medicine_a: it.medicine_a_name, medicine_b: it.medicine_b_name,
      description: it.description, recommendation: it.recommendation, source: it.source ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    scope: 'Only pairs identified in the local rules for this draft. Current medicines and allergies require clinician review.',
  };
  return { draft, safety, fingerprint: hash({ draft, safety }) };
}

const mac = data => crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
export function makeReviewToken(assessment, clinician, now = Date.now()) {
  const data = Buffer.from(JSON.stringify({ clinician, fingerprint: assessment.fingerprint, expires: now + 5 * 60000 })).toString('base64url');
  return `${data}.${mac(data)}`;
}
export function verifyReviewToken(token, assessment, clinician, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 2048) throw Error();
    const [data, signature, extra] = token.split('.');
    const expected = Buffer.from(mac(data)); const actual = Buffer.from(signature ?? '');
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (extra || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual) ||
      payload.clinician !== clinician || payload.fingerprint !== assessment.fingerprint || payload.expires <= now) throw Error();
  } catch { throw fail('Prescription content or safety review changed. Review again.', 'REVIEW_CHANGED', 409); }
}

export function validateAcknowledgements(assessment, acknowledgements) {
  if (assessment.safety.findings.some(it => it.severity === 'contraindicated')) throw fail('A contraindicated combination cannot be issued.', 'CONTRAINDICATED_DRUG_INTERACTION', 409);
  if (acknowledgements?.patient_reviewed !== true) throw fail('Confirm review of allergies and current medicines.', 'PATIENT_REVIEW_REQUIRED');
  if ((assessment.safety.coverage !== 'local_rules_checked' || assessment.safety.unverified_item_keys.length) && acknowledgements?.coverage_reviewed !== true) throw fail('Acknowledge the limits of automated checking.', 'COVERAGE_REVIEW_REQUIRED');
  if (assessment.safety.duplicate_groups.length && acknowledgements?.duplicates_reviewed !== true) throw fail('Review duplicate medicines before issuing.', 'DUPLICATE_REVIEW_REQUIRED');
  const overrides = {};
  for (const warning of assessment.safety.findings.filter(it => it.severity === 'severe')) {
    const reason = acknowledgements?.severe_reasons?.[warning.id];
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000) throw fail('Record a reason for every severe-interaction override.', 'SEVERE_OVERRIDE_REQUIRED');
    overrides[warning.id] = reason.trim();
  }
  return { patient_reviewed: true, coverage_reviewed: acknowledgements?.coverage_reviewed === true,
    duplicates_reviewed: acknowledgements?.duplicates_reviewed === true, severe_reasons: overrides };
}

export function presentStructuredItem(item, index = 0) {
  return { ...item, item_id: item.item_key, item_sequence: index, is_outside: item.fulfillment === 'external',
    medicine_id: item.fulfillment === 'clinic' ? item.catalog_medicine_id : null,
    medicine_name: item.generic_name + (item.brand_name ? ` (${item.brand_name})` : ''),
    dosage: `${item.dose_amount} ${item.dose_unit}`, frequency: item.schedule.kind === 'fixed' ? item.schedule.frequency : item.schedule.kind === 'prn' ? `As needed for ${item.schedule.prn_reason}; ${item.schedule.prn_limits}` : 'Custom schedule - see directions',
    quantity_prescribed: item.quantity, quantity_dispensed: item.fulfillment === 'clinic' ? item.quantity : 0,
    instructions: item.directions, contract_version: 2 };
}
