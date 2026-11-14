import express from 'express';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import serverPolicyRoutes from './serverPolicy.js';
import { registerUserDirectoryRoutes, registerUserHealthProfileRoute } from './userDirectory.js';
import { registerPermissionReadRoutes, registerPermissionUpdateRoute } from './permissions.js';
import { registerPhiAccessLogRoute, registerAuditAndTelemetryRoutes } from './audit.js';
import { registerRoleUpdates } from './userUpdates/roles.js';
import { registerAccountProfileUpdates } from './userUpdates/profile.js';
import { registerAccountCredentialRoutes } from './accountCredentials.js';
import { registerResponderManagementRoutes } from './responders.js';
import { registerDatabaseStudioRoutes } from './databaseStudio/index.js';
import { registerStaffAnalyticsRoutes } from './staffAnalytics.js';

export default function adminRouter(io) {
  const router = express.Router();
  router.use(authenticateToken, requireRoles('ADMIN'));
  router.use('/server-policy', serverPolicyRoutes);

  // Registration order matches the public admin router.
  registerUserDirectoryRoutes(router, io);
  registerPermissionReadRoutes(router);
  registerUserHealthProfileRoute(router);
  registerPhiAccessLogRoute(router);
  registerRoleUpdates(router);
  registerAccountProfileUpdates(router);
  registerAccountCredentialRoutes(router);
  registerResponderManagementRoutes(router, io);
  registerPermissionUpdateRoute(router);
  registerStaffAnalyticsRoutes(router);
  registerAuditAndTelemetryRoutes(router);
  registerDatabaseStudioRoutes(router);

  return router;
}
