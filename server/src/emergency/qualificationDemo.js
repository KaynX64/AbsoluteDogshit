// Explicit development fixture only. These are not real certificates or approvals.
import { COMPETENCIES, utcSqlDate, campusDate } from './qualificationPolicy.js';
import { event, notice } from './qualificationService.js';
export async function seedQualificationDemo(db) {
    const [users] = await db.query(`SELECT u.user_id,u.first_name,GROUP_CONCAT(r.code) AS roles FROM USERS u JOIN USER_ROLES ur ON ur.user_id=u.user_id JOIN ROLES r ON r.role_id=ur.role_id WHERE u.user_id IN (1,2,3,4,5,6,12) AND u.deleted_at IS NULL GROUP BY u.user_id,u.first_name`);
    const accounts = new Map(users.map(u => [Number(u.user_id), u]));
    if (accounts.get(5)?.first_name.toLowerCase() !== 'daniella' || accounts.get(12)?.first_name.toLowerCase() !== 'rachelle' || !accounts.get(2)?.roles.includes('DOCTOR') || !accounts.get(3)?.roles.includes('NURSE') || !accounts.get(1)?.roles.includes('ADMIN'))
        throw new Error('Demo account identities do not match; no qualification fixture was applied.');
    for (const id of [2, 3])
        await db.query('INSERT IGNORE INTO RESPONDER_REVIEWERS (user_id,designated_by) VALUES (?,1)', [id]);
    const now = new Date(), expires = new Date(now);
    expires.setUTCFullYear(expires.getUTCFullYear() + 1);
    if(expires.getUTCMonth()!==now.getUTCMonth()) expires.setUTCDate(0);
    const result = [];
    for (const id of [2, 3, 4, 6, 5, 12]) {
        if (!accounts.has(id))
            continue;
        const key = `campus-qualification-demo-v1:${id}`;
        const [[existing]] = await db.query('SELECT application_id FROM RESPONDER_APPLICATIONS WHERE fixture_key=?', [key]);
        if (existing) {
            result.push({ userId: id, unchanged: true });
            continue;
        }
        const [[open]] = await db.query('SELECT application_id,source,status FROM RESPONDER_APPLICATIONS WHERE open_user_id=?', [id]);
        if (open && !(open.source === 'legacy' && open.status === 'draft'))
            throw new Error(`Account ${id} has an existing application; fixture will not overwrite a real decision.`);
        const approved = id !== 12, reviewer = id === 2 ? 3 : 2, level = [5, 12].includes(id) ? 'community' : 'staff';
        const form = { affiliation: 'PSU Lingayen — Synthetic demo data', trainingHistory: approved ? 'Synthetic demo data: campus first aid/BLS assessment and responder orientation completed.' : 'Synthetic demo data: student volunteer application; requesting campus first aid/BLS assessment.' };
        const assessment = approved ? { identityVerified: true, affiliationVerified: true, orientationCompleted: true, professionalCredentialsVerified: [2, 3, 6].includes(id), assessor: 'Synthetic demo data — designated clinic assessor', assessmentDate: campusDate(now), method: 'Synthetic demo data — campus-supervised practical assessment', notes: 'Synthetic demo data. No external certificate or real professional credential is asserted by this fixture.', result: 'passed', competencies: Object.fromEntries(COMPETENCIES.map(k => [k, true])), requiredCredentialExpiry: null } : null;
        let applicationId = open?.application_id;
        if (!applicationId) {
            const [insert] = await db.query('INSERT INTO RESPONDER_APPLICATIONS (user_id,form) VALUES (?,?)', [id, JSON.stringify(form)]);
            applicationId = insert.insertId;
        }
        await db.query(`UPDATE RESPONDER_APPLICATIONS SET source='self',status=?,requested_level=?,form=?,assessment=?,reviewed_by=?,responsibilities_accepted_at=UTC_TIMESTAMP(3),decision_reason=?,fixture_key=?,revision=revision+1,updated_at=UTC_TIMESTAMP(3) WHERE application_id=?`, [approved ? 'approved' : 'submitted', level, JSON.stringify(form), assessment ? JSON.stringify(assessment) : null, approved ? reviewer : null, approved ? 'Synthetic demo data: clinic-approved campus appointment.' : null, key, applicationId]);
        if (approved)
            await db.query(`INSERT INTO RESPONDER_APPOINTMENTS (user_id,application_id,level,approved_by,starts_at,expires_at) VALUES (?,?,?,?,?,?)`, [id, applicationId, level, reviewer, utcSqlDate(now), utcSqlDate(expires)]);
        await event(db, applicationId, approved ? reviewer : id, approved ? 'SYNTHETIC_DEMO_APPROVED' : 'SYNTHETIC_DEMO_SUBMITTED', { synthetic: true, form, assessment, reason: approved ? 'Synthetic demo data: approved for campus duties.' : 'Synthetic demo data: awaiting clinic review and practical assessment.' });
        await notice(db, id, key, approved ? 'Synthetic demo data: your campus responder appointment is active.' : 'Synthetic demo data: your application is submitted and awaiting clinic review.');
        result.push({ userId: id, status: approved ? 'approved' : 'submitted', level });
    }
    await db.query('UPDATE RESPONDER_QUALIFICATION_SETTINGS SET enforced=1,enabled_by=1,enabled_at=COALESCE(enabled_at,UTC_TIMESTAMP(3)) WHERE settings_id=1');
    await db.query(`UPDATE USERS u SET is_qualified_responder=EXISTS(SELECT 1 FROM RESPONDER_APPOINTMENTS p WHERE p.user_id=u.user_id AND p.status='active' AND p.starts_at<=UTC_TIMESTAMP(3) AND p.expires_at>UTC_TIMESTAMP(3))`);
    return result;
}
