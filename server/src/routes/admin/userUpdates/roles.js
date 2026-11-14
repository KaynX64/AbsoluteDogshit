// Validates admin role changes and delegates the update to the shared role service.

import { inTransaction } from '../../../db/transaction.js';
import { changeAccountRole, lockAccount, readAccountRoleAccess } from '../../../admin/accounts/roleChanges.js';
import { requirePermission } from '../../../middleware/rbac.js';
import { logAudit } from '../../../utils/auditLogger.js';

export function registerRoleUpdates(router) {
  router.patch('/users/:id/role', requirePermission('USERS_MANAGE'), async (req, res) => {
    const { id: targetUserId } = req.params;
    const { role_code: role } = req.body ?? {};
    if (typeof role !== 'string' || !role) return res.status(400).json({ error: 'role_code is required.' });

    try {
      await inTransaction(async connection => {
        await lockAccount(connection, targetUserId);
        const access = await readAccountRoleAccess(connection, targetUserId, req.user.user_id);
        await changeAccountRole(connection, { userId: targetUserId, role, access });
        await logAudit(connection, {
          userId: req.user.user_id,
          action: 'UPDATE',
          table: 'USER_ROLES',
          recordId: targetUserId,
          oldValue: null,
          newValue: { assigned_role: role },
          ipAddress: req.ip,
        });
      });
      res.json({ message: `User #${targetUserId} updated to role ${role}.` });
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });
}
