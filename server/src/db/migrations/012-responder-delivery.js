// Adds per-installation SOS delivery preferences and a structured location label.
import { ensureColumns } from './schema.js';

export default {
  version: 12,
  name: 'responder device delivery',
  // Add push installation and duty mode fields plus a formatted address for emergency alerts.
  async schema(connection) {
    await ensureColumns(connection, [
      { table: 'DEVICE_TOKENS', column: 'installation_id', type: 'CHAR(32) NULL' },
      { table: 'DEVICE_TOKENS', column: 'sos_mode', type: "ENUM('on_duty','quiet','off_duty') NOT NULL DEFAULT 'on_duty'" },
      { table: 'EMERGENCY_ALERTS', column: 'location_label', type: 'VARCHAR(512) NULL' },
    ]);
    const [index] = await connection.query(
      `SELECT NON_UNIQUE, COLUMN_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DEVICE_TOKENS'
         AND INDEX_NAME = 'uq_device_installation'`,
    );
    if (!index.length) {
      await connection.query('ALTER TABLE DEVICE_TOKENS ADD UNIQUE INDEX uq_device_installation (installation_id)');
    } else if (index.length !== 1 || index[0].NON_UNIQUE !== 0 || index[0].COLUMN_NAME !== 'installation_id') {
      throw new Error('Unexpected index DEVICE_TOKENS.uq_device_installation');
    }
  },
};
