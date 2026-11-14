// Enforces role and permission checks and resolves admin grants.
// server/src/middleware/rbac.js
import { pool } from '../db/pool.js';

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
   • Applies to every account holding ADMIN, including multi-role accounts.
   • Shared endpoints may explicitly allow a non-admin clinical role.
   • An ADMIN user with NO grant rows keeps FULL access (legacy default —
     every administrator created before this feature is unaffected).
   • An ADMIN user holding the SUPER_ADMIN sentinel keeps FULL access.
   • Any other ADMIN user is limited to exactly the codes granted.

   Permissions are read live from the database on each guarded request, so
   grants and revocations take effect immediately (no token re-issue needed).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Fetch a user's raw granted admin-permission codes (empty array = legacy full access). */
export async function getAdminPermissionCodes(userId, connection = pool) {
  const [rows] = await connection.query(
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
export async function resolveAdminPermissions(userId, connection = pool) {
  return classifyAdminPermissions(await getAdminPermissionCodes(userId, connection));
}

export function classifyAdminPermissions(codes) {
  const isSuper = codes.length === 0 || codes.includes('SUPER_ADMIN');
  return { isSuper, codes: isSuper ? ['SUPER_ADMIN'] : codes.filter((c) => c !== 'SUPER_ADMIN') };
}

/**
 * Express middleware factory — guards a route behind an admin-permission code.
 * MUST be mounted after `authenticateToken` (and typically after requireRoles).
 *
 * Behaviour:
 *   • Accounts without ADMIN need an explicitly allowed non-admin role.
 *   • Super admins (legacy no-rows or explicit SUPER_ADMIN) pass.
 *   • Limited admins must hold the requested code.
 */
export function requirePermission(code, { nonAdminRoles = [] } = {}) {
  return async (req, res, next) => {
    try {
      const roles = req.user?.roles;
      if (!Array.isArray(roles) || roles.length === 0) {
        return res.status(403).json({ error: 'Access forbidden: No roles assigned.' });
      }
      if (!roles.includes('ADMIN')) {
        if (roles.some((role) => nonAdminRoles.includes(role))) return next();
        return res.status(403).json({ error: 'Access forbidden: Insufficient permissions.' });
      }

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
