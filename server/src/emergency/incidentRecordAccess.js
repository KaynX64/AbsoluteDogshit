import { requirePermission } from '../middleware/rbac.js';

export const requireIncidentRecordsView = requirePermission('INCIDENT_RECORDS_VIEW');

// The documents route also serves a patient's own report to non-admin accounts.
export function requireIncidentRecordsViewForAdmin(req, res, next) {
  if (req.user.roles?.includes('ADMIN')) return requireIncidentRecordsView(req, res, next);
  next();
}
