// Applies the incident archive permission to admin requests and preserves patient access checks.

import { requirePermission } from '../middleware/rbac.js';
import { requireResponderAccess, requireClinicalResponder } from './responderAccess.js';

const archiveGrant = requirePermission('INCIDENT_RECORDS_VIEW');
export function requireIncidentRecordsView(req,res,next) {
 requireResponderAccess(req,res,()=>requireClinicalResponder(req,res,()=>archiveGrant(req,res,next)));
}

// The documents route also serves a patient's own report to non-admin accounts.
// Require the incident archive grant for requests using an administrator account.
export function requireIncidentRecordsViewForAdmin(req, res, next) {
  if (req.user.roles?.includes('ADMIN')) return requireIncidentRecordsView(req, res, next);
  next();
}
