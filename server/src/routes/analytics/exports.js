import { getDiagnosisCounts } from '../../analytics/analyticsStats.js';
import { loadSurveillance } from '../../analytics/summary.js';
import { getPharmacyAnalytics } from '../../inventory/pharmacyAnalytics.js';
import {
  listActiveRoles,
  listConsultationsByDepartment,
  listInventoryAlerts,
  listInventoryForReport,
} from '../../analytics/reportQueries.js';
import { renderCsv } from '../../analytics/reports/csv.js';
import { renderExcel } from '../../analytics/reports/excel.js';
import { renderPdf } from '../../analytics/reports/pdf.js';
import { requireAnalyticsExport } from '../../analytics/access.js';

async function loadReport(scopes, { orderByExpiry = false, diagnosisLimit, compact = false } = {}) {
  const canViewInventory = scopes.has('ANALYTICS_PHARMACY');
  const canViewDispensing = scopes.has('ANALYTICS_DISPENSING');
  const [roles, diagnoses, deptBreakdown, inventory, surveillance, pharmacy] = await Promise.all([
    scopes.has('ANALYTICS_HEADCOUNT') ? listActiveRoles() : null,
    scopes.has('ANALYTICS_CLINICAL') ? getDiagnosisCounts() : null,
    scopes.has('ANALYTICS_OPERATIONS') ? listConsultationsByDepartment({ limit: compact ? 6 : undefined }) : null,
    canViewInventory ? (compact ? listInventoryAlerts(5) : listInventoryForReport({ orderByExpiry })) : null,
    scopes.has('ANALYTICS_SURVEILLANCE') ? loadSurveillance() : null,
    canViewDispensing || canViewInventory ? getPharmacyAnalytics({ includeDispensing: canViewDispensing, includeReorder: canViewInventory }) : null,
  ]);
  return { roles, topDiagnoses: diagnoses?.slice(0, diagnosisLimit), deptBreakdown, inventory, surveillance, pharmacy };
}

function attachment(res, type, filename) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

export function registerAnalyticsExports(router) {
  router.get('/export/csv', requireAnalyticsExport, async (req, res) => {
    try {
      const csv = renderCsv(await loadReport(req.analyticsScopes, { diagnosisLimit: 10 }));
      attachment(res, 'text/csv; charset=utf-8', `PSU_Health_Report_${Date.now()}.csv`);
      res.send(csv);
    } catch (error) {
      console.error('[Analytics] CSV Export error:', error.code || error.name);
      res.status(500).json({ error: 'Failed to export CSV report.' });
    }
  });

  router.get('/export/excel', requireAnalyticsExport, async (req, res) => {
    try {
      const workbook = renderExcel(await loadReport(req.analyticsScopes, { orderByExpiry: true }));
      attachment(res, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `PSU_Health_Analytics_${Date.now()}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('[Analytics] Excel Export error:', error.code || error.name);
      if (res.headersSent) return res.destroy(error);
      res.status(500).json({ error: 'Failed to generate Excel report.' });
    }
  });

  router.get('/export/pdf', requireAnalyticsExport, async (req, res) => {
    try {
      const pdf = await renderPdf(await loadReport(req.analyticsScopes, { compact: true, diagnosisLimit: 8 }));
      attachment(res, 'application/pdf', `PSU_Infirmary_Analytics_${Date.now()}.pdf`);
      res.setHeader('Content-Length', String(pdf.length));
      res.send(pdf);
    } catch (error) {
      console.error('[Analytics] PDF Export error:', error.code || error.name);
      res.status(500).json({ error: 'Failed to generate PDF analytics report.' });
    }
  });
}
