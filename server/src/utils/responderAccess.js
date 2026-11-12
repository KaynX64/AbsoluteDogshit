// server/src/utils/responderAccess.js
import { pool } from '../db/pool.js';

/* ═════════════════════════════════════════════════════════════════════════
   QUALIFIED RESPONDER — role-independent SOS access
   ═════════════════════════════════════════════════════════════════════════
   Any account can be labelled a Qualified Responder
   (USERS.is_qualified_responder). The flag is ADDITIVE to the legacy
   role-based audience:

   • LEGACY_RESPONDER_ROLES — roles that received SOS alerts before this
     feature existed. They keep receiving them with the flag off. To stop
     alerts for such a user, change the role (the flag never overrides a
     role-based grant).
   • CLINICAL_ROLES — roles treated as clinical (same list consent.js uses).
     Clinical recipients see the full alert payload; flagged users with no
     clinical role (community responders) get a reduced payload without
     medical details.

   The flag is always read LIVE from the database (never from the 24-hour
   JWT), so grants and revocations take effect immediately.
   ═════════════════════════════════════════════════════════════════════════ */

export const LEGACY_RESPONDER_ROLES = ['EMERGENCY_RESPONDER', 'NURSE', 'DOCTOR', 'ADMIN'];
export const CLINICAL_ROLES = ['DOCTOR', 'DENTIST', 'NURSE', 'ADMIN', 'EMERGENCY_RESPONDER'];

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
export function tierFromRow({ isQualifiedResponder = false, hasClinicalRole = false } = {}) {
  if (hasClinicalRole) return 'clinical';
  if (isQualifiedResponder) return 'community';
  return null;
}

/** Pure tiering from a role-code list (unit-testable). */
export function resolveResponderTier({ isQualifiedResponder = false, roles = [] } = {}) {
  return tierFromRow({
    isQualifiedResponder,
    hasClinicalRole: roles.some((r) => CLINICAL_ROLES.includes(r)),
  });
}

/**
 * Live SOS audience: every account that must receive an alert right now.
 * One query over USERS / USER_ROLES / ROLES returning each recipient's id
 * and tier. Conditions: is_active = 1, deleted_at IS NULL, and
 * (flag = 1 OR a legacy responder role).
 */
export async function getResponderAudience({ excludeUserId = null } = {}) {
  const [rows] = await pool.query(
    `SELECT u.user_id,
            u.is_qualified_responder,
            COALESCE(MAX(CASE WHEN r.code IN (?) THEN 1 END), 0) AS has_clinical_role
     FROM USERS u
     LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
     LEFT JOIN ROLES r ON ur.role_id = r.role_id
     WHERE u.is_active = TRUE
       AND u.deleted_at IS NULL
       AND (u.is_qualified_responder = 1 OR r.code IN (?))
     GROUP BY u.user_id, u.is_qualified_responder`,
    [CLINICAL_ROLES, LEGACY_RESPONDER_ROLES]
  );

  return rows
    .filter((row) => Number(row.user_id) !== Number(excludeUserId))
    .map((row) => ({
      userId: Number(row.user_id),
      tier: tierFromRow({
        isQualifiedResponder: Boolean(row.is_qualified_responder),
        hasClinicalRole: Number(row.has_clinical_role) === 1,
      }),
    }));
}

/**
 * Live access check for ONE user (flag OR legacy role), including the
 * is_active / deleted_at guards the JWT never carries.
 * Returns { authorized, tier }.
 */
export async function resolveResponderAccess(userId) {
  const [rows] = await pool.query(
    `SELECT u.is_active, u.deleted_at, u.is_qualified_responder
     FROM USERS u WHERE u.user_id = ?`,
    [userId]
  );
  if (rows.length === 0) return { authorized: false, tier: null };

  const [roleRows] = await pool.query(
    `SELECT r.code FROM USER_ROLES ur INNER JOIN ROLES r ON ur.role_id = r.role_id
     WHERE ur.user_id = ?`,
    [userId]
  );
  const roles = roleRows.map((r) => r.code);
  const isActive = Boolean(rows[0].is_active) && rows[0].deleted_at === null;
  const legacyRole = roles.some((r) => LEGACY_RESPONDER_ROLES.includes(r));
  const flagged = Boolean(rows[0].is_qualified_responder);
  const authorized = isActive && (legacyRole || flagged);
  const tier = authorized
    ? resolveResponderTier({ isQualifiedResponder: flagged, roles })
    : null;
  return { authorized, tier };
}

/**
 * Express middleware — guards SOS routes behind live responder access.
 * Sets req.responderTier ('clinical' | 'community') for payload tiering.
 */
export function requireResponderAccess(req, res, next) {
  resolveResponderAccess(req.user.user_id)
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
