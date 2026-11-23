import { pool } from '../db/pool.js';
import { inTransaction } from '../db/transaction.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { logAudit } from '../utils/auditLogger.js';

export class ReportDraftError extends Error {
  constructor(message, status = 400, code = 'INVALID_REPORT_DRAFT') { super(message); Object.assign(this, { status, code }); }
}

function parsePayload(body) {
  const revision = body?.revision;
  if (!Number.isSafeInteger(revision) || revision < 0) throw new ReportDraftError('A valid draft revision is required.');
  for (const field of ['incidentDetails', 'treatmentNotes']) {
    if (typeof body[field] !== 'string' || body[field].length > 4000) throw new ReportDraftError('Draft fields must contain at most 4000 characters.');
  }
  const resolvedAt = body.resolvedAt || null;
  if (resolvedAt !== null && (typeof resolvedAt !== 'string' || !Number.isFinite(Date.parse(resolvedAt)))) throw new ReportDraftError('Invalid resolution date.');
  if (body.defer !== undefined && typeof body.defer !== 'boolean') throw new ReportDraftError('Invalid deferral flag.');
  return { revision, incidentDetails: body.incidentDetails, treatmentNotes: body.treatmentNotes, resolvedAt };
}

async function requireUnfiledAlert(connection, alertId, lock = false) {
  const [[alert]] = await connection.query(`SELECT alert_id, status FROM EMERGENCY_ALERTS WHERE alert_id = ?${lock ? ' FOR UPDATE' : ''}`, [alertId]);
  if (!alert) throw new ReportDraftError('Alert not found.', 404, 'ALERT_NOT_FOUND');
  const [[report]] = await connection.query('SELECT report_id FROM INCIDENT_REPORTS WHERE alert_id = ?', [alertId]);
  if (report) throw new ReportDraftError('This incident already has a filed report.', 409, 'REPORT_ALREADY_FILED');
  if (alert.status !== 'resolved') throw new ReportDraftError('Only resolved incidents require a report.', 409, 'ALERT_NOT_RESOLVED');
}

function unpack(row) {
  if (!row) return { revision: 0, incidentDetails: '', treatmentNotes: '', resolvedAt: null, updatedAt: null, deferredAt: null };
  try {
    const fields = JSON.parse(decrypt(row.payload));
    if (typeof fields.incidentDetails !== 'string' || typeof fields.treatmentNotes !== 'string') throw new Error();
    return { ...fields, revision: Number(row.revision), updatedAt: row.updated_at, deferredAt: row.deferred_at };
  } catch { throw new ReportDraftError('The saved draft could not be read. It has not been changed.', 503, 'DRAFT_UNREADABLE'); }
}

export async function readDraft(alertId, authorId) {
  await requireUnfiledAlert(pool, alertId);
  const [[row]] = await pool.query('SELECT payload, revision, updated_at, deferred_at FROM INCIDENT_REPORT_DRAFTS WHERE alert_id = ? AND author_id = ?', [alertId, authorId]);
  return unpack(row);
}

export async function saveDraft({ alertId, authorId, body, ipAddress }) {
  const fields = parsePayload(body);
  return inTransaction(async connection => {
    await requireUnfiledAlert(connection, alertId, true);
    const [[existing]] = await connection.query('SELECT revision FROM INCIDENT_REPORT_DRAFTS WHERE alert_id = ? AND author_id = ? FOR UPDATE', [alertId, authorId]);
    if (Number(existing?.revision || 0) !== fields.revision) throw new ReportDraftError('This draft changed in another desktop session. Reload it before saving again.', 409, 'DRAFT_REVISION_CONFLICT');
    const revision = fields.revision + 1;
    const payload = encrypt(JSON.stringify({ incidentDetails: fields.incidentDetails, treatmentNotes: fields.treatmentNotes, resolvedAt: fields.resolvedAt }));
    if (existing) {
      await connection.query(`UPDATE INCIDENT_REPORT_DRAFTS SET payload = ?, revision = ?, updated_at = CURRENT_TIMESTAMP(3),
        deferred_at = IF(?, CURRENT_TIMESTAMP(3), deferred_at) WHERE alert_id = ? AND author_id = ?`, [payload, revision, body.defer === true, alertId, authorId]);
    } else {
      await connection.query(`INSERT INTO INCIDENT_REPORT_DRAFTS (alert_id, author_id, payload, revision, deferred_at)
        VALUES (?, ?, ?, ?, IF(?, CURRENT_TIMESTAMP(3), NULL))`, [alertId, authorId, payload, revision, body.defer === true]);
    }
    await logAudit(connection, { userId: authorId, action: existing ? 'UPDATE' : 'CREATE', table: 'INCIDENT_REPORT_DRAFTS', recordId: alertId,
      newValue: { operation: 'INCIDENT_REPORT_DRAFT_SAVED', revision, deferred: body.defer === true }, ipAddress });
    return { revision };
  });
}

export async function deleteDraft({ alertId, authorId, revision, ipAddress }) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new ReportDraftError('A valid draft revision is required.');
  return inTransaction(async connection => {
    await requireUnfiledAlert(connection, alertId, true);
    const [result] = await connection.query('DELETE FROM INCIDENT_REPORT_DRAFTS WHERE alert_id = ? AND author_id = ? AND revision = ?', [alertId, authorId, revision]);
    if (!result.affectedRows) throw new ReportDraftError('The draft changed or was already removed.', 409, 'DRAFT_REVISION_CONFLICT');
    await logAudit(connection, { userId: authorId, action: 'DELETE', table: 'INCIDENT_REPORT_DRAFTS', recordId: alertId,
      newValue: { operation: 'INCIDENT_REPORT_DRAFT_REMOVED', revision }, ipAddress });
    return { removed: true };
  });
}
