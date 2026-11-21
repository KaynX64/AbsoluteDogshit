import { pool } from '../db/pool.js';
import { decrypt } from '../utils/cryptoVault.js';
import { likeTerm, isoSeconds, pageResult } from './historyQuery.js';

const joins = `FROM EMERGENCY_ALERTS a JOIN USERS u ON u.user_id = a.user_id
  LEFT JOIN STUDENT_PROFILES sp ON sp.user_id = u.user_id
  LEFT JOIN FACULTY_PROFILES fp ON fp.user_id = u.user_id
  LEFT JOIN NON_TEACHING_PROFILES nt ON nt.user_id = u.user_id
  LEFT JOIN STAFF_PROFILES st ON st.user_id = u.user_id
  LEFT JOIN INCIDENT_REPORTS ir ON ir.alert_id = a.alert_id
  LEFT JOIN USERS writer ON writer.user_id = ir.documented_by
  LEFT JOIN INCIDENT_REPORT_DRAFTS d ON d.alert_id = a.alert_id AND d.author_id = ?`;
const fields = `a.alert_id, a.user_id, a.status, a.location_label, a.latitude, a.longitude,
  UNIX_TIMESTAMP(a.created_at) created_seconds, UNIX_TIMESTAMP(a.acknowledged_at) acknowledged_seconds,
  UNIX_TIMESTAMP(a.resolved_at) resolved_seconds, CONCAT(u.first_name, ' ', u.last_name) patient_name,
  u.phone, COALESCE(sp.student_no, fp.faculty_no, nt.employee_no, st.license_no, 'PSU Member') identifier_no,
  ir.report_id, UNIX_TIMESTAMP(ir.created_at) filed_seconds,
  CONCAT(writer.first_name, ' ', writer.last_name) documented_by_name,
  d.revision draft_revision, UNIX_TIMESTAMP(d.updated_at) draft_seconds,
  (SELECT UNIX_TIMESTAMP(MAX(deferred_at)) FROM INCIDENT_REPORT_DRAFTS df WHERE df.alert_id = a.alert_id) deferred_seconds`;

function record(row) {
  return {
    alertId: Number(row.alert_id), status: row.status,
    patient: { userId: Number(row.user_id), name: row.patient_name, identifier: row.identifier_no, phone: row.phone },
    location: row.location_label, latitude: row.latitude == null ? null : Number(row.latitude), longitude: row.longitude == null ? null : Number(row.longitude),
    createdAt: isoSeconds(row.created_seconds), acknowledgedAt: isoSeconds(row.acknowledged_seconds), resolvedAt: isoSeconds(row.resolved_seconds),
    reportId: row.report_id == null ? null : Number(row.report_id), filedAt: isoSeconds(row.filed_seconds), documentedByName: row.documented_by_name,
    hasDraft: row.draft_revision != null, draftUpdatedAt: isoSeconds(row.draft_seconds), deferredAt: isoSeconds(row.deferred_seconds),
    needsReport: row.status === 'resolved' && row.report_id == null,
    sortAt: Number(row.sort_seconds), sortId: Number(row.sort_id),
  };
}

