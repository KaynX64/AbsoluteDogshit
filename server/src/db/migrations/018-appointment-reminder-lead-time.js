import { ensureColumns } from './schema.js';

export default {
  version: 18,
  name: 'Appointment reminder lead time',
  async schema(connection) {
    await ensureColumns(connection, [
      { table: 'APPOINTMENTS', column: 'last_reminder_lead_minutes', type: 'SMALLINT NULL' },
    ]);
  },
};
