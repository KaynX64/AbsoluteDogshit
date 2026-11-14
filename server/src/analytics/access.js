// Resolves live account grants and staff permissions for analytics and report exports.

import { pool } from '../db/pool.js';
import { classifyAdminPermissions } from '../middleware/rbac.js';
import { defaultStaffAnalyticsScopes, validateStaffAnalyticsScopes } from './staffPermissions.js';

const adminSections = [
  'ANALYTICS_OPERATIONS', 'ANALYTICS_CLINICAL', 'ANALYTICS_PHARMACY', 'ANALYTICS_HEADCOUNT',
];
const sections = [...adminSections, 'ANALYTICS_SURVEILLANCE', 'ANALYTICS_DISPENSING'];
const adminScopes = [...adminSections, 'ANALYTICS_EXPORT'];

export async function readAnalyticsAccount(userId, connection = pool) {
    // Role changes can remove permissions in the same transaction.
    const [rows] = await connection.query(`
      SELECT r.code AS role_code, ap.code AS permission_code, staff.scopes AS staff_scopes
      FROM USER_ROLES ur JOIN ROLES r ON r.role_id = ur.role_id
      LEFT JOIN USER_ADMIN_PERMISSIONS uap ON uap.user_id = ur.user_id AND r.code = 'ADMIN'
      LEFT JOIN ADMIN_PERMISSIONS ap ON ap.permission_id = uap.permission_id
      LEFT JOIN STAFF_ANALYTICS_PERMISSIONS staff ON staff.user_id = ur.user_id AND r.code <> 'ADMIN'
      WHERE ur.user_id = ?
    `, [userId]);
    const roles = rows.map(row => row.role_code);
    const stored = defaultStaffAnalyticsScopes(roles) && rows.find(row => row.staff_scopes != null)?.staff_scopes;
    return {
      roles,
      adminCodes: rows.map(row => row.permission_code).filter(Boolean),
      staffScopes: stored == null ? null : validateStaffAnalyticsScopes(typeof stored === 'string' ? JSON.parse(stored) : stored),
    };
}

export async function resolveAnalyticsAccess(req, res, next) {
  res.set('Cache-Control', 'no-store');
  try {
    const { roles, adminCodes, staffScopes } = await readAnalyticsAccount(req.user.user_id);
    const scopes = new Set();
    if (roles.includes('ADMIN')) {
      const { isSuper, codes } = classifyAdminPermissions(adminCodes);
      if (!isSuper && !codes.includes('ANALYTICS_VIEW')) {
        return res.status(403).json({ error: 'Analytics access is required.', requiredPermission: 'ANALYTICS_VIEW' });
      }
      for (const code of adminScopes) {
        if (isSuper || codes.includes(code)) scopes.add(code);
      }
      if (scopes.has('ANALYTICS_CLINICAL')) scopes.add('ANALYTICS_SURVEILLANCE');
      if (scopes.has('ANALYTICS_PHARMACY')) scopes.add('ANALYTICS_DISPENSING');
    } else {
      const defaults = defaultStaffAnalyticsScopes(roles);
      if (!defaults || !(staffScopes ?? defaults).some(scope => sections.includes(scope))) {
        return res.status(403).json({ error: 'Analytics access is required.' });
      }
      for (const scope of staffScopes ?? defaults) scopes.add(scope);
    }
    req.analyticsScopes = scopes;
    next();
  } catch (error) {
    console.error('[Analytics access]', error.code || error.name);
    res.status(500).json({ error: 'Failed to resolve analytics permissions.' });
  }
}

export function requireAnalyticsExport(req, res, next) {
  const scopes = req.analyticsScopes;
  if (!scopes.has('ANALYTICS_EXPORT') || !sections.some(scope => scopes.has(scope))) {
    return res.status(403).json({ error: 'Export and at least one analytics section are required.', requiredPermission: 'ANALYTICS_EXPORT' });
  }
  next();
}
