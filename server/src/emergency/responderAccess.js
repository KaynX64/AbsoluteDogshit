// Resolves live responder eligibility and restricts each alert payload to the recipient's access tier.
// server/src/emergency/responderAccess.js
import { pool } from '../db/pool.js';
import { appointmentAccess, RESPONSE_STAFF_ROLES } from './qualificationPolicy.js';

// Legacy eligibility is only retained during the explicitly staged rollout.
export const LEGACY_RESPONDER_ROLES = ['EMERGENCY_RESPONDER','NURSE','DOCTOR','ADMIN'];
export const CLINICAL_ROLES = RESPONSE_STAFF_ROLES;

/** Human label for a role code — shared by /sos and /active so every client
 *  renders the server's roleLabel instead of its own mapping. */
export function roleLabelFor(code) {
  switch (code) {
    case 'ADMIN': return 'System Administrator';
    case 'DOCTOR': return 'Campus Physician';
    case 'DENTIST': return 'Campus Dentist';
    case 'NURSE': return 'Clinic Nurse';
    case 'FACULTY': return 'Faculty / Staff';
    case 'NON_TEACHING': return 'Non-Teaching Staff';
    case 'EMERGENCY_RESPONDER': return 'Emergency Responder';
    case 'STUDENT': return 'Student';
    default: return 'Student';
  }
}

/** Pure tiering primitive (no MySQL — unit-testable). */
export function tierFromRow({isQualifiedResponder=false,hasClinicalRole=false,appointmentLevel='community'}={}) {
 if(!isQualifiedResponder)return null;
 if(appointmentLevel==='staff')return hasClinicalRole?'clinical':null;
 return appointmentLevel==='community'?'community':null;
}

/** Pure tiering from a role-code list (unit-testable). */
export function resolveResponderTier({ isQualifiedResponder = false, roles = [], appointmentLevel = 'community' } = {}) {
  return tierFromRow({
    isQualifiedResponder, appointmentLevel,
    hasClinicalRole: roles.some(/* Check whether a role qualifies for clinical alert details. */ (r) => CLINICAL_ROLES.includes(r)),
  });
}

// Missing configuration or database errors never silently enable legacy access.
export async function qualificationEnforced(db = pool) {
 const [[settings]] = await db.query('SELECT enforced FROM RESPONDER_QUALIFICATION_SETTINGS WHERE settings_id=1');
 if (!settings) throw new Error('Responder qualification settings are missing.');
 return Boolean(settings.enforced);
}
export async function resolveResponderAccess(userId, db = pool) {
 const [[user]] = await db.query('SELECT is_active,deleted_at,is_qualified_responder FROM USERS WHERE user_id=?',[userId]);
 if (!user) return appointmentAccess(null,[],false);
 const [roles] = await db.query('SELECT r.code FROM USER_ROLES ur JOIN ROLES r ON r.role_id=ur.role_id WHERE ur.user_id=?',[userId]);
 const codes=roles.map(row=>row.code);
 const [[appointment]] = await db.query(`SELECT p.*,DATE_FORMAT(p.starts_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS starts_at,DATE_FORMAT(p.expires_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS expires_at FROM RESPONDER_APPOINTMENTS p WHERE user_id=? ORDER BY appointment_id DESC LIMIT 1`,[userId]);
 const enforced=await qualificationEnforced(db);
 const active=Boolean(user.is_active && user.deleted_at===null);
 const access=appointmentAccess(appointment,codes,active);
 if (enforced || appointment) return {...access,qualificationEnforced:enforced};
 const legacy=active && (Boolean(user.is_qualified_responder) || codes.some(r=>LEGACY_RESPONDER_ROLES.includes(r)));
 return {...access,authorized:legacy,tier:legacy ? (codes.some(r=>CLINICAL_ROLES.includes(r)) || codes.includes('ADMIN') ? 'clinical':'community'):null,isQualifiedResponder:active && Boolean(user.is_qualified_responder),qualificationEnforced:false};
}
export async function getResponderAudience({excludeUserId=null}={}) {
 const enforced=await qualificationEnforced();
 const [rows]=await pool.query(
  `SELECT u.user_id,u.is_qualified_responder,p.appointment_id,p.level,p.status,DATE_FORMAT(p.starts_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS starts_at,DATE_FORMAT(p.expires_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS expires_at,
   GROUP_CONCAT(DISTINCT r.code) AS role_codes FROM USERS u
   LEFT JOIN USER_ROLES ur ON ur.user_id=u.user_id LEFT JOIN ROLES r ON r.role_id=ur.role_id
   LEFT JOIN RESPONDER_APPOINTMENTS p ON p.appointment_id=(SELECT MAX(p2.appointment_id) FROM RESPONDER_APPOINTMENTS p2 WHERE p2.user_id=u.user_id)
   WHERE u.is_active=1 AND u.deleted_at IS NULL AND (p.appointment_id IS NOT NULL OR ?=0)
   GROUP BY u.user_id,u.is_qualified_responder,p.appointment_id,p.level,p.status,p.starts_at,p.expires_at`,[enforced?1:0]);
 return rows.filter(row=>Number(row.user_id)!==Number(excludeUserId)).flatMap(row=>{
  const roles=(row.role_codes||'').split(',');
  const access=appointmentAccess(row.appointment_id ? row:null,roles);
  if (access.authorized) return [{userId:Number(row.user_id),tier:access.tier}];
  if (!enforced && !row.appointment_id && (row.is_qualified_responder || roles.some(r=>LEGACY_RESPONDER_ROLES.includes(r))))
   return [{userId:Number(row.user_id),tier:roles.some(r=>CLINICAL_ROLES.includes(r)) || roles.includes('ADMIN')?'clinical':'community'}];
  return [];
 });
}

