import express from 'express';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles, requirePermission } from '../../middleware/rbac.js';
import { registerAnalyticsDashboard } from './dashboard.js';
import { registerAnalyticsExports } from './exports.js';

const router = express.Router();

const clinicalRoles = ['DOCTOR', 'DENTIST'];
router.use(authenticateToken, requireRoles(...clinicalRoles, 'ADMIN'), requirePermission('ANALYTICS_VIEW', { nonAdminRoles: clinicalRoles }));

registerAnalyticsDashboard(router);
registerAnalyticsExports(router);

export default router;
