import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availabilityForHour, groupBookingsByHour, isRecoveryBlocked, parseBookingTime, scheduleSlotIssue } from '../src/config/appointmentRules.js';
import { activateServerPolicy, getServerPolicy, makeServerPolicy, validatePolicyOverrides } from '../src/config/serverPolicy.js';

test('policy allows sparse typed overrides and rejects unsupported or unsafe inputs', () => {
  assert.deepEqual(validatePolicyOverrides({ loginMaxAttempts: 8, doctorRecoveryBuffer: false }).errors, {});
  for (const input of [[], { JWT_SECRET: 'x' }, { loginMaxAttempts: '8' }, { loginMaxAttempts: 0 },
    { verifyWindowSeconds: 1 }, { sosMaxAttempts: 999 }, { doctorRecoveryBuffer: 'false' }, { openTime: '25:00' }]) {
    assert.ok(Object.keys(validatePolicyOverrides(input).errors).length);
  }
  assert.ok(validatePolicyOverrides({ closeTime: '12:30' }).errors.openTime);
  assert.ok(validatePolicyOverrides({ openTime: '08:10' }).errors.slotMinutes);
  assert.ok(validatePolicyOverrides({ slotMinutes: 7 }).errors.slotMinutes);
});

test('saved policy updates limit and appointment readers, and stale activation cannot supersede it', () => {
  const previous = getServerPolicy();
  const policy = makeServerPolicy(previous.version + 2, {
    loginMaxAttempts: 8, noShowGraceMinutes: 45, slotMinutes: 20, dentistCapacity: 2,
    'doctorCapacity:General consultation': 1, doctorRecoveryBuffer: false,
  });
  activateServerPolicy(policy);
  activateServerPolicy(makeServerPolicy(previous.version + 1, {}));
  assert.equal(getServerPolicy(), policy);
  assert.equal(policy.limits.login.maxAttempts, 8);
  assert.equal(policy.limits.noShow.graceMinutes, 45);
  assert.equal(policy.clinic.slotMinutes, 20);
  assert.equal(policy.appointments.DENTIST.hourlyCapacity, 2);
  assert.equal(policy.appointments.DOCTOR.appointmentTypes[0].hourlyCapacity, 1);
  assert.equal(policy.appointments.DOCTOR.cascadeNextHour, false);
});

test('booking and availability agree on opening, lunch, closing and slot boundaries', () => {
  const { clinic } = makeServerPolicy(1, { openTime: '09:00', closeTime: '16:00', slotMinutes: 20 });
  for (const [time, issue] of Object.entries({
    '08:40': 'OUTSIDE_CLINIC_HOURS', '09:00': null, '09:15': 'OFF_SLOT_GRID',
    '12:00': 'LUNCH_BREAK', '13:00': null, '15:40': null, '16:00': 'OUTSIDE_CLINIC_HOURS',
  })) assert.equal(scheduleSlotIssue(time, clinic), issue);
  assert.deepEqual(parseBookingTime('2026-11-11 09:20:00'), { date: '2026-11-11', time: '09:20', dateTime: '2026-11-11 09:20:00' });
  for (const bad of ['2026-02-29 09:00:00', '2026-11-11 24:00:00', '2026-11-11 09:00:01']) assert.equal(parseBookingTime(bad), null);
});

test('lower capacity counts grandfathered appointments and drives the recovery buffer', () => {
  const { appointments } = makeServerPolicy(1, { 'doctorCapacity:General consultation': 1, dentistCapacity: 1 });
  const bookings = groupBookingsByHour([{ time_slot: '09:15', appointment_type: 'General consultation' }]);
  const availability = availabilityForHour('09:00', bookings, appointments.DOCTOR);
  assert.equal(availability['General consultation'].available, false);
  assert.equal(availability['Prescription refill'].available, true);
  assert.equal(isRecoveryBlocked('10:00', bookings, appointments.DOCTOR), true);
  assert.equal(isRecoveryBlocked('00:00', bookings, appointments.DOCTOR), false);
  assert.equal(isRecoveryBlocked('10:00', bookings, { ...appointments.DOCTOR, cascadeNextHour: false }), false);
  assert.equal(availabilityForHour('09:00', bookings, appointments.DENTIST)['Dental Checkup'].available, false);
});
