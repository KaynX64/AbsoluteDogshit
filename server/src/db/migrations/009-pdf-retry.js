import { ensureColumns, ensureIndex } from './schema.js';

export default {
  version: 9,
  name: 'document PDF recovery',
  async schema(connection) {
    for (const [table, id] of [
      ['PRESCRIPTIONS', 'prescription_id'],
      ['MEDICAL_CLEARANCES', 'clearance_id'],
      ['INCIDENT_REPORTS', 'report_id'],
    ]) {
      await ensureColumns(connection, [{ table, column: 'pdf_retry_at', type: 'DATETIME NULL' }]);
      await ensureIndex(connection, table, 'idx_pending_pdf', ['pdf_s3_key', id]);
    }
  },
};
