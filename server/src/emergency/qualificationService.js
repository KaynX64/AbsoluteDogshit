import { pool } from '../db/pool.js';
import { resolveAdminPermissions } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';
import { resolveResponderAccess } from './responderAccess.js';
import { COMPETENCIES, OPEN_APPLICATION_STATES, EDITABLE_APPLICATION_STATES, RESPONSE_STAFF_ROLES, qualificationError as fail, parseApplicationForm, textField, validateAssessment, utcSqlDate, qualificationRecord } from './qualificationPolicy.js';
export const asJson = value => typeof value === 'string' ? JSON.parse(value) : value;
export async function qualificationActor(userId, db = pool) {
    const [[user]] = await db.query('SELECT user_id, is_active, deleted_at FROM USERS WHERE user_id=?', [userId]);
    if (!user || !user.is_active || user.deleted_at)
        throw fail('Account is not active.', 403);
    const [rows] = await db.query('SELECT r.code FROM USER_ROLES ur JOIN ROLES r ON r.role_id=ur.role_id WHERE ur.user_id=?', [userId]);
    const roles = rows.map(row => row.code);
    const [[reviewer]] = await db.query('SELECT is_active FROM RESPONDER_REVIEWERS WHERE user_id=?', [userId]);
    let admin = false;
    if (roles.includes('ADMIN')) {
        const perms = await resolveAdminPermissions(userId, db);
        admin = perms.isSuper || perms.codes.includes('RESPONDERS_MANAGE');
    }
    return { userId: Number(userId), roles, admin, reviewer: Boolean(reviewer?.is_active && roles.some(role => ['NURSE', 'DOCTOR'].includes(role))) };
}
export async function event(db, applicationId, actorId, action, details = {}) {
    await db.query('INSERT INTO RESPONDER_QUALIFICATION_EVENTS (application_id,actor_id,action,details) VALUES (?,?,?,?)', [applicationId, actorId, action, JSON.stringify(details)]);
    await logAudit(db, { userId: actorId, action: 'UPDATE', table: 'RESPONDER_APPLICATIONS', recordId: applicationId,
        oldValue: null, newValue: { operation: action }, ipAddress: null });
}
export async function notice(db, userId, key, message, appointmentId = null) {
    const [result] = await db.query('INSERT IGNORE INTO RESPONDER_QUALIFICATION_NOTICES (user_id,appointment_id,notice_key,message) VALUES (?,?,?,?)', [userId, appointmentId, key, message]);
    return result.affectedRows > 0;
}
export async function qualificationTransaction(userId, work) {
    const db = await pool.getConnection();
    try {
        await db.beginTransaction();
        // Includes reviewer removal and rollout: no approval may race revocation.
        await db.query('SELECT settings_id FROM RESPONDER_QUALIFICATION_SETTINGS WHERE settings_id=1 FOR UPDATE');
        const actor = await qualificationActor(userId, db);
        const result = await work(db, actor);
        await db.commit();
        return result;
    }
    catch (error) {
        await db.rollback();
        throw error;
    }
    finally {
        db.release();
    }
}
export async function publishQualification(io, userId) {
    if (!io)
        return;
    const access = await resolveResponderAccess(userId);
    io.to(`user:${userId}`).emit('responder:status_changed', access);
    io.to(`user:${userId}`).emit('qualification:updated', {});
}
export async function getApplication(db, id, actor, { write = false } = {}) {
    const [[row]] = await db.query('SELECT * FROM RESPONDER_APPLICATIONS WHERE application_id=?' + (write ? ' FOR UPDATE' : ''), [id]);
    if (!row)
        throw fail('Application not found.', 404);
    if (Number(row.user_id) !== actor.userId && !actor.admin && !actor.reviewer)
        throw fail('Application is private.', 403);
    row.form = asJson(row.form);
    row.assessment = asJson(row.assessment);
    return row;
}
export async function applicationDetail(id, actor, db = pool) {
    const row = await getApplication(db, id, actor);
    const [[applicant]] = await db.query(`SELECT u.user_id,CONCAT(u.first_name,' ',u.last_name) AS name,u.email,
      COALESCE(sp.student_no,fp.faculty_no,nt.employee_no,st.admin_no,st.license_no,'') AS campus_identifier,
      COALESCE(st.department,sp.course,fp.department,nt.department,'') AS registered_affiliation,
      (SELECT GROUP_CONCAT(r.code ORDER BY r.code) FROM USER_ROLES ur JOIN ROLES r ON r.role_id=ur.role_id WHERE ur.user_id=u.user_id) AS roles
      FROM USERS u LEFT JOIN STUDENT_PROFILES sp ON sp.user_id=u.user_id LEFT JOIN FACULTY_PROFILES fp ON fp.user_id=u.user_id
      LEFT JOIN NON_TEACHING_PROFILES nt ON nt.user_id=u.user_id LEFT JOIN STAFF_PROFILES st ON st.user_id=u.user_id WHERE u.user_id=?`,[row.user_id]);
    const [events] = await db.query(`SELECT e.event_id,e.action,e.details,e.created_at,e.actor_id,CONCAT(u.first_name,' ',u.last_name) AS actor_name
 FROM RESPONDER_QUALIFICATION_EVENTS e LEFT JOIN USERS u ON u.user_id=e.actor_id WHERE application_id=? ORDER BY event_id`, [id]);
    const [evidence] = await db.query('SELECT evidence_id,file_name,mime_type,file_size,created_at,uploaded_by FROM RESPONDER_EVIDENCE WHERE application_id=? ORDER BY evidence_id', [id]);
    const [[appointment]] = await db.query(`SELECT p.*,DATE_FORMAT(p.starts_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS starts_at,DATE_FORMAT(p.expires_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS expires_at FROM RESPONDER_APPOINTMENTS p WHERE application_id=?`, [id]);
    return { ...qualificationRecord(row), applicant, appointment: appointment || null, events: events.map(e => ({ ...qualificationRecord(e), details: asJson(e.details) })), evidence: evidence.map(qualificationRecord) };
}
export async function qualificationOverview(actor) {
    const [applications] = await pool.query(`SELECT a.*, CONCAT(u.first_name,' ',u.last_name) AS applicant_name FROM RESPONDER_APPLICATIONS a
 JOIN USERS u ON u.user_id=a.user_id WHERE a.user_id=? ORDER BY a.application_id DESC`, [actor.userId]);
    const [appointments] = await pool.query(`SELECT p.*,DATE_FORMAT(p.starts_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS starts_at,DATE_FORMAT(p.expires_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS expires_at FROM RESPONDER_APPOINTMENTS p WHERE user_id=? ORDER BY appointment_id DESC`, [actor.userId]);
    const [notices] = await pool.query('SELECT notice_id,message,created_at FROM RESPONDER_QUALIFICATION_NOTICES WHERE user_id=? ORDER BY notice_id DESC LIMIT 30', [actor.userId]);
    const [[settings]] = await pool.query('SELECT enforced,enabled_at FROM RESPONDER_QUALIFICATION_SETTINGS WHERE settings_id=1');
    return { actor, competencies: COMPETENCIES, enforced: Boolean(settings.enforced), applications: applications.map(a => ({ ...qualificationRecord(a), form: asJson(a.form), assessment: asJson(a.assessment) })), appointments: appointments.map(qualificationRecord), notices: notices.map(qualificationRecord), access: await resolveResponderAccess(actor.userId) };
}
export async function createApplication(actorId, body) {
    return qualificationTransaction(actorId, async (db, actor) => {
        const userId = body.userId == null ? actor.userId : Number(body.userId);
        if (!Number.isSafeInteger(userId) || userId < 1)
            throw fail('Choose a valid account.');
        const nominated = userId !== actor.userId;
        if (nominated && !actor.reviewer && !actor.admin)
            throw fail('Only clinic reviewers or responder administrators may nominate.', 403);
        const [[user]] = await db.query('SELECT is_active,deleted_at FROM USERS WHERE user_id=? FOR UPDATE', [userId]);
        if (!user?.is_active || user.deleted_at)
            throw fail('Applicant must have an active account.');
        const [[open]] = await db.query('SELECT application_id FROM RESPONDER_APPLICATIONS WHERE open_user_id=?', [userId]);
        if (open)
            throw fail('This account already has an open application.', 409);
        const [[prior]] = await db.query('SELECT appointment_id FROM RESPONDER_APPOINTMENTS WHERE user_id=? LIMIT 1', [userId]);
        const parsed = parseApplicationForm(body);
        const [result] = await db.query(`INSERT INTO RESPONDER_APPLICATIONS (user_id,source,application_type,requested_level,nominated_by,form) VALUES (?,?,?,?,?,?)`, [userId, nominated ? 'nomination' : 'self', prior ? 'renewal' : 'initial', parsed.level, nominated ? actor.userId : null, JSON.stringify(parsed.form)]);
        await event(db, result.insertId, actor.userId, nominated ? 'NOMINATED' : 'DRAFT_CREATED');
        if (nominated)
            await notice(db, userId, `nomination:${result.insertId}`, 'You have been nominated as a campus responder. Review and accept the nomination before submitting.');
        return { applicationId: result.insertId, userId };
    });
}
export async function changeApplication(actorId, id, body) {
    return qualificationTransaction(actorId, async (db, actor) => {
        const row = await getApplication(db, id, actor, { write: true });
        if (Number(body.revision) !== row.revision)
            throw fail('This record changed. Refresh before saving.', 409);
        if (!OPEN_APPLICATION_STATES.includes(row.status))
            throw fail('This application has already ended.', 409);
        const own = actor.userId === Number(row.user_id);
        let state = row.status, form = row.form, level = row.requested_level, assessment = row.assessment, reason = row.decision_reason;
        let accepted = row.nomination_accepted_at, responsibilities = row.responsibilities_accepted_at;
        const action = body.action;
        if (['save', 'accept_nomination', 'submit', 'withdraw'].includes(action)) {
            if (!own)
                throw fail('Only the applicant can perform this action.', 403);
            if (action === 'withdraw')
                state = 'withdrawn';
            else {
                if (!EDITABLE_APPLICATION_STATES.includes(state))
                    throw fail('The submitted application is locked during review.', 409);
                if (action === 'accept_nomination') {
                    if (row.source !== 'nomination' || body.acceptResponsibilities !== true)
                        throw fail('Accept the nominated responsibilities first.');
                    accepted = utcSqlDate(new Date());
                    responsibilities = accepted;
                }
                else {
                    const parsed = parseApplicationForm(body);
                    form = parsed.form;
                    level = parsed.level;
                    if (action === 'submit') {
                        if (row.source === 'nomination' && !accepted)
                            throw fail('Accept the nomination before submitting.');
                        if (body.acceptResponsibilities !== true)
                            throw fail('Agree to the responder responsibilities.');
                        textField(form.affiliation, 'Campus affiliation', 200, true);
                        textField(form.trainingHistory, 'Training history or requested campus assessment', 4000, true);
                        responsibilities = utcSqlDate(new Date());
                        state = 'submitted';
                    }
                }
            }
        }
        else {
            if (!actor.reviewer)
                throw fail('Only a designated clinic reviewer may assess or decide applications.', 403);
            if (own)
                throw fail('You cannot review or approve your own application.', 403);
            if (row.source === 'nomination' && !row.nomination_accepted_at)
                throw fail('The nominee must first accept the nomination.');
            if (!['submitted', 'under_review'].includes(state))
                throw fail('The applicant must submit before clinic review.', 409);
            if (action === 'start_review') {
                if (state !== 'submitted')
                    throw fail('Review has already started. Refresh the application before continuing.', 409);
                state = 'under_review';
            }
            else if (state !== 'under_review')
                throw fail('Start review before recording assessments or making decisions.', 409);
            else if (['needs_information', 'training_required', 'reject'].includes(action)) {
                reason = textField(body.reason, 'Decision or requested changes', 4000, true);
                state = action === 'reject' ? 'rejected' : action;
            }
            else if (action === 'save_assessment' || action === 'approve') {
                if (action === 'save_assessment') {
                    const raw = body.assessment;
                    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || JSON.stringify(raw).length > 10000)
                        throw fail('Invalid assessment.');
                    assessment = raw;
                    state = 'under_review';
                }
                else {
                    if (!responsibilities || !form.affiliation || !form.trainingHistory)
                        throw fail('Complete and submit the application before approval.');
                    const [roles] = await db.query('SELECT r.code FROM USER_ROLES ur JOIN ROLES r ON r.role_id=ur.role_id WHERE ur.user_id=?', [row.user_id]);
                    const [[target]] = await db.query('SELECT is_active,deleted_at FROM USERS WHERE user_id=? FOR UPDATE', [row.user_id]);
                    if (!target?.is_active || target.deleted_at)
                        throw fail('Applicant account is not active.');
                    const validated = validateAssessment(body.assessment || assessment, { level, roles: roles.map(r => r.code) });
                    assessment = validated.assessment;
                    reason = textField(body.reason, 'Approval rationale', 4000, true);
                    await db.query(`UPDATE RESPONDER_APPOINTMENTS SET status='expired',ended_at=UTC_TIMESTAMP(3),end_reason='Replaced by a renewed clinic appointment' WHERE user_id=? AND status='active'`, [row.user_id]);
                    await db.query(`INSERT INTO RESPONDER_APPOINTMENTS (user_id,application_id,level,approved_by,starts_at,expires_at) VALUES (?,?,?,?,UTC_TIMESTAMP(3),?)`, [row.user_id, id, level, actor.userId, utcSqlDate(validated.expires)]);
                    await db.query('UPDATE USERS SET is_qualified_responder=1,qualified_responder_since=UTC_TIMESTAMP(3),qualified_responder_note=? WHERE user_id=?', ['Clinic-approved campus responder', row.user_id]);
                    state = 'approved';
                }
            }
            else
                throw fail('Unknown application action.');
        }
        await db.query(`UPDATE RESPONDER_APPLICATIONS SET status=?,form=?,requested_level=?,assessment=?,decision_reason=?,reviewed_by=?,nomination_accepted_at=?,responsibilities_accepted_at=?,revision=revision+1,updated_at=UTC_TIMESTAMP(3) WHERE application_id=?`, [state, JSON.stringify(form), level, assessment ? JSON.stringify(assessment) : null, reason, actor.reviewer && !own ? actor.userId : row.reviewed_by, accepted, responsibilities, id]);
        await event(db, id, actor.userId, action.toUpperCase(), { status: state, reason, assessment, form, requestedLevel: level });
        await notice(db, row.user_id, `application:${id}:${row.revision + 1}`, `Responder application: ${state.replaceAll('_', ' ')}.${reason ? ' ' + reason.slice(0, 350) : ''}`);
        return { applicationId: Number(id), userId: Number(row.user_id) };
    });
}
export async function setReviewer(actorId, userId, active) {
    return qualificationTransaction(actorId, async (db, actor) => {
        if (!actor.admin)
            throw fail('Responder administrator permission is required.', 403);
        if (typeof active !== 'boolean')
            throw fail('isActive must be true or false.');
        const [roles] = await db.query(`SELECT r.code FROM USER_ROLES ur JOIN ROLES r ON r.role_id=ur.role_id JOIN USERS u ON u.user_id=ur.user_id WHERE ur.user_id=? AND u.is_active=1 AND u.deleted_at IS NULL`, [userId]);
        if (active && !roles.some(r => ['NURSE', 'DOCTOR'].includes(r.code)))
            throw fail('Designate an active nurse or doctor.');
        await db.query(`INSERT INTO RESPONDER_REVIEWERS (user_id,designated_by,is_active) VALUES (?,?,?) ON DUPLICATE KEY UPDATE designated_by=VALUES(designated_by),is_active=VALUES(is_active),designated_at=UTC_TIMESTAMP(3)`, [userId, actor.userId, active]);
        await logAudit(db, { userId: actor.userId, action: 'UPDATE', table: 'RESPONDER_REVIEWERS', recordId: userId, oldValue: null, newValue: { is_active: active }, ipAddress: null });
    });
}
export async function endAppointment(actorId, id, body) {
    return qualificationTransaction(actorId, async (db, actor) => {
        if (!actor.admin && !actor.reviewer)
            throw fail('Clinic reviewer or responder administrator permission is required.', 403);
        if (!['suspended', 'revoked'].includes(body.status))
            throw fail('Choose suspension or revocation.');
        const reason = textField(body.reason, 'Reason', 4000, true);
        const [[row]] = await db.query('SELECT * FROM RESPONDER_APPOINTMENTS WHERE appointment_id=? FOR UPDATE', [id]);
        if (!row)
            throw fail('Appointment not found.', 404);
        if (!['active', 'suspended'].includes(row.status))
            throw fail('This appointment has already ended.', 409);
        await db.query('UPDATE RESPONDER_APPOINTMENTS SET status=?,ended_at=UTC_TIMESTAMP(3),end_reason=? WHERE appointment_id=?', [body.status, reason, id]);
        await db.query('UPDATE USERS SET is_qualified_responder=0,qualified_responder_note=NULL WHERE user_id=?', [row.user_id]);
        await event(db, row.application_id, actor.userId, body.status.toUpperCase(), { reason, appointmentId: Number(id) });
        await notice(db, row.user_id, `appointment:${id}:${body.status}`, `Your campus responder appointment was ${body.status}. ${reason.slice(0, 350)}`, id);
        return { userId: Number(row.user_id) };
    });
}
export async function enableQualificationRoster(actorId) {
    return qualificationTransaction(actorId, async (db, actor) => {
        if (!actor.admin)
            throw fail('Responder administrator permission is required.', 403);
        const [[{ count }]] = await db.query(`SELECT COUNT(DISTINCT p.user_id) AS count FROM RESPONDER_APPOINTMENTS p
   JOIN USERS u ON u.user_id=p.user_id JOIN USER_ROLES ur ON ur.user_id=u.user_id JOIN ROLES r ON r.role_id=ur.role_id
   WHERE p.status='active' AND p.level='staff' AND p.starts_at<=UTC_TIMESTAMP(3) AND p.expires_at>UTC_TIMESTAMP(3)
   AND u.is_active=1 AND u.deleted_at IS NULL AND r.code IN (?)`, [RESPONSE_STAFF_ROLES]);
        if (!count)
            throw fail('Approve an active response staff roster before enabling qualification enforcement.', 409);
        await db.query('UPDATE RESPONDER_QUALIFICATION_SETTINGS SET enforced=1,enabled_by=?,enabled_at=UTC_TIMESTAMP(3) WHERE settings_id=1', [actor.userId]);
        await db.query(`UPDATE USERS u SET is_qualified_responder=EXISTS(SELECT 1 FROM RESPONDER_APPOINTMENTS p WHERE p.user_id=u.user_id AND p.status='active' AND p.starts_at<=UTC_TIMESTAMP(3) AND p.expires_at>UTC_TIMESTAMP(3) AND (p.level='community' OR EXISTS(SELECT 1 FROM USER_ROLES ur JOIN ROLES r ON r.role_id=ur.role_id WHERE ur.user_id=u.user_id AND r.code IN (?))))`, [RESPONSE_STAFF_ROLES]);
        await logAudit(db, { userId: actor.userId, action: 'UPDATE', table: 'RESPONDER_QUALIFICATION_SETTINGS', recordId: 1, oldValue: null, newValue: { enforced: true }, ipAddress: null });
    });
}
