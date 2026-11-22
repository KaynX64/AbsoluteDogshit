// Serves the scoped dashboard summary, department counts, and report access status.

import { requireAnalyticsExport } from '../../analytics/access.js';
import { analyticsSummary } from '../../analytics/summary.js';
import { listConsultationsByDepartment } from '../../analytics/reportQueries.js';

// Mount scoped dashboard, print authorization, and department count endpoints.
export function registerAnalyticsDashboard(router) {
  // Return the dashboard sections allowed by the caller's analytics scopes.
  router.get('/summary', async (req, res) => {
    try {
      res.json(await analyticsSummary(req.analyticsScopes));
    } catch (error) {
      console.error('[Analytics summary]', error.code || error.name);
      res.status(500).json({ error: 'Failed to compute health analytics summary.' });
    }
  });

  // Confirm the caller has export access before generating a print view.
  router.get('/report-access', requireAnalyticsExport, (req, res) => res.json({ scopes: [...req.analyticsScopes] }));

  // Return department counts to callers with the Operations scope.
  router.get('/by-department', async (req, res) => {
    if (!req.analyticsScopes.has('ANALYTICS_OPERATIONS')) {
      return res.status(403).json({ error: 'Operations access is required.', requiredPermission: 'ANALYTICS_OPERATIONS' });
    }
    try {
      const breakdown = await listConsultationsByDepartment({ fallback: 'Other / Walk-in' });
      res.json(breakdown.map(/* Return a department count under the response's supported field names. */ ({ department, count }) => ({
        department, consultations_count: count, consultation_count: count,
      })));
    } catch (error) {
      console.error('[Analytics departments]', error.code || error.name);
      res.status(500).json({ error: 'Failed to aggregate departmental consultation data.' });
    }
  });
}
