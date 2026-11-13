import { pool } from '../../db/pool.js';
import { requirePermission, resolveAdminPermissions, getAdminPermissionCodes } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { fail } from '../../utils/httpError.js';
import { validatePermissionCodes, setAdminPermissionGrants } from '../../admin/accounts/permissions.js';

export function registerPermissionReadRoutes(router) {
  // 1a. GET /api/admin/permissions - Admin archetype permission catalog
  router.get('/permissions', async (req, res) => {
    try {
      const [perms] = await pool.query(
        'SELECT code, name, description, sort_order FROM ADMIN_PERMISSIONS ORDER BY sort_order ASC'
      );
      const caller = await resolveAdminPermissions(req.user.user_id);
      res.json({
        permissions: perms,
        caller: {
          is_super: caller.isSuper,
          codes: caller.codes,
        },
      });
    } catch (error) {
      console.error('Failed to retrieve permission catalog:', error);
      res.status(500).json({ error: 'Failed to retrieve permission catalog.' });
    }
  });

  // 1b. GET /api/admin/my-permissions - Caller's effective admin permission state
  router.get('/my-permissions', async (req, res) => {
    try {
      const state = await resolveAdminPermissions(req.user.user_id);
      res.json({
        user_id: req.user.user_id,
        archetype: state.isSuper ? 'super' : 'limited',
        is_super: state.isSuper,
        permissions: state.codes,
      });
    } catch (error) {
      console.error('Failed to resolve caller permissions:', error);
      res.status(500).json({ error: 'Failed to resolve caller permissions.' });
    }
  });
}

export function registerPermissionUpdateRoute(router) {
  // 3.5 PUT /api/admin/users/:id/permissions - Replace an admin's permission set
  router.put('/users/:id/permissions', requirePermission('USERS_MANAGE'), async (req, res) => {
    const targetUserId = Number(req.params.id);
    const { admin_permissions } = req.body;

    if (admin_permissions === undefined || !Array.isArray(admin_permissions)) {
      return res.status(400).json({ error: 'admin_permissions must be an array of permission codes.' });
    }

    // ── Fix: empty-set footgun ──────────────────────────────────────────
    // An explicit [] used to be stored as "no grant rows", which the RBAC
    // resolver treats as LEGACY FULL SUPER ADMIN. An operator intending to
    // strip all permissions silently granted the account everything instead.
    // Reject the empty set: to neutralise an admin, demote the role or grant
    // the least-privileged code instead.
    if (admin_permissions.length === 0) {
      return res.status(400).json({
        error:
          'admin_permissions cannot be empty — an empty grant set is indistinguishable from a legacy full-access admin. Demote the account role instead, or grant the least-privileged permission.',
      });
    }

    // Guard: an admin may never modify their own permissions (prevents both
    // self-lockout and self-escalation).
    if (targetUserId === Number(req.user.user_id)) {
      return res.status(403).json({ error: 'You cannot modify your own admin permissions.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Target must hold the ADMIN role (multi-role safe: ANY ADMIN role
      // row qualifies — previously only the first joined row was inspected).
      const [targetRoleRows] = await connection.query(
        `SELECT r.code FROM USER_ROLES ur INNER JOIN ROLES r ON ur.role_id = r.role_id
       WHERE ur.user_id = ?`,
        [targetUserId]
      );
      if (!targetRoleRows.some((r) => r.code === 'ADMIN')) {
        throw new Error('Permissions can only be assigned to ADMIN role accounts.');
      }

      const caller = await resolveAdminPermissions(req.user.user_id);
      let codes = await validatePermissionCodes(connection, admin_permissions);

      // ── Admin-lifecycle guard (adjusted manage-user-account feature) ──
      // Administrator permission sets — super AND limited targets — are
      // managed exclusively by Super Admins. (Previously a limited admin
      // could edit a limited peer's grants; that peer-management path is
      // closed so administrator accounts are fully hands-off for non-supers.)
      if (!caller.isSuper) {
        throw fail('Only a Super Admin can modify administrator permissions.', 403);
      }

      const previousCodes = await getAdminPermissionCodes(targetUserId);
      await setAdminPermissionGrants(connection, targetUserId, codes, req.user.user_id);

      await logAudit(connection, {
        userId: req.user.user_id,
        action: 'UPDATE',
        table: 'USER_ADMIN_PERMISSIONS',
        recordId: targetUserId,
        oldValue: { admin_permissions: previousCodes },
        newValue: {
          operation: 'ADMIN_PERMISSION_SET_REPLACE',
          admin_permissions: codes,
          archetype: codes.includes('SUPER_ADMIN') ? 'super' : codes.length === 0 ? 'legacy-full' : 'limited',
        },
        ipAddress: req.ip,
      });

      await connection.commit();
      res.json({
        message: `Permissions updated for user #${targetUserId}.`,
        admin_permissions: codes.length === 0 ? ['SUPER_ADMIN'] : codes,
        admin_archetype: codes.includes('SUPER_ADMIN') ? 'super' : codes.length === 0 ? 'super' : 'limited',
      });
    } catch (error) {
      await connection.rollback();
      res.status(error.status || 400).json({ error: error.message || 'Failed to update permissions.' });
    } finally {
      connection.release();
    }
  });
}
