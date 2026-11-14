// Mounts admin routes under the authentication and administrator role gates.

import express from 'express';
import operationsRoutes from './operations.js';
import { registerPresenceRoutes } from './presence.js';
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

export default function adminRouter(io, restart) {
  const router = express.Router();
  router.use(authenticateToken, requireRoles('ADMIN'));
  router.use('/operations', operationsRoutes(restart));
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
  registerPresenceRoutes(router, io);
  registerDatabaseStudioRoutes(router);

  return router;
}
