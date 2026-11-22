// Defines default staff analytics scopes and validates account-level overrides.

import { fail } from '../utils/httpError.js';

export const staffAnalyticsPermissions = [
  { code: 'ANALYTICS_OPERATIONS', label: 'Clinic operations', description: 'Appointments, department visits and SOS activity.' },
  { code: 'ANALYTICS_CLINICAL', label: 'Diagnosis analytics', description: 'Diagnosis rankings and the Diagnosis Explorer.' },
  { code: 'ANALYTICS_SURVEILLANCE', label: 'Campus health surveillance', description: 'Aggregate respiratory and health-risk counts.' },
  { code: 'ANALYTICS_DISPENSING', label: 'Formulary dispensing', description: 'Prescribed, dispensed, returned and net units, with availability.' },
  { code: 'ANALYTICS_PHARMACY', label: 'Pharmacy inventory analytics', description: 'Reorder priorities, stock quantities and batch expiry.' },
  { code: 'ANALYTICS_HEADCOUNT', label: 'Campus headcount', description: 'Active accounts by role.' },
  { code: 'ANALYTICS_EXPORT', label: 'Export and print', description: 'Export or print the sections this account can view.' },
];
// Extract the supported analytics scope codes.
const staffScopeCodes = staffAnalyticsPermissions.map(({ code }) => code);

// Select the default analytics scopes for a clinical staff member's roles.
export function defaultStaffAnalyticsScopes(roles) {
  const clinician = roles.includes('DOCTOR') || roles.includes('DENTIST');
  const nurse = roles.includes('NURSE');
  if (roles.includes('ADMIN') || (!clinician && !nurse)) return null;
  // Select the scopes granted by the user's current clinical role.
  return staffScopeCodes.filter(code =>
    code !== 'ANALYTICS_HEADCOUNT' &&
    (code !== 'ANALYTICS_CLINICAL' || clinician) &&
    (code !== 'ANALYTICS_PHARMACY' || nurse));
}

// Validate a staff scope override and preserve null as the signal to inherit defaults.
export function validateStaffAnalyticsScopes(scopes) {
  if (scopes === null) return null;
  if (!Array.isArray(scopes) || scopes.length > staffScopeCodes.length || scopes.some(/* Detect a scope code that staff overrides cannot use. */ code => !staffScopeCodes.includes(code))) {
    throw fail('Provide null to use role defaults or an array of valid analytics permissions.');
  }
  // Return selected scopes in catalog order and eliminate duplicate selections.
  return staffScopeCodes.filter(code => scopes.includes(code));
}
