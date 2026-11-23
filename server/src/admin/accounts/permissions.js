// Validates admin permission codes and updates account grants within the caller's transaction.

import { classifyAdminPermissions } from '../../middleware/rbac.js';
import { fail } from '../../utils/httpError.js';

/* ═════════════════════════════════════════════════════════════════════════
   ADMIN ARCHETYPE PERMISSIONS — shared helpers (local to this router)

   Hierarchy model (adjusted manage-user-account feature):
   • Super admins (explicit SUPER_ADMIN grant, or legacy admins with no
     grant rows) own the whole administrator lifecycle. Only they may
     create ADMIN accounts, assign or change the ADMIN role, edit another
     administrator's account/permissions, or override an administrator's
     password.
   • Limited (non-super) admins manage REGULAR user accounts only — they
     can create/edit/suspend students, faculty, staff and clinical roles,
     and reset those accounts' passwords. Administrator accounts are
     read-only for them (they may still edit their own profile fields,
     with their own role/status locked).
   • Role changes away from ADMIN clear stale grants.
   ═══════════════════════════════════════════════════════════════════════ */

/** Validate requested permission codes against the catalog; returns deduped list. */
export async function validatePermissionCodes(connection, requested) {
  if (!Array.isArray(requested)) {
    throw new Error('admin_permissions must be an array of permission codes.');
  }
  // Trim each requested permission code before deduplication.
  const codes = [...new Set(requested.map((c) => String(c).trim()).filter(Boolean))];
  if (codes.length === 0) return [];
  const [rows] = await connection.query(
    'SELECT code FROM ADMIN_PERMISSIONS WHERE code IN (?)',
    [codes]
  );
  const known = new Set(rows.map(/* Extract the permission codes present in the catalog. */ (r) => r.code));
  const unknown = codes.filter(/* Identify requested codes missing from the catalog. */ (c) => !known.has(c));
  if (unknown.length > 0) {
    throw new Error(`Unknown admin permission code(s): ${unknown.join(', ')}`);
  }
  return codes;
}

/**
 * Replace a user's admin-permission grants inside an open transaction.
 * codes === ['SUPER_ADMIN']  → explicit super admin.
 * codes === []               → clear grants (legacy full access).
 */
export async function setAdminPermissionGrants(connection, targetUserId, codes, grantorId) {
  await connection.query('DELETE FROM USER_ADMIN_PERMISSIONS WHERE user_id = ?', [targetUserId]);
  if (!codes || codes.length === 0) return;
  const [permRows] = await connection.query(
    'SELECT permission_id, code FROM ADMIN_PERMISSIONS WHERE code IN (?)',
    [codes]
  );
  for (const row of permRows) {
    await connection.query(
      'INSERT INTO USER_ADMIN_PERMISSIONS (user_id, permission_id, granted_by) VALUES (?, ?, ?)',
      [targetUserId, row.permission_id, grantorId || null]
    );
  }
}

/**
 * Guard helper — resolves the caller's archetype and throws a 403 failure
 * unless the caller is a Super Admin. Used by every admin-lifecycle route
 * so non-super admins cannot create, promote, edit or override
 * administrator accounts (including Super Admin passwords).
 */
export async function requireSuperAdminCaller(req, connection) {
  const [rows] = await connection.query(`
    SELECT ap.code FROM USERS u
    JOIN USER_ROLES ur ON ur.user_id = u.user_id
    JOIN ROLES r ON r.role_id = ur.role_id AND r.code = 'ADMIN'
    LEFT JOIN USER_ADMIN_PERMISSIONS uap ON uap.user_id = u.user_id
    LEFT JOIN ADMIN_PERMISSIONS ap ON ap.permission_id = uap.permission_id
    WHERE u.user_id = ? AND u.is_active = TRUE AND u.deleted_at IS NULL
    FOR SHARE`, [req.user.user_id]);
  const caller = classifyAdminPermissions(rows.map(row => row.code).filter(Boolean));
  if (!rows.length || !caller.isSuper) {
    throw fail('Only a Super Admin can perform this administrator-account action.', 403);
  }
  return caller;
}

/** Current role code of a user (null when the user holds no role row).
 *  Multi-role safe: ADMIN wins over any secondary role so admin-lifecycle
 *  guards can never be sidestepped by a stray extra USER_ROLES row. */
export async function getUserRoleCode(connection, userId) {
  const [rows] = await connection.query(
    `SELECT r.code FROM USER_ROLES ur INNER JOIN ROLES r ON ur.role_id = r.role_id
     WHERE ur.user_id = ?`,
    [userId]
  );
  if (rows.some(/* Give ADMIN precedence when determining the account's primary role. */ (r) => r.code === 'ADMIN')) return 'ADMIN';
  return rows.length > 0 ? rows[0].code : null;
}
