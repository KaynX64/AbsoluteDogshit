import { getDiagnosisCounts } from '../../analytics/analyticsStats.js';
import {
  listActiveRoles,
  listConsultationsByDepartment,
  listInventoryAlerts,
  listInventoryForReport,
} from '../../analytics/reportQueries.js';
import { renderCsv } from '../../analytics/reports/csv.js';
import { renderExcel } from '../../analytics/reports/excel.js';
import { renderPdf } from '../../analytics/reports/pdf.js';

async function fullReport({ orderByExpiry = false, diagnosisLimit } = {}) {
  const [roles, diagnoses, deptBreakdown, inventory] = await Promise.all([
    listActiveRoles(),
    getDiagnosisCounts(),
    listConsultationsByDepartment(),
    listInventoryForReport({ orderByExpiry }),
  ]);
  return { roles, topDiagnoses: diagnoses.slice(0, diagnosisLimit), deptBreakdown, inventory };
}

function attachment(res, type, filename) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

export function registerAnalyticsExports(router) {
  router.get('/export/csv', async (_req, res) => {
    try {
      const csv = renderCsv(await fullReport({ diagnosisLimit: 10 }));
      attachment(res, 'text/csv; charset=utf-8', `PSU_Health_Report_${Date.now()}.csv`);
      res.send(csv);
    } catch (error) {
      console.error('[Analytics] CSV Export error:', error.code || error.name);
      res.status(500).json({ error: 'Failed to export CSV report.' });
    }
  });

  router.get('/export/excel', async (_req, res) => {
    try {
      const workbook = renderExcel(await fullReport({ orderByExpiry: true }));
      attachment(res, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `PSU_Health_Analytics_${Date.now()}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('[Analytics] Excel Export error:', error.code || error.name);
      if (res.headersSent) return res.destroy(error);
      res.status(500).json({ error: 'Failed to generate Excel report.' });
    }
  });

  router.get('/export/pdf', async (_req, res) => {
    try {
      const [diagnoses, deptRows, medRows] = await Promise.all([
        getDiagnosisCounts(),
        listConsultationsByDepartment({ limit: 6 }),
        listInventoryAlerts(5),
      ]);
      const pdf = await renderPdf({ topDiag: diagnoses.slice(0, 8), deptRows, medRows });
      attachment(res, 'application/pdf', `PSU_Infirmary_Analytics_${Date.now()}.pdf`);
      res.setHeader('Content-Length', String(pdf.length));
      res.send(pdf);
    } catch (error) {
      console.error('[Analytics] PDF Export error:', error.code || error.name);
      res.status(500).json({ error: 'Failed to generate PDF analytics report.' });
    }
  });
}