export async function readHistoryPage(userId, kind, options) {
  const pending = kind === 'pending' || kind === 'drafts';
  const at = kind === 'filed' ? 'ir.created_at' : kind === 'drafts' ? 'd.updated_at' : pending ? 'a.resolved_at' : 'a.created_at';
  const id = kind === 'filed' ? 'ir.report_id' : 'a.alert_id';
  const ascending = kind === 'pending';
  const where = [kind === 'filed' ? 'ir.report_id IS NOT NULL' : pending ? "a.status = 'resolved' AND ir.report_id IS NULL" : "a.status IN ('resolved', 'false_alarm')"];
  const params = [userId];
  if (kind === 'drafts') where.push('d.author_id IS NOT NULL');
  if (options.status !== 'all') { where.push('a.status = ?'); params.push(options.status); }
  if (options.start != null) { where.push(`${at} >= FROM_UNIXTIME(?) AND ${at} < FROM_UNIXTIME(?)`); params.push(options.start, options.end); }
  if (options.search) {
    where.push(`(CONCAT(u.first_name, ' ', u.last_name) LIKE ? ESCAPE '!' OR
      COALESCE(sp.student_no, fp.faculty_no, nt.employee_no, st.license_no, '') LIKE ? ESCAPE '!' OR
      a.location_label LIKE ? ESCAPE '!' OR CONCAT(writer.first_name, ' ', writer.last_name) LIKE ? ESCAPE '!' OR a.alert_id = ? OR ir.report_id = ?)`);
    const term = likeTerm(options.search), numeric = /^(?:SOS[- #]*|IR[- #]*|#)?0*(\d+)$/i.exec(options.search)?.[1] || 0;
    params.push(term, term, term, term, numeric, numeric);
  }
  if (options.cursor) {
    const comparison = ascending ? '>' : '<';
    where.push(`(${at} ${comparison} FROM_UNIXTIME(?) OR (${at} = FROM_UNIXTIME(?) AND ${id} ${comparison} ?))`);
    params.push(options.cursor.at, options.cursor.at, options.cursor.id);
  }
  const direction = ascending ? 'ASC' : 'DESC';
  const [rows] = await pool.query(`SELECT ${fields}, UNIX_TIMESTAMP(${at}) sort_seconds, ${id} sort_id
    ${joins} WHERE ${where.join(' AND ')} ORDER BY ${at} ${direction}, ${id} ${direction} LIMIT ?`, [...params, options.limit + 1]);
  return pageResult(rows.map(record), options);
}

export async function readAlertHistory(userId, alertId) {
  const [rows] = await pool.query(`SELECT ${fields} ${joins} WHERE a.alert_id = ?`, [userId, alertId]);
  if (!rows.length) return null;
  const detail = record(rows[0]);
  delete detail.sortAt; delete detail.sortId;
  const [events] = await pool.query(`SELECT al.audit_id, UNIX_TIMESTAMP(al.created_at) at_seconds,
    JSON_UNQUOTE(JSON_EXTRACT(al.new_value, '$.status')) status, CONCAT(actor.first_name, ' ', actor.last_name) actor
    FROM AUDIT_LOGS al LEFT JOIN USERS actor ON actor.user_id = al.user_id
    WHERE al.table_affected = 'EMERGENCY_ALERTS' AND al.record_id = ?
      AND JSON_UNQUOTE(JSON_EXTRACT(al.new_value, '$.operation')) = 'SOS_STATUS_CHANGE'
    ORDER BY al.created_at, al.audit_id`, [alertId]);
  detail.timeline = [{ status: 'triggered', at: detail.createdAt, actor: null }];
  for (const event of events) {
    if (['acknowledged', 'dispatched', 'resolved', 'false_alarm'].includes(event.status)) {
      detail.timeline.push({ status: event.status, at: isoSeconds(event.at_seconds), actor: event.actor });
    }
  }
  for (const [status, at] of [['acknowledged', detail.acknowledgedAt], [detail.status, detail.resolvedAt]]) {
    if (at && !detail.timeline.some(event => event.status === status)) detail.timeline.push({ status, at, actor: null });
  }
  if (detail.reportId) detail.timeline.push({ status: 'report_filed', at: detail.filedAt, actor: detail.documentedByName });
  detail.timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return detail;
}

export async function readReport(reportId) {
  const [rows] = await pool.query(`SELECT ir.report_id, ir.alert_id, ir.patient_user_id, ir.incident_details, ir.treatment_notes,
    UNIX_TIMESTAMP(ir.resolved_at) resolved_seconds, UNIX_TIMESTAMP(ir.created_at) filed_seconds,
    ir.pdf_s3_key, CONCAT(u.first_name, ' ', u.last_name) patient_name,
    CONCAT(w.first_name, ' ', w.last_name) documented_by_name
    FROM INCIDENT_REPORTS ir JOIN USERS u ON u.user_id = ir.patient_user_id
    JOIN USERS w ON w.user_id = ir.documented_by WHERE ir.report_id = ?`, [reportId]);
  const row = rows[0];
  return row ? { reportId: Number(row.report_id), alertId: Number(row.alert_id), patientUserId: Number(row.patient_user_id),
    patientName: row.patient_name, incidentDetails: decrypt(row.incident_details), treatmentNotes: decrypt(row.treatment_notes),
    resolvedAt: isoSeconds(row.resolved_seconds), filedAt: isoSeconds(row.filed_seconds), documentedByName: row.documented_by_name,
    pdfAvailable: Boolean(row.pdf_s3_key) } : null;
}

export async function readReportSummary(userId, canViewFiled) {
  const [[row]] = await pool.query(`SELECT
    SUM(a.status = 'resolved' AND ir.report_id IS NULL) pending,
    SUM(a.status = 'resolved' AND ir.report_id IS NULL AND a.resolved_at < NOW() - INTERVAL 24 HOUR) overdue,
    SUM(a.status = 'resolved' AND ir.report_id IS NULL AND d.author_id IS NOT NULL) drafts
    FROM EMERGENCY_ALERTS a LEFT JOIN INCIDENT_REPORTS ir ON ir.alert_id = a.alert_id
    LEFT JOIN INCIDENT_REPORT_DRAFTS d ON d.alert_id = a.alert_id AND d.author_id = ?
    WHERE a.status = 'resolved'`, [userId]);
  return { pending: Number(row.pending || 0), overdue: Number(row.overdue || 0), drafts: Number(row.drafts || 0), canViewFiled };
}
