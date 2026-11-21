import { authenticateToken } from '../../auth/middleware.js';
import { requireResponderAccess, requireClinicalResponder, getResponderAudience } from '../../emergency/responderAccess.js';
import { canReadFiledReports, requireFiledReportAccess, requireDesktopReportClient } from '../../emergency/historyAccess.js';
import { historyOptions, HistoryInputError } from '../../emergency/historyQuery.js';
import { readHistoryPage, readAlertHistory, readReport, readReportSummary } from '../../emergency/historyRead.js';
import { readDraft, saveDraft, deleteDraft, ReportDraftError } from '../../emergency/reportDrafts.js';
import { logPhiAccess } from '../../utils/phiLogger.js';
import { serveIncidentReportPdf } from './incidentReports/archive.js';

export function registerHistoryRoutes(router, io) {
  const staff = [authenticateToken, requireResponderAccess, requireClinicalResponder];
  const id = value => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new HistoryInputError('Invalid incident or report number.');
    return parsed;
  };
  const auditRead = (req, table, recordId = 0, patientUserId = null) => logPhiAccess({
    viewerUserId: req.user.user_id, patientUserId, table, recordId, purpose: 'Responder history / incident documentation', ipAddress: req.ip,
  });
  const handle = callback => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await callback(req, res); } catch (error) {
      if (error instanceof HistoryInputError) return res.status(400).json({ error: error.message });
      if (error instanceof ReportDraftError) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error('[Responder history]', error.code || error.name);
      res.status(500).json({ error: 'Responder records are unavailable. Please retry.' });
    }
  };
  const notifyWork = async (req, alertId, shared) => {
    if (!io) return;
    const audience = shared ? await getResponderAudience({}).catch(() => []) : [{ userId: req.user.user_id, tier: 'clinical' }];
    for (const person of audience) if (person.tier === 'clinical') io.to(`user:${person.userId}`).emit('emergency:report_work_changed', { alertId });
  };

  router.get('/report-summary', ...staff, handle(async (req, res) => {
    res.json(await readReportSummary(req.user.user_id, await canReadFiledReports(req.user.user_id)));
  }));
  for (const [path, kind, extra] of [['/history', 'history', []], ['/report-worklist', 'pending', []], ['/reports', 'filed', [requireFiledReportAccess]]]) {
    router.get(path, ...staff, ...extra, handle(async (req, res) => {
      const view = path === '/report-worklist' && req.query.view === 'drafts' ? 'drafts' : kind;
      const page = await readHistoryPage(req.user.user_id, view, historyOptions(req.query, view));
      auditRead(req, view === 'filed' ? 'INCIDENT_REPORTS' : 'EMERGENCY_ALERTS');
      res.json(page);
    }));
  }
  router.get('/history/:alertId', ...staff, handle(async (req, res) => {
    const detail = await readAlertHistory(req.user.user_id, id(req.params.alertId));
    if (!detail) return res.status(404).json({ error: 'Incident not found.' });
    auditRead(req, 'EMERGENCY_ALERTS', detail.alertId, detail.patient.userId);
    res.json(detail);
  }));
  router.get('/reports/:reportId', ...staff, requireFiledReportAccess, handle(async (req, res) => {
    const report = await readReport(id(req.params.reportId));
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    auditRead(req, 'INCIDENT_REPORTS', report.reportId, report.patientUserId);
    res.json(report);
  }));
  router.get('/reports/:reportId/pdf', ...staff, requireFiledReportAccess, serveIncidentReportPdf);
  router.get('/:alertId/incident-report-draft', ...staff, requireDesktopReportClient, handle(async (req, res) => {
    const alertId = id(req.params.alertId);
    const draft = await readDraft(alertId, req.user.user_id);
    auditRead(req, 'INCIDENT_REPORT_DRAFTS', alertId);
    res.json(draft);
  }));
  router.put('/:alertId/incident-report-draft', ...staff, requireDesktopReportClient, handle(async (req, res) => {
    const alertId = id(req.params.alertId);
    const result = await saveDraft({ alertId, authorId: req.user.user_id, body: req.body, ipAddress: req.ip });
    await notifyWork(req, alertId, req.body.defer === true);
    res.json(result);
  }));
  router.delete('/:alertId/incident-report-draft', ...staff, requireDesktopReportClient, handle(async (req, res) => {
    const alertId = id(req.params.alertId);
    const result = await deleteDraft({ alertId, authorId: req.user.user_id, revision: req.body?.revision, ipAddress: req.ip });
    await notifyWork(req, alertId, false);
    res.json(result);
  }));
}
