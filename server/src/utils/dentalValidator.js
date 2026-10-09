// server/src/utils/dentalValidator.js

export const VALID_TOOTH_CONDITIONS = new Set([
  'sound',
  'caries',
  'filled',
  'missing',
  'extraction_needed',
  'prophylaxis',
]);

/**
 * Validates dental odontogram chart payloads.
 * Enforces Adult Universal Numbering System (teeth 1-32) and valid condition keys.
 *
 * @param {Record<string|number, { number?: number, condition: string, notes?: string }>} chart
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateDentalChart(chart) {
  if (!chart || typeof chart !== 'object' || Array.isArray(chart)) {
    return { valid: false, error: 'Dental chart must be a key-value object of tooth records.' };
  }

  const entries = Object.entries(chart);
  if (entries.length === 0) {
    return { valid: true };
  }

  for (const [key, record] of entries) {
    const toothNum = Number(key);

    if (!Number.isInteger(toothNum) || toothNum < 1 || toothNum > 32) {
      return {
        valid: false,
        error: `Invalid tooth number "${key}". The Universal Numbering System strictly requires tooth numbers between 1 and 32.`,
      };
    }

    if (!record || typeof record !== 'object') {
      return { valid: false, error: `Invalid tooth record structure for tooth #${toothNum}.` };
    }

    const condition = String(record.condition || '').trim().toLowerCase();
    if (!VALID_TOOTH_CONDITIONS.has(condition)) {
      return {
        valid: false,
        error: `Invalid condition "${record.condition}" on tooth #${toothNum}. Allowed values: ${Array.from(VALID_TOOTH_CONDITIONS).join(', ')}.`,
      };
    }
  }

  return { valid: true };
}