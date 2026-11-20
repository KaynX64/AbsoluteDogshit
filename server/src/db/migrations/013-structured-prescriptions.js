import { ensureColumns, readColumn } from './schema.js';

export default {
  version: 13, name: 'structured prescribing snapshots and idempotency',
  async schema(connection) {
    await ensureColumns(connection, [
      { table: 'PRESCRIPTIONS', column: 'contract_version', type: 'SMALLINT NOT NULL DEFAULT 1' },
      { table: 'PRESCRIPTIONS', column: 'issuance_request_id', type: 'CHAR(36) NULL' },
      { table: 'PRESCRIPTIONS', column: 'request_hash', type: 'CHAR(64) NULL' },
      { table: 'PRESCRIPTIONS', column: 'clinical_snapshot', type: 'LONGTEXT NULL' },
      { table: 'PRESCRIPTION_ITEMS', column: 'catalog_medicine_id', type: 'BIGINT NULL' },
      { table: 'PRESCRIPTION_ITEMS', column: 'item_sequence', type: 'INT NULL' },
      { table: 'PRESCRIPTION_ITEMS', column: 'structured_details', type: 'TEXT NULL' },
    ]);
    const duration = await readColumn(connection, 'PRESCRIPTION_ITEMS', 'duration_days');
    if (!/^int(?:\(\d+\))?$/i.test(duration?.COLUMN_TYPE ?? '')) throw Error('Unexpected prescription duration definition');
    if (duration?.IS_NULLABLE === 'NO') await connection.query('ALTER TABLE PRESCRIPTION_ITEMS MODIFY COLUMN duration_days INT NULL');
    const quantity = await readColumn(connection, 'PRESCRIPTION_ITEMS', 'quantity_prescribed');
    if (/^int(?:\(\d+\))?$/i.test(quantity?.COLUMN_TYPE ?? '')) {
      await connection.query('ALTER TABLE PRESCRIPTION_ITEMS MODIFY COLUMN quantity_prescribed DECIMAL(12,3) NOT NULL DEFAULT 1');
    } else if (quantity?.COLUMN_TYPE?.toLowerCase() !== 'decimal(12,3)' || quantity.IS_NULLABLE !== 'NO') throw Error('Unexpected prescription quantity definition');
    const [indexes] = await connection.query(`SELECT NON_UNIQUE, COLUMN_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PRESCRIPTIONS' AND INDEX_NAME = 'uq_rx_request' ORDER BY SEQ_IN_INDEX`);
    if (!indexes.length) await connection.query('ALTER TABLE PRESCRIPTIONS ADD UNIQUE INDEX uq_rx_request (doctor_user_id, issuance_request_id)');
    else if (indexes.length !== 2 || indexes.some((row, index) => row.NON_UNIQUE !== 0 || row.COLUMN_NAME !== ['doctor_user_id', 'issuance_request_id'][index])) throw Error('Unexpected prescription request index');
  },
};
