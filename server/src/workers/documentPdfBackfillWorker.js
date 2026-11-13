import { pool } from '../db/pool.js';
import {
  generateAndStorePrescriptionPDF,
  generateAndStoreClearancePDF,
  generateAndStoreIncidentReportPDF,
} from '../documents/documentService.js';

export async function backfillDocumentPdfs() {
  const [missingRx] = await pool.query(
    `SELECT prescription_id FROM PRESCRIPTIONS
         WHERE pdf_s3_key IS NULL AND deleted_at IS NULL
         ORDER BY prescription_id DESC LIMIT 20`
  );
  for (const rx of missingRx) {
    await generateAndStorePrescriptionPDF(rx.prescription_id);
  }

  const [missingClr] = await pool.query(
    `SELECT clearance_id FROM MEDICAL_CLEARANCES
         WHERE pdf_s3_key IS NULL AND deleted_at IS NULL
         ORDER BY clearance_id DESC LIMIT 20`
  );
  for (const clr of missingClr) {
    await generateAndStoreClearancePDF(clr.clearance_id);
  }

  const [missingReports] = await pool.query(
    `SELECT report_id FROM INCIDENT_REPORTS
         WHERE pdf_s3_key IS NULL
         ORDER BY report_id DESC LIMIT 20`
  );
  for (const ir of missingReports) {
    await generateAndStoreIncidentReportPDF(ir.report_id);
  }
}
