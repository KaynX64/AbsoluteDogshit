// Applies analytics access checks and mounts dashboard and export routes.

import express from 'express';
import { authenticateToken } from '../../auth/middleware.js';
import { resolveAnalyticsAccess } from '../../analytics/access.js';
import { registerAnalyticsDashboard } from './dashboard.js';
import { registerAnalyticsExports } from './exports.js';

export default function analyticsRoutes(readSnapshot) {
  const router = express.Router();
  router.use(authenticateToken, resolveAnalyticsAccess);
  registerAnalyticsDashboard(router, readSnapshot);
  registerAnalyticsExports(router);
  return router;
}
