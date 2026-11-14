// Removes payload and error text columns from the replay ledger while preserving recorded outcomes.

import { readColumn } from './schema.js';

export default {
  version: 11,
  name: 'offline replay outcome ledger',
  async schema(connection) {
    const drop = [];
    for (const column of ['payload', 'error_message']) {
      if (await readColumn(connection, 'LOCAL_SYNC_LOGS', column)) drop.push('DROP COLUMN ' + column);
    }
    if (drop.length) await connection.query('ALTER TABLE LOCAL_SYNC_LOGS ' + drop.join(', ') + ', ALGORITHM=COPY');
  },
};
