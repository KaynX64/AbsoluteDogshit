import { pool } from '../../db/pool.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { renderIncidentReportPDF } from '../pdf/templates/incidentReport.js';
import { incidentReportPdfUrl } from '../publicLinks.js';
import { storeDocumentPdf } from './storage.js';

// ─── INCIDENT REPORTS ─────────────────────────────────────────────────────

export async function generateAndStoreIncidentReportPDF(reportId, database = pool) {
  try {
    const [rows] = await database.query(
      `SELECT ir.report_id, ir.alert_id, ir.patient_user_id, ir.resolved_at,
              ir.incident_details, ir.treatment_notes, ir.documented_by, ir.created_at,
              ir.pdf_s3_key,
              ea.created_at AS alert_created_at, ea.acknowledged_at, ea.resolved_at AS alert_resolved_at,
              ea.response_time_seconds, ea.notes AS alert_notes, ea.latitude, ea.longitude,
              pt.first_name AS patient_first_name, pt.last_name AS patient_last_name, pt.phone AS patient_phone,
              COALESCE(
                (SELECT r.code FROM USER_ROLES ur JOIN ROLES r ON ur.role_id = r.role_id WHERE ur.user_id = pt.user_id LIMIT 1),
                'STUDENT'
              ) AS patient_role,
              COALESCE(
                (SELECT sp.student_no FROM STUDENT_PROFILES sp WHERE sp.user_id = pt.user_id),
                (SELECT fp.faculty_no FROM FACULTY_PROFILES fp WHERE fp.user_id = pt.user_id),
                (SELECT st.license_no FROM STAFF_PROFILES st WHERE st.user_id = pt.user_id),
                (SELECT ntp.employee_no FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = pt.user_id),
                'N/A'
              ) AS patient_id_no,
              COALESCE(
                (SELECT sp.course FROM STUDENT_PROFILES sp WHERE sp.user_id = pt.user_id),
                (SELECT fp.department FROM FACULTY_PROFILES fp WHERE fp.user_id = pt.user_id),
                (SELECT st.department FROM STAFF_PROFILES st WHERE st.user_id = pt.user_id),
                (SELECT ntp.department FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = pt.user_id),
                'PSU Lingayen'
              ) AS patient_affiliation,
              hp.blood_type, hp.allergies,
              doc_u.first_name AS doc_first_name, doc_u.last_name AS doc_last_name,
              doc_st.license_no AS doc_license,
              resp_u.first_name AS resp_first_name, resp_u.last_name AS resp_last_name,
              resp_st.license_no AS resp_license
       FROM INCIDENT_REPORTS ir
       JOIN EMERGENCY_ALERTS ea ON ir.alert_id = ea.alert_id
       JOIN USERS pt ON ir.patient_user_id = pt.user_id
       LEFT JOIN HEALTH_PROFILES hp ON pt.user_id = hp.user_id
       JOIN USERS doc_u ON ir.documented_by = doc_u.user_id
       LEFT JOIN STAFF_PROFILES doc_st ON doc_u.user_id = doc_st.user_id
       LEFT JOIN USERS resp_u ON ea.assigned_responder_id = resp_u.user_id
       LEFT JOIN STAFF_PROFILES resp_st ON resp_u.user_id = resp_st.user_id
       WHERE ir.report_id = ?`,
      [reportId]
    );

    if (rows.length === 0) throw new Error('Incident report not found.');
    const r = rows[0];

    const buffer = await renderIncidentReportPDF({
      report_id: r.report_id,
      alert_id: r.alert_id,
      verification_url: incidentReportPdfUrl(r.report_id),
      patient: {
        first_name: r.patient_first_name,
        last_name: r.patient_last_name,
        id_no: r.patient_id_no,
        role: r.patient_role,
        affiliation: r.patient_affiliation,
        phone: r.patient_phone,
        blood_type: r.blood_type,
        allergies: r.allergies ? (decrypt(r.allergies) || 'None reported') : 'None reported',
      },
      alert: {
        created_at: r.alert_created_at,
        acknowledged_at: r.acknowledged_at,
        resolved_at: r.alert_resolved_at,
        response_time_seconds: r.response_time_seconds,
        notes: r.alert_notes,
        latitude: r.latitude != null ? Number(r.latitude) : null,
        longitude: r.longitude != null ? Number(r.longitude) : null,
      },
      report: {
        resolved_at: r.resolved_at,
        created_at: r.created_at,
        incident_details: r.incident_details,
        treatment_notes: r.treatment_notes,
      },
      documented_by: {
        first_name: r.doc_first_name,
        last_name: r.doc_last_name,
        license_no: r.doc_license,
      },
      assigned_responder: r.resp_first_name
        ? {
            first_name: r.resp_first_name,
            last_name: r.resp_last_name,
            license_no: r.resp_license,
          }
        : null,
    });

    const key = await storeDocumentPdf('incident-reports/incident', reportId, buffer, storageKey =>
      database.query('UPDATE INCIDENT_REPORTS SET pdf_s3_key = ?, pdf_retry_at = NULL WHERE report_id = ? AND pdf_s3_key IS NULL', [storageKey, reportId]),
    );

    if (!key) {
      const [[current]] = await database.query('SELECT pdf_s3_key FROM INCIDENT_REPORTS WHERE report_id = ?', [reportId]);
      return current?.pdf_s3_key ?? null;
    }
    console.log(`📄 [PDF] Incident Report #${reportId} stored in MinIO at ${key}`);
    return key;
  } catch (err) {
    console.error(
      `⚠️ [PDF] Incident Report #${reportId} generation failed:`,
      err.code ?? err.name
    );
    return null;
  }
}
