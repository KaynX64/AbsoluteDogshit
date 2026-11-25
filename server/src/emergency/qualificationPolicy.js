// Pure policy shared by routes, fixtures and tests. No account role alone qualifies.
export const RESPONSE_STAFF_ROLES = ['NURSE', 'DOCTOR', 'DENTIST', 'EMERGENCY_RESPONDER'];
export const OPEN_APPLICATION_STATES = ['draft', 'submitted', 'under_review', 'needs_information', 'training_required'];
export const EDITABLE_APPLICATION_STATES = ['draft', 'needs_information', 'training_required'];
export const COMPETENCIES = ['sceneSafety', 'escalation', 'firstAid', 'basicLifeSupport', 'privacy', 'appUse'];
export const campusDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export function qualificationError(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function textField(value, label, max = 4000, required = false) {
    if (value != null && typeof value !== 'string')
        throw qualificationError(`${label} must be text.`);
    const text = (value || '').trim();
    if (text.length > max || (required && !text))
        throw qualificationError(`${label} is required and must be at most ${max} characters.`);
    return text;
}
export function parseApplicationForm(body) {
    if (!['community', 'staff'].includes(body.requestedLevel))
        throw qualificationError('Choose a responder level.');
    return { level: body.requestedLevel, form: {
            affiliation: textField(body.affiliation, 'Campus affiliation', 200),
            trainingHistory: textField(body.trainingHistory, 'Training history'),
        } };
}
export function validateAssessment(raw, { level, roles, now = new Date() }) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw qualificationError('Record the assessment before approval.');
    const assessment = {
        identityVerified: raw.identityVerified === true, affiliationVerified: raw.affiliationVerified === true,
        orientationCompleted: raw.orientationCompleted === true, professionalCredentialsVerified: raw.professionalCredentialsVerified === true,
        assessor: textField(raw.assessor, 'Assessor', 200, true),
        assessmentDate: textField(raw.assessmentDate, 'Assessment date', 10, true),
        method: textField(raw.method, 'Training or assessment method', 200, true),
        notes: textField(raw.notes, 'Assessment notes', 4000, true), result: raw.result,
        competencies: Object.fromEntries(COMPETENCIES.map(key => [key, raw.competencies?.[key] === true])),
        requiredCredentialExpiry: raw.requiredCredentialExpiry || null,
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(assessment.assessmentDate) || Number.isNaN(Date.parse(assessment.assessmentDate)) || new Date(assessment.assessmentDate).toISOString().slice(0, 10) !== assessment.assessmentDate || assessment.assessmentDate > campusDate(now))
        throw qualificationError('Assessment date must be a valid date that is not in the future.');
    if (!assessment.identityVerified || !assessment.affiliationVerified || !assessment.orientationCompleted || assessment.result !== 'passed' || COMPETENCIES.some(key => !assessment.competencies[key]))
        throw qualificationError('Identity, affiliation, orientation and every required competency must pass before approval.');
    if (level === 'staff' && !roles.some(role => RESPONSE_STAFF_ROLES.includes(role)))
        throw qualificationError('Staff appointments require a live clinical or emergency-response staff role.');
    if (level === 'staff' && roles.some(role => ['NURSE', 'DOCTOR', 'DENTIST'].includes(role)) && !assessment.professionalCredentialsVerified)
        throw qualificationError('Verify the professional credentials required for clinical duties.');
    const expires = new Date(now);
    expires.setUTCFullYear(expires.getUTCFullYear() + 1);
    if (expires.getUTCMonth() !== now.getUTCMonth())
        expires.setUTCDate(0);
    if (assessment.requiredCredentialExpiry) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(assessment.requiredCredentialExpiry))
            throw qualificationError('Required credential expiry must be a date.');
        const credentialExpiry = new Date(`${assessment.requiredCredentialExpiry}T00:00:00.000+08:00`);
        if (!Number.isFinite(credentialExpiry.getTime()) || campusDate(credentialExpiry) !== assessment.requiredCredentialExpiry || credentialExpiry <= now)
            throw qualificationError('A required credential has expired or has an invalid date.');
        if (credentialExpiry < expires)
            expires.setTime(credentialExpiry.getTime());
    }
    return { assessment, expires };
}
export function appointmentAccess(appointment, roles, active = true, now = new Date()) {
    const current = appointment?.status === 'active' && new Date(appointment.starts_at) <= now && new Date(appointment.expires_at) > now;
    const staff = appointment?.level === 'staff' && roles.some(role => RESPONSE_STAFF_ROLES.includes(role));
    const authorized = Boolean(active && current && (appointment.level === 'community' || staff));
    return { authorized, tier: authorized ? (staff ? 'clinical' : 'community') : null, isQualifiedResponder: authorized,
        appointmentStatus: appointment?.status === 'active' && new Date(appointment.expires_at) <= now ? 'expired'
            : appointment?.status === 'active' && (!active || (appointment.level === 'staff' && !staff)) ? 'suspended' : appointment?.status || null,
        appointmentLevel: appointment?.level || null, expiresAt: appointment?.expires_at || null };
}

// Qualification DATETIME fields are stored as UTC, independent of host timezone.
export const utcSqlDate = date => date.toISOString().slice(0,23).replace('T',' ');

// mysql2 interprets DATETIME in the host timezone; these workflow columns store
// UTC wall time. Normalize only database rows at the response boundary.
export function qualificationRecord(row) {
    return Object.fromEntries(Object.entries(row).map(([key,value]) => [key, value instanceof Date
        ? new Date(Date.UTC(value.getFullYear(),value.getMonth(),value.getDate(),value.getHours(),value.getMinutes(),value.getSeconds(),value.getMilliseconds())).toISOString() : value]));
}
