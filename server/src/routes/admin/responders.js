import { requirePermission } from '../../middleware/rbac.js';
// Retired compatibility route: access decisions belong to the reviewed workflow.
export function registerResponderManagementRoutes(router) {
  router.put('/users/:id/qualified-responder', requirePermission('RESPONDERS_MANAGE'), (_req, res) => {
    res.status(409).json({
      error: 'Use Responder qualifications to review applications or suspend/revoke an appointment.',
      code: 'QUALIFICATION_WORKFLOW_REQUIRED',
    });
  });
}
