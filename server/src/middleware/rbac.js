// server/src/middleware/rbac.js
import { pool } from '../db.js';

export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(403).json({ error: 'Access forbidden: No roles assigned.' });
    }
    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ error: 'Access forbidden: Insufficient permissions.' });
    }
    next();
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN ARCHETYPE PERMISSIONS (additive — requireRoles above is unchanged)

   Semantics:
   • Applies ONLY to users whose roles are exclusively 'ADMIN'. Any account
     holding a clinical/patient role (DOCTOR, DENTIST, NURSE, …) bypasses
     permission checks entirely, exactly as before this feature existed.
   • An ADMIN user with NO grant rows keeps FULL access (legacy default —
     every administrator created before this feature is unaffected).
   • An ADMIN user holding the SUPER_ADMIN sentinel keeps FULL access.
   • Any other ADMIN user is limited to exactly the codes granted.

   Permissions are read live from the database on each guarded request, so
   grants and revocations take effect immediately (no token re-issue needed).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Fetch a user's raw granted admin-permission codes (empty array = legacy full access). */
export async function getAdminPermissionCodes(userId) {
  const [rows] = await pool.query(
    `SELECT ap.code
     FROM ADMIN_PERMISSIONS ap
     INNER JOIN USER_ADMIN_PERMISSIONS uap ON ap.permission_id = uap.permission_id
     WHERE uap.user_id = ?`,
    [userId]
  );
  return rows.map((r) => r.code);
}

/**
 * Resolve the EFFECTIVE permission state of an ADMIN user.
 * Returns { isSuper, codes }:
 *   isSuper = true  → full access (no grant rows at all, or SUPER_ADMIN granted)
 *   isSuper = false → limited to `codes` (never includes SUPER_ADMIN)
 */
export async function resolveAdminPermissions(userId) {
  const codes = await getAdminPermissionCodes(userId);
  const isSuper = codes.length === 0 || codes.includes('SUPER_ADMIN');
  return { isSuper, codes: isSuper ? ['SUPER_ADMIN'] : codes.filter((c) => c !== 'SUPER_ADMIN') };
}

/** Does this JWT user hold any non-ADMIN role? (permission model governs ADMIN only) */
function hasNonAdminRole(user) {
  return (user.roles || []).some((r) => r !== 'ADMIN');
}

/**
 * Express middleware factory — guards a route behind an admin-permission code.
 * MUST be mounted after `authenticateToken` (and typically after requireRoles).
 *
 * Behaviour:
 *   • Non-ADMIN-only users (e.g. DOCTOR/DENTIST on shared analytics routes)
 *     pass through untouched — identical to pre-feature behaviour.
 *   • Super admins (legacy no-rows or explicit SUPER_ADMIN) pass.
 *   • Limited admins must hold the requested code.
 */
export function requirePermission(code) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.roles) {
        return res.status(403).json({ error: 'Access forbidden: No roles assigned.' });
      }
      // Clinical/patient roles are not governed by admin permissions.
      if (hasNonAdminRole(req.user)) return next();

      const { isSuper, codes } = await resolveAdminPermissions(req.user.user_id);
      if (isSuper) return next();
      if (codes.includes(code)) return next();

      return res.status(403).json({
        error: `Access forbidden: this admin archetype lacks the ${code} permission.`,
        code: 'ADMIN_PERMISSION_DENIED',
        requiredPermission: code,
      });
    } catch (err) {
      console.error('[requirePermission Error]:', err.message);
      // Fail closed on lookup errors, with a distinct message.
      return res.status(500).json({ error: 'Permission lookup failed.' });
    }
  };
}
