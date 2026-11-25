import { pool } from '../db/pool.js';
import { notice, event, publishQualification } from '../emergency/qualificationService.js';
import { RESPONSE_STAFF_ROLES } from '../emergency/qualificationPolicy.js';
// Notices are durable and deduplicated in MySQL; access never depends on this job.
export async function processResponderQualifications(io) {
    const db = await pool.getConnection(), changed = [];
    try {
        await db.beginTransaction();
        await db.query('SELECT settings_id FROM RESPONDER_QUALIFICATION_SETTINGS WHERE settings_id=1 FOR UPDATE');
        const [rows] = await db.query(`SELECT p.*,u.is_active,u.deleted_at,
   EXISTS(SELECT 1 FROM USER_ROLES ur JOIN ROLES r ON r.role_id=ur.role_id WHERE ur.user_id=p.user_id AND r.code IN (?)) AS staff_role,
   TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(3),p.expires_at) AS remaining
   FROM RESPONDER_APPOINTMENTS p JOIN USERS u ON u.user_id=p.user_id WHERE p.status='active'`, [RESPONSE_STAFF_ROLES]);
        for (const row of rows) {
            const inactive = !row.is_active || row.deleted_at || (row.level === 'staff' && !row.staff_role);
            if (row.remaining <= 0 || inactive) {
                const state = inactive ? 'suspended' : 'expired', reason = inactive ? 'Account inactive or required staff role removed.' : 'Appointment validity ended.';
                await db.query('UPDATE RESPONDER_APPOINTMENTS SET status=?,ended_at=UTC_TIMESTAMP(3),end_reason=? WHERE appointment_id=?', [state, reason, row.appointment_id]);
                await db.query('UPDATE USERS SET is_qualified_responder=0,qualified_responder_note=NULL WHERE user_id=?', [row.user_id]);
                await event(db, row.application_id, null, state.toUpperCase(), { reason, appointmentId: row.appointment_id });
                await notice(db, row.user_id, `appointment:${row.appointment_id}:${state}`, `Your responder appointment has ${state === 'expired' ? 'expired' : 'been suspended'}. ${reason}`, row.appointment_id);
                changed.push(row.user_id);
            }
            else if (row.remaining <= 30 * 86400) {
                const days = row.remaining <= 7 * 86400 ? 7 : 30;
                const inserted = await notice(db, row.user_id, `appointment:${row.appointment_id}:reminder:${days}`, `Your campus responder appointment expires within ${days} days. Submit a renewal for clinic review.`, row.appointment_id);
                if (inserted)
                    changed.push(row.user_id);
            }
        }
        await db.commit();
    }
    catch (error) {
        await db.rollback();
        throw error;
    }
    finally {
        db.release();
    }
    for (const id of new Set(changed))
        await publishQualification(io, id);
    return { metrics: { notified: changed.length } };
}
