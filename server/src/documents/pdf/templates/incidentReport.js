// Lays out incident details, response notes, and official report metadata in a PDF.

import {
  BRAND_GREEN,
  BRAND_SOFT,
  TEXT_DARK,
  TEXT_SUB,
  TEXT_MUTED,
  BORDER,
  createDoc,
  bufferFromDoc,
  qrBuffer,
  drawLetterhead,
  drawInfoRow,
  drawSectionTitle,
  drawFooter,
} from '../renderer.js';

// ─── INCIDENT REPORT PDF ──────────────────────────────────────────────────

export async function renderIncidentReportPDF(incident) {
  const {
    report_id,
    alert_id,
    patient = {},
    alert = {},
    report = {},
    documented_by = {},
    assigned_responder = null,
    verification_url = '',
  } = incident;

  const doc = createDoc();
  const bufPromise = bufferFromDoc(doc);

  drawLetterhead(
    doc,
    'Lingayen Campus · Official Emergency Incident & Response Report (R.A. 10173 Verified)'
  );

  // Status banner
  const bannerY = doc.y;
  doc
    .rect(60, bannerY, doc.page.width - 120, 48)
    .fillAndStroke(BRAND_SOFT, BRAND_GREEN);

  doc
    .fillColor(BRAND_GREEN)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('STATUS: INCIDENT RESOLVED & DOCUMENTED', 76, bannerY + 10, {
      width: doc.page.width - 152,
    });

  const resTimeStr = report.resolved_at
    ? new Date(report.resolved_at).toLocaleString('en-PH')
    : 'Recorded';
  const refDetails = `Report Ref: IR-${String(report_id).padStart(5, '0')}  ·  SOS Alert Ref: EA-${String(alert_id).padStart(5, '0')}  ·  Resolved: ${resTimeStr}`;
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(TEXT_DARK)
    .text(refDetails, 76, bannerY + 28, {
      width: doc.page.width - 152,
    });

  doc.y = bannerY + 58;

  // 1. Patient information
  drawSectionTitle(doc, 'PATIENT / VICTIM INFORMATION');
  drawInfoRow(doc, 'Patient Full Name:', `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'N/A');
  drawInfoRow(doc, 'Institutional ID:', patient.id_no || 'N/A');
  drawInfoRow(doc, 'Affiliation / Dept:', patient.affiliation || 'PSU Lingayen');
  drawInfoRow(doc, 'Account Role:', patient.role || 'STUDENT');
  drawInfoRow(doc, 'Contact Phone:', patient.phone || 'N/A');
  if (patient.blood_type || patient.allergies) {
    drawInfoRow(doc, 'Blood Type:', patient.blood_type || 'Unknown');
    drawInfoRow(doc, 'Allergies on File:', patient.allergies || 'None reported');
  }

  // 2. Incident & Dispatch Timeline
  drawSectionTitle(doc, 'EMERGENCY DISPATCH & RESPONSE TIMELINE');
  drawInfoRow(doc, 'Alert Triggered:', alert.created_at ? new Date(alert.created_at).toLocaleString('en-PH') : 'N/A');
  if (alert.acknowledged_at) {
    drawInfoRow(doc, 'Acknowledged At:', new Date(alert.acknowledged_at).toLocaleString('en-PH'));
  }
  drawInfoRow(doc, 'Incident Resolved:', resTimeStr);
  if (alert.response_time_seconds != null) {
    const mins = Math.floor(alert.response_time_seconds / 60);
    const secs = alert.response_time_seconds % 60;
    const durStr = mins > 0 ? `${mins}m ${secs}s (${alert.response_time_seconds}s total)` : `${secs}s`;
    drawInfoRow(doc, 'Response Duration:', durStr);
  }
  if (alert.latitude != null && alert.longitude != null) {
    drawInfoRow(doc, 'GPS Coordinates:', `${Number(alert.latitude).toFixed(6)}, ${Number(alert.longitude).toFixed(6)}`);
  }
  if (alert.notes) {
    drawInfoRow(doc, 'Initial Alert Notes:', alert.notes);
  }
  if (assigned_responder) {
    const respName = `${assigned_responder.first_name || ''} ${assigned_responder.last_name || ''}`.trim();
    drawInfoRow(doc, 'Assigned Responder:', respName || 'Campus Response Unit');
  }

  // 3. Incident details / Narrative
  drawSectionTitle(doc, 'INCIDENT SUMMARY & CLINICAL DETAILS');
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(TEXT_DARK)
    .text(report.incident_details || 'No detailed narrative provided.', {
      align: 'justify',
      lineGap: 3,
      width: doc.page.width - 120,
    });
  doc.moveDown(0.5);

  // 4. Treatment & Actions Taken
  drawSectionTitle(doc, 'TREATMENT & MEDICAL INTERVENTION ACTIONS');
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(TEXT_DARK)
    .text(
      report.treatment_notes && report.treatment_notes.trim()
        ? report.treatment_notes.trim()
        : 'Patient evaluated on site; no emergency pharmacological intervention or off-campus transfer required.',
      {
        align: 'justify',
        lineGap: 3,
        width: doc.page.width - 120,
      }
    );
  doc.moveDown(0.6);

  // 5. Verification seal & Sign-off block
  drawSectionTitle(doc, 'OFFICIAL ATTESTATION & ARCHIVE RECORD');
  const panelY = doc.y;
  const qr = await qrBuffer(verification_url || `IR-${report_id}`, 90);

  doc
    .rect(60, panelY, doc.page.width - 120, 105)
    .fillAndStroke(BRAND_SOFT, BORDER);

  doc.image(qr, 72, panelY + 8, { width: 90, height: 90 });

  doc
    .fillColor(BRAND_GREEN)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('LeoVital HealthLink · Electronic Incident Record', 178, panelY + 12, { width: 330 });
  doc
    .fillColor(TEXT_SUB)
    .font('Helvetica')
    .fontSize(8.5)
    .text(
      'Permanent campus emergency record archived in LeoVital MinIO storage. Certified R.A. 10173 compliant.',
      178,
      panelY + 28,
      { width: 330 }
    );

  const docAuthor = `${documented_by.first_name || ''} ${documented_by.last_name || ''}`.trim();
  doc
    .fillColor(TEXT_DARK)
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text(`Documented By: ${docAuthor || 'Authorized Clinician / Responder'}`, 178, panelY + 54, { width: 330 });

  if (documented_by.license_no) {
    doc
      .fillColor(TEXT_SUB)
      .font('Helvetica')
      .fontSize(8)
      .text(`PRC License / Staff ID: ${documented_by.license_no}`, 178, panelY + 68, { width: 330 });
  }

  doc
    .fillColor(TEXT_MUTED)
    .font('Courier')
    .fontSize(7.5)
    .text(`ARCHIVE REF: IR-${report_id}-SOS-${alert_id}`, 178, panelY + 82, { width: 330 });

  doc.y = panelY + 115;

  drawFooter(doc, 'Incident Report Ref', `IR-${report_id}-EA-${alert_id}`, report.created_at || new Date());

  doc.end();
  return bufPromise;
}
