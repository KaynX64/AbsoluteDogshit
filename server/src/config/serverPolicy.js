// Defines editable server settings, validates overrides, and tracks the active policy revision.

import { LOGIN_LIMIT, SOS_LIMIT, BOOKING_LIMIT, VERIFY_LIMIT, NOSHOW_LIMIT } from './limits.js';
import { APPOINTMENT_RULES, CLINIC_HOURS, minutesOf } from './appointmentRules.js';

const rateLimits = [
  ['login', 'Login', LOGIN_LIMIT, 20],
  ['sos', 'Emergency SOS', SOS_LIMIT, 60],
  ['booking', 'Appointment booking', BOOKING_LIMIT, 120],
  ['verify', 'Document verification', VERIFY_LIMIT, 300],
];
const integer = (key, label, section, initial, min, max) => ({
  key, label, section, initial, type: 'integer', min, max,
});
const doctorCapacityKey = (name) => `doctorCapacity:${name}`;

const fields = [
  ...rateLimits.flatMap(([key, label, limit, cap]) => [
    integer(`${key}MaxAttempts`, `${label} attempts`, 'Limits', limit.maxAttempts, 1, cap),
    integer(`${key}WindowSeconds`, `${label} window (seconds)`, 'Limits', limit.windowSeconds, 10, 3600),
  ]),
  integer('noShowGraceMinutes', 'No-show grace (minutes)', 'Limits', NOSHOW_LIMIT.graceMinutes, 1, 720),
  ...[
    ['openTime', 'Clinic opens'], ['closeTime', 'Clinic closes'],
    ['lunchStart', 'Lunch starts'], ['lunchEnd', 'Lunch ends'],
  ].map(([key, label]) => ({ key, label, section: 'Appointment rules', initial: CLINIC_HOURS[key], type: 'time' })),
  integer('slotMinutes', 'Slot interval (minutes)', 'Appointment rules', CLINIC_HOURS.slotMinutes, 5, 60),
  integer('dentistCapacity', 'Dental appointments per hour', 'Appointment rules', APPOINTMENT_RULES.DENTIST.hourlyCapacity, 1, 60),
  ...APPOINTMENT_RULES.DOCTOR.appointmentTypes.map(({ name, hourlyCapacity }) =>
    integer(doctorCapacityKey(name), `${name} per hour`, 'Appointment rules', hourlyCapacity, 1, 60)),
  { key: 'doctorRecoveryBuffer', label: 'Reserve the next hour when a medical type reaches capacity', section: 'Appointment rules', initial: APPOINTMENT_RULES.DOCTOR.cascadeNextHour, type: 'boolean' },
];

export const serverPolicyFields = fields.map(({ initial, ...field }) => field);
export const serverPolicyDefaults = Object.freeze(Object.fromEntries(fields.map(({ key, initial }) => [key, initial])));

export function validatePolicyOverrides(input) {
  const values = {};
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { values, errors: { policy: 'Provide a policy override object.' } };
  }
  if (Object.keys(input).some((key) => !Object.hasOwn(serverPolicyDefaults, key))) {
    errors.policy = 'The policy contains an unsupported setting.';
  }
  for (const field of fields) {
    if (!Object.hasOwn(input, field.key)) continue;
    const value = input[field.key];
    const valid = field.type === 'integer' ? Number.isSafeInteger(value) && value >= field.min && value <= field.max
      : field.type === 'time' ? typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
      : typeof value === 'boolean';
    if (!valid) {
      errors[field.key] = field.type === 'integer' ? `Enter a whole number from ${field.min} to ${field.max}.`
        : field.type === 'time' ? 'Enter a time in HH:MM format.' : 'Choose enabled or disabled.';
    } else {
      values[field.key] = value;
    }
  }
  if (Object.keys(errors).length) return { values, errors };
  const effective = { ...serverPolicyDefaults, ...values };
  const { openTime, closeTime, lunchStart, lunchEnd, slotMinutes } = effective;
  const [open, close, lunch, resume] = [openTime, closeTime, lunchStart, lunchEnd].map(minutesOf);
  if (!(open < lunch && lunch < resume && resume < close)) {
    errors.openTime = 'Use same-day times in this order: clinic opens, lunch starts, lunch ends, clinic closes.';
  } else if (60 % slotMinutes !== 0 || [open, close, lunch, resume].some((time) => time % slotMinutes !== 0)) {
    errors.slotMinutes = 'The interval must divide one hour and align with clinic and lunch boundaries.';
  }
  return { values, errors };
}

export function makeServerPolicy(version, overrides) {
  const values = { ...serverPolicyDefaults, ...overrides };
  const limits = Object.fromEntries(rateLimits.map(([key]) => [key, {
    maxAttempts: values[`${key}MaxAttempts`], windowSeconds: values[`${key}WindowSeconds`],
  }]));
  limits.noShow = { graceMinutes: values.noShowGraceMinutes };
  return {
    version, overrides, values, limits,
    clinic: {
      ...CLINIC_HOURS, openTime: values.openTime, closeTime: values.closeTime, lunchStart: values.lunchStart,
      lunchEnd: values.lunchEnd, slotMinutes: values.slotMinutes,
    },
    appointments: {
      DENTIST: { ...APPOINTMENT_RULES.DENTIST, hourlyCapacity: values.dentistCapacity },
      DOCTOR: {
        ...APPOINTMENT_RULES.DOCTOR, cascadeNextHour: values.doctorRecoveryBuffer,
        appointmentTypes: APPOINTMENT_RULES.DOCTOR.appointmentTypes.map(({ name }) => ({
          name, hourlyCapacity: values[doctorCapacityKey(name)],
        })),
      },
    },
  };
}

let active = makeServerPolicy(0, {});
export const getServerPolicy = () => active;

export function activateServerPolicy(policy) {
  if (policy.version >= active.version) active = policy;
}
