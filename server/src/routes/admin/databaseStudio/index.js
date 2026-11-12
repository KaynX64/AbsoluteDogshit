import { requirePermission, resolveAdminPermissions } from '../../../middleware/rbac.js';
import { isReadOnlyTable, isSecurityTable, readOnlyMessage, securityTableMessage } from './tablePolicy.js';
import { registerDatabaseStudioReads } from './reads.js';
import { registerDatabaseStudioWrites } from './writes.js';

const requireDatabaseAccess = requirePermission('DATABASE_MANAGE');

async function requireWritableTable(req, res, next) {
  const table = req.params.table;
  if (isReadOnlyTable(table)) {
    return res.status(403).json({ error: readOnlyMessage(table) });
  }
  if (isSecurityTable(table)) {
    const { isSuper } = await resolveAdminPermissions(req.user.user_id);
    if (!isSuper) return res.status(403).json({ error: securityTableMessage(table) });
  }
  next();
}

export function registerDatabaseStudioRoutes(router) {
  registerDatabaseStudioReads(router, requireDatabaseAccess);
  registerDatabaseStudioWrites(router, requireDatabaseAccess, requireWritableTable);
}