/**
 * Express middleware — guards SOS routes behind live responder access.
 * Sets req.responderTier ('clinical' | 'community') for payload tiering.
 */
export function requireResponderAccess(req, res, next) {
  // Forward a responder access lookup failure to Express.
  resolveResponderAccess(req.user.user_id)
    // Attach the authorized responder tier to the request or return a denial.
    .then(({ authorized, tier }) => {
      if (!authorized) {
        return res.status(403).json({
          error: 'Access forbidden: this account is not an active qualified responder.',
          code: 'RESPONDER_ACCESS_DENIED',
        });
      }
      req.responderTier = tier;
      next();
    })
    .catch((err) => {
      console.error('[requireResponderAccess Error]:', err.message);
      res.status(500).json({ error: 'Responder access lookup failed.' });
    });
}

/** Action permissions use the live caller tier, independently of payload redaction. */
export function canUpdateIncidentStatus(tier, status) {
  return (tier === 'clinical' && ['acknowledged', 'dispatched', 'resolved', 'false_alarm'].includes(status))
    || (tier === 'community' && status === 'acknowledged');
}

/** Run after requireResponderAccess so report workflows reuse its live lookup. */
export function requireClinicalResponder(req, res, next) {
  if (req.responderTier !== 'clinical') {
    return res.status(403).json({
      error: 'Incident reporting is restricted to authorized response staff.',
      code: 'RESPONDER_ACTION_FORBIDDEN',
    });
  }
  next();
}

const MEDICAL_DETAIL_KEYS = [
  'bloodType', 'blood_type',
  'allergies',
  'chronicConditions', 'chronic_conditions',
  'emergencyContact', 'emergency_contact_name', 'emergency_contact_phone',
];

/**
 * Tier the payload: community responders lose every medical detail (blood
 * type, allergies, chronic conditions, emergency contact). Name, phone, ID,
 * location, address and map link stay. Clinical tiers keep everything.
 * Always sets medicalDetailsRedacted so clients can render an explicit
 * "not shared at your responder level" notice.
 */
export function redactForTier(payload, tier) {
  const out = { ...payload };
  if (tier === 'clinical') {
    out.medicalDetailsRedacted = false;
    return out;
  }
  for (const key of MEDICAL_DETAIL_KEYS) delete out[key];
  out.medicalDetailsRedacted = true;
  return out;
}

/**
 * Pure validation for PUT /api/admin/users/:id/qualified-responder.
 * Returns { ok, error, value } — unit-testable without MySQL.
 */
export function parseQualifiedResponderBody(body) {
  const raw = body ?? {};
  if (typeof raw.is_qualified_responder !== 'boolean') {
    return { ok: false, error: 'is_qualified_responder must be true or false.' };
  }
  let note = null;
  if (raw.note !== undefined && raw.note !== null) {
    if (typeof raw.note !== 'string') {
      return { ok: false, error: 'note must be a string.' };
    }
    note = raw.note.trim();
    if (note.length > 150) {
      return { ok: false, error: 'Note must be 150 characters or fewer.' };
    }
  }
  return {
    ok: true,
    value: { is_qualified_responder: raw.is_qualified_responder, note },
  };
}
