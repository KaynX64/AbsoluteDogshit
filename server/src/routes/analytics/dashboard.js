// Serves the scoped dashboard summary, department counts, and report access status.

import { requireAnalyticsExport } from '../../analytics/access.js';
import { loadAuthorizedAnalytics, projectAnalytics } from '../../analytics/summary.js';
import { getDashboardSnapshot, recordSnapshotAge, snapshotMaxAgeMs } from '../../analytics/dashboardSnapshots.js';
import { loadControlsEnabled } from '../../bootstrap/admission.js';
import { listConsultationsByDepartment } from '../../analytics/reportQueries.js';

// Mount scoped dashboard, print authorization, and department count endpoints.
export function registerAnalyticsDashboard(router, readSnapshot = getDashboardSnapshot) {
  // Return the dashboard sections allowed by the caller's analytics scopes.
  router.get('/summary', async (req, res) => {
    try {
      if (!loadControlsEnabled()) return res.json(projectAnalytics(req.analyticsScopes, await loadAuthorizedAnalytics(req.analyticsScopes)));
      const snapshot = await readSnapshot(req.analyticsScopes);
      const age = snapshot && Date.now() - snapshot.asOf;
      res.set('Cache-Control', 'no-store');
      if (!snapshot || age < 0 || age > snapshotMaxAgeMs) {
        return res.set('Retry-After', '1').status(503).json({ error: 'Analytics is refreshing. Please retry shortly.', code: 'ANALYTICS_REFRESHING' });
      }
      recordSnapshotAge(snapshot.asOf);
      res.set('X-Analytics-As-Of', new Date(snapshot.asOf).toISOString());
      res.json(projectAnalytics(req.analyticsScopes, snapshot.data));
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
