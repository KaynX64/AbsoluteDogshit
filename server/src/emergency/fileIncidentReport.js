// Files and audits one incident report per resolved alert within a transaction.

import { inTransaction } from '../db/transaction.js';
import { logAudit } from '../utils/auditLogger.js';

export class IncidentReportError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function fileIncidentReport({ alertId, responderId, incidentDetails, treatmentNotes, resolution, ipAddress }) {
  try {
    return await inTransaction(async connection => {
      const [[alert]] = await connection.query(
        'SELECT user_id, status, created_at, resolved_at FROM EMERGENCY_ALERTS WHERE alert_id = ? FOR UPDATE',
        [alertId],
      );
      if (!alert) throw new IncidentReportError('Alert not found.', 404);
      if (alert.status !== 'resolved') {
        throw new IncidentReportError(
          `Incident reports are filed for resolved incidents only (current status: ${alert.status}).`,
          409,
          'ALERT_NOT_RESOLVED',
        );
      }

      const resolvedAt = new Date(resolution == null || !String(resolution).trim() ? alert.resolved_at : String(resolution));
      if (Number.isNaN(resolvedAt.getTime())) throw new IncidentReportError('Invalid resolved_at — provide an ISO 8601 date-time.', 400);
      if (resolvedAt.getTime() < new Date(alert.created_at).getTime() - 60_000) {
        throw new IncidentReportError('resolved_at cannot be before the alert was triggered.', 400);
      }
      if (resolvedAt.getTime() > Date.now() + 5 * 60_000) {
        throw new IncidentReportError('resolved_at cannot be in the future.', 400);
      }

      const [insertResult] = await connection.query(
        `INSERT INTO INCIDENT_REPORTS
         (alert_id, patient_user_id, resolved_at, incident_details, treatment_notes, documented_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [alertId, alert.user_id, resolvedAt, incidentDetails, treatmentNotes, responderId],
      );
      const reportId = Number(insertResult.insertId);
      await logAudit(connection, {
        userId: responderId,
        action: 'CREATE',
        table: 'INCIDENT_REPORTS',
        recordId: reportId,
        oldValue: null,
        newValue: {
          operation: 'SOS_INCIDENT_REPORT',
          alertId: Number(alertId),
          patientUserId: Number(alert.user_id),
          resolvedAt: resolvedAt.toISOString(),
        },
        ipAddress,
      });
      return reportId;
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new IncidentReportError('This incident has already been documented by another console.', 409, 'REPORT_ALREADY_FILED');
    }
    throw error;
  }
}
