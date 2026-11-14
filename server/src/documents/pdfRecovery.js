// Retries missing clinical PDFs in bounded batches and defers failed attempts.

import { pool } from '../db/pool.js';
import {
  generateAndStorePrescriptionPDF,
  generateAndStoreClearancePDF,
  generateAndStoreIncidentReportPDF,
} from './documentService.js';

const documentTypes = [
  ['PRESCRIPTIONS', 'prescription_id', 'issued_at', ' AND deleted_at IS NULL', generateAndStorePrescriptionPDF],
  ['MEDICAL_CLEARANCES', 'clearance_id', 'issued_at', ' AND deleted_at IS NULL', generateAndStoreClearancePDF],
  ['INCIDENT_REPORTS', 'report_id', 'created_at', '', generateAndStoreIncidentReportPDF],
];

export async function recoverMissingPdfs({ database = pool, types = documentTypes } = {}) {
  const summary = { attempted: 0, recovered: 0, failed: 0, queryFailures: 0, oldestPendingAt: null };
  for (const [table, id, created, extra, generate] of types) {
    const pending = `pdf_s3_key IS NULL${extra}`;
    try {
      const [rows] = await database.query(
        `SELECT ${id} AS id FROM ${table}
         WHERE ${pending} AND (pdf_retry_at IS NULL OR pdf_retry_at <= UTC_TIMESTAMP())
         ORDER BY ${id} ASC LIMIT 20`,
      );
      for (const row of rows) {
        summary.attempted++;
        let key;
        try {
          key = await generate(row.id, database);
        } catch {
          // A rendering failure must not stop the rest of the batch.
        }
        if (key) {
          summary.recovered++;
          continue;
        }
        summary.failed++;
        try {
          await database.query(
            `UPDATE ${table} SET pdf_retry_at = UTC_TIMESTAMP() + INTERVAL 30 MINUTE
             WHERE ${id} = ? AND ${pending}`,
            [row.id],
          );
        } catch {
          summary.queryFailures++;
        }
      }
      const [[{ oldest }]] = await database.query(
        `SELECT MIN(${created}) AS oldest FROM ${table} WHERE ${pending}`,
      );
      if (oldest && (!summary.oldestPendingAt || oldest < summary.oldestPendingAt)) summary.oldestPendingAt = oldest;
    } catch {
      summary.queryFailures++;
    }
  }
  return summary;
}
