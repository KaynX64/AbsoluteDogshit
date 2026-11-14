// Lets Super Admins read and save analytics scope overrides for staff accounts.

import { classifyAdminPermissions } from '../../middleware/rbac.js';
import { pool } from '../../db/pool.js';
import { inTransaction } from '../../db/transaction.js';
import { lockAccount } from '../../admin/accounts/roleChanges.js';
import { readAnalyticsAccount } from '../../analytics/access.js';
import { defaultStaffAnalyticsScopes, staffAnalyticsPermissions, validateStaffAnalyticsScopes } from '../../analytics/staffPermissions.js';
import { logAudit } from '../../utils/auditLogger.js';
import { fail } from '../../utils/httpError.js';

async function requireLiveSuperAdmin(connection, userId) {
  const { roles, adminCodes } = await readAnalyticsAccount(userId, connection);
  if (!roles.includes('ADMIN') || !classifyAdminPermissions(adminCodes).isSuper) {
    throw fail('Only a Super Admin can manage staff analytics permissions.', 403);
  }
}

async function readPermissions(connection, userId) {
  const { roles, staffScopes } = await readAnalyticsAccount(userId, connection);
  const defaults = defaultStaffAnalyticsScopes(roles);
  if (!defaults) throw fail('Staff analytics permissions apply to nurses, doctors and dentists without an Admin role.', 404);
  return { permissions: staffAnalyticsPermissions, defaults, override: staffScopes };
}

export function registerStaffAnalyticsRoutes(router) {
  const route = '/users/:id/analytics-permissions';
  const handle = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ error: 'Invalid account ID.' });
    try {
      res.json(await action(req, userId));
    } catch (error) {
      if (!error.status) console.error('[Staff analytics permissions]', error.code || error.name);
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not manage staff analytics permissions.' });
    }
  };
  router.get(route, handle(async (req, userId) => {
    await requireLiveSuperAdmin(pool, req.user.user_id);
    return readPermissions(pool, userId);
  }));
  router.put(route, handle((req, userId) => inTransaction(async connection => {
    await requireLiveSuperAdmin(connection, req.user.user_id);
    await lockAccount(connection, userId);
    const current = await readPermissions(connection, userId);
    const override = validateStaffAnalyticsScopes(req.body?.scopes);
    if (JSON.stringify(current.override) === JSON.stringify(override)) return current;

    if (override === null) {
      await connection.query('DELETE FROM STAFF_ANALYTICS_PERMISSIONS WHERE user_id = ?', [userId]);
    } else {
      const encoded = JSON.stringify(override);
      await connection.query(`
        INSERT INTO STAFF_ANALYTICS_PERMISSIONS (user_id, scopes) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE scopes = ?
      `, [userId, encoded, encoded]);
    }
    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'UPDATE',
      table: 'STAFF_ANALYTICS_PERMISSIONS',
      recordId: userId,
      oldValue: { scopes: current.override },
      newValue: { scopes: override },
      ipAddress: req.ip,
    });
    return { ...current, override };
  })));
}
