import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/rbac.js';
import { logAudit } from '../../../utils/auditLogger.js';
import { requireSuperAdminCaller } from '../accountPermissions.js';

export function registerRoleUpdates(router) {
  // 3. PATCH /api/admin/users/:id/role - Role assignment
  router.patch('/users/:id/role', requirePermission('USERS_MANAGE'), async (req, res) => {
    const targetUserId = req.params.id;
    const { role_code } = req.body;

    if (!role_code) return res.status(400).json({ error: 'role_code is required.' });

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [roleRows] = await connection.query('SELECT role_id FROM ROLES WHERE code = ?', [role_code]);
      if (roleRows.length === 0) throw new Error('Invalid role code specified.');
      const newRoleId = roleRows[0].role_id;

      // Previous role — needed for admin-permission grant transitions
      const [prevRoleRows] = await connection.query(
        `SELECT r.code FROM USER_ROLES ur INNER JOIN ROLES r ON ur.role_id = r.role_id
       WHERE ur.user_id = ?`,
        [targetUserId]
      );
      const previousRole = prevRoleRows.length > 0 ? prevRoleRows[0].code : null;

      // ── Admin-lifecycle guard (adjusted manage-user-account feature) ──
      // Only Super Admins may assign the ADMIN role or change the role of
      // any existing ADMIN account. Without this, a limited admin could
      // bypass the admin-creation block by creating a STUDENT and then
      // promoting them, or demote/silence a Super Admin.
      if (role_code === 'ADMIN' || previousRole === 'ADMIN') {
        await requireSuperAdminCaller(req);
      }

      if (['DOCTOR', 'DENTIST', 'NURSE'].includes(role_code)) {
        const [lic] = await connection.query(
          'SELECT license_no FROM STAFF_PROFILES WHERE user_id = ?',
          [targetUserId]
        );
        if (lic.length === 0 || !String(lic[0].license_no || '').trim()) {
          throw new Error('Add a PRC license number (Edit User) before assigning the DOCTOR or DENTIST role.');
        }
      }

      await connection.query('DELETE FROM USER_ROLES WHERE user_id = ?', [targetUserId]);
      await connection.query('INSERT INTO USER_ROLES (user_id, role_id) VALUES (?, ?)', [targetUserId, newRoleId]);

      // ── Admin-archetype permission transitions ────────────────────────
      // • Moving AWAY from ADMIN clears stale grants.
      // • Promoting TO ADMIN (Super Admin callers only — guarded above)
      //   leaves the target as a legacy full admin (historical behaviour).
      if (previousRole === 'ADMIN' && role_code !== 'ADMIN') {
        await connection.query('DELETE FROM USER_ADMIN_PERMISSIONS WHERE user_id = ?', [targetUserId]);
      } else if (previousRole !== 'ADMIN' && role_code === 'ADMIN') {
        await connection.query('DELETE FROM USER_ADMIN_PERMISSIONS WHERE user_id = ?', [targetUserId]);
      }

      await logAudit(connection, {
        userId: req.user.user_id,
        action: 'UPDATE',
        table: 'USER_ROLES',
        recordId: targetUserId,
        oldValue: null,
        newValue: { assigned_role: role_code },
        ipAddress: req.ip,
      });

      await connection.commit();
      res.json({ message: `User #${targetUserId} updated to role ${role_code}.` });
    } catch (error) {
      await connection.rollback();
      res.status(error.status || 400).json({ error: error.message });
    } finally {
      connection.release();
    }
  });
}
