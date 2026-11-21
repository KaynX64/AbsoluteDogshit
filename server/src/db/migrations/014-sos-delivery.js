// Supports account-scoped SOS retries and durable notification scheduling.
import { ensureColumns, ensureIndex } from './schema.js';

export default {
  version: 14,
  name: 'SOS request identity and dispatch scheduling',
  async schema(connection) {
    const table = 'EMERGENCY_ALERTS';
    await ensureColumns(connection, [
      { table, column: 'client_sos_id', type: 'CHAR(32) NULL' },
      { table, column: 'request_hash', type: 'CHAR(64) NULL' },
      { table, column: 'dispatch_after', type: 'DATETIME(3) NULL' },
    ]);
    await ensureIndex(connection, table, 'uq_sos_request', ['user_id', 'client_sos_id'], { unique: true });
    await ensureIndex(connection, table, 'idx_sos_dispatch', ['dispatch_after', 'alert_id']);
  },
};
