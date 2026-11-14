import { requireAnalyticsExport } from '../../analytics/access.js';
import { analyticsSummary } from '../../analytics/summary.js';
import { listConsultationsByDepartment } from '../../analytics/reportQueries.js';

export function registerAnalyticsDashboard(router) {
  router.get('/summary', async (req, res) => {
    try {
      res.json(await analyticsSummary(req.analyticsScopes));
    } catch (error) {
      console.error('[Analytics summary]', error.code || error.name);
      res.status(500).json({ error: 'Failed to compute health analytics summary.' });
    }
  });

  router.get('/report-access', requireAnalyticsExport, (req, res) => res.json({ scopes: [...req.analyticsScopes] }));

  router.get('/by-department', async (req, res) => {
    if (!req.analyticsScopes.has('ANALYTICS_OPERATIONS')) {
      return res.status(403).json({ error: 'Operations access is required.', requiredPermission: 'ANALYTICS_OPERATIONS' });
    }
    try {
      const breakdown = await listConsultationsByDepartment({ fallback: 'Other / Walk-in' });
      res.json(breakdown.map(({ department, count }) => ({
        department, consultations_count: count, consultation_count: count,
      })));
    } catch (error) {
      console.error('[Analytics departments]', error.code || error.name);
      res.status(500).json({ error: 'Failed to aggregate departmental consultation data.' });
    }
  });
}
