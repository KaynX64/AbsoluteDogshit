// Adds the appointment status and date index used for clinic-day queries.

import { ensureIndex } from './schema.js';

export default {
  version: 4,
  name: 'appointment status and day index',
  async schema(connection) {
    await ensureIndex(connection, 'APPOINTMENTS', 'idx_app_status_datetime', ['status', 'date_time', 'deleted_at']);
  },
};
