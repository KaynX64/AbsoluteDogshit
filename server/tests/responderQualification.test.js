import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appointmentAccess, validateAssessment, COMPETENCIES } from '../src/emergency/qualificationPolicy.js';
const now = new Date('2026-11-24T08:00:00Z');
const active = (level = 'community') => ({ level, status: 'active', starts_at: new Date('2026-11-01Z'), expires_at: new Date('2027-11-01Z') });
const passed = () => ({ identityVerified: true, affiliationVerified: true, orientationCompleted: true, professionalCredentialsVerified: true,
    assessor: 'Clinic assessor', assessmentDate: '2026-11-24', method: 'Campus practical assessment', notes: 'Observed competency demonstration.', result: 'passed', competencies: Object.fromEntries(COMPETENCIES.map(k => [k, true])) });
test('appointment authority replaces old flags and account roles', () => {
    for (const roles of [['ADMIN'], ['NURSE'], ['DOCTOR'], ['EMERGENCY_RESPONDER']])
        assert.equal(appointmentAccess(null, roles, true, now).authorized, false);
    assert.equal(appointmentAccess(active(), ['STUDENT'], true, now).tier, 'community');
    assert.equal(appointmentAccess(active(), ['DOCTOR'], true, now).tier, 'community');
    assert.equal(appointmentAccess(active('staff'), ['NURSE'], true, now).tier, 'clinical');
    assert.equal(appointmentAccess(active('staff'), ['ADMIN'], true, now).authorized, false);
    assert.equal(appointmentAccess(active('staff'), ['STUDENT'], true, now).authorized, false);
});
test('expiry, suspension, revocation, inactive accounts and future appointments fail closed', () => {
    for (const status of ['expired', 'revoked', 'suspended'])
        assert.equal(appointmentAccess({ ...active(), status }, ['STUDENT'], true, now).authorized, false);
    assert.equal(appointmentAccess(active(), ['STUDENT'], false, now).authorized, false);
    assert.equal(appointmentAccess({ ...active(), expires_at: now }, ['STUDENT'], true, now).authorized, false);
    assert.equal(appointmentAccess({ ...active(), starts_at: new Date('2027-01-01Z') }, ['STUDENT'], true, now).authorized, false);
});
test('campus assessment can qualify without an external certificate; all gates must pass', () => {
    assert.equal(validateAssessment(passed(), { level: 'community', roles: ['STUDENT'], now }).expires.toISOString(), '2027-11-24T08:00:00.000Z');
    for (const key of ['identityVerified', 'affiliationVerified', 'orientationCompleted'])
        assert.throws(() => validateAssessment({ ...passed(), [key]: false }, { level: 'community', roles: ['STUDENT'], now }));
    for (const key of COMPETENCIES) {
        const a = passed();
        a.competencies[key] = false;
        assert.throws(() => validateAssessment(a, { level: 'community', roles: ['STUDENT'], now }));
    }
    assert.throws(() => validateAssessment({ ...passed(), result: 'failed' }, { level: 'community', roles: ['STUDENT'], now }));
    assert.throws(() => validateAssessment({ ...passed(), assessmentDate: '2027-01-01' }, { level: 'community', roles: ['STUDENT'], now }));
});
test('staff appointments require a live staff role and appropriate professional verification', () => {
    assert.throws(() => validateAssessment(passed(), { level: 'staff', roles: ['ADMIN'], now }));
    assert.throws(() => validateAssessment({ ...passed(), professionalCredentialsVerified: false }, { level: 'staff', roles: ['NURSE'], now }));
    assert.doesNotThrow(() => validateAssessment({ ...passed(), professionalCredentialsVerified: false }, { level: 'staff', roles: ['EMERGENCY_RESPONDER'], now }));
});
test('required credentials shorten appointments and expired credentials cannot be approved', () => {
    assert.equal(validateAssessment({ ...passed(), requiredCredentialExpiry: '2027-02-01' }, { level: 'community', roles: ['STUDENT'], now }).expires.toISOString(), '2027-01-31T16:00:00.000Z');
    assert.throws(() => validateAssessment({ ...passed(), requiredCredentialExpiry: '2026-11-01' }, { level: 'community', roles: ['STUDENT'], now }));
});

test('assessment dates follow the Philippine campus day across the UTC boundary',()=>{
 const lateUtc=new Date('2026-11-23T18:00:00Z');
 assert.doesNotThrow(()=>validateAssessment(passed(),{level:'community',roles:['STUDENT'],now:lateUtc}));
});
