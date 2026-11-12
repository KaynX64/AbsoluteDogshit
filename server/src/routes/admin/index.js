import express from 'express';
import { authenticateToken } from '../../auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import serverPolicyRoutes from './serverPolicy.js';
import { registerUserDirectoryRoutes, registerUserHealthProfileRoute } from './userDirectory.js';
import { registerPermissionReadRoutes, registerPermissionUpdateRoute } from './permissions.js';
import { registerPhiAccessLogRoute, registerAuditAndTelemetryRoutes } from './audit.js';
import { registerUserUpdateRoutes } from './userUpdates.js';
import { registerAccountCredentialRoutes } from './accountCredentials.js';
import { registerResponderManagementRoutes } from './responders.js';
import { registerDatabaseStudioRoutes } from './databaseStudio.js';

export default function adminRouter(io) {
  const router = express.Router();
  router.use(authenticateToken, requireRoles('ADMIN'));
  router.use('/server-policy', serverPolicyRoutes);

  // Registration order matches the public admin router.
  registerUserDirectoryRoutes(router, io);
  registerPermissionReadRoutes(router);
  registerUserHealthProfileRoute(router);
  registerPhiAccessLogRoute(router);
  registerUserUpdateRoutes(router);
  registerAccountCredentialRoutes(router);
  registerResponderManagementRoutes(router, io);
  registerPermissionUpdateRoute(router);
  registerAuditAndTelemetryRoutes(router);
  registerDatabaseStudioRoutes(router);

  return router;
}
