// Indexes prescription issue dates and stock movement dates for pharmacy analytics.

import { ensureIndex } from './schema.js';

export default {
  version: 5,
  name: 'pharmacy activity date indexes',
  async schema(connection) {
    await ensureIndex(connection, 'INVENTORY_LOGS', 'idx_inv_activity_date', ['transaction_type', 'created_at']);
    await ensureIndex(connection, 'PRESCRIPTIONS', 'idx_rx_issued_at', 'issued_at');
  },
};
