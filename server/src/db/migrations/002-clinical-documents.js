// Upgrades clinical document tables, prescription quantities, and their inventory links.

import { ensureColumns, ensureEnum, ensureIndex, readColumn } from './schema.js';

const columns = [
  { table: 'PRESCRIPTIONS', column: 'signature_metadata', type: 'JSON NULL' },
  { table: 'PRESCRIPTIONS', column: 'pdf_s3_key', type: 'VARCHAR(500) NULL' },
  { table: 'PRESCRIPTIONS', column: 'expires_at', type: 'DATE NULL', allowRequired: true },
  { table: 'PRESCRIPTIONS', column: 'version', type: 'INT NOT NULL DEFAULT 1' },
  { table: 'PRESCRIPTIONS', column: 'deleted_at', type: 'TIMESTAMP NULL DEFAULT NULL' },
  // Outside-drug prescriptions: free-text medication name for items not
  // stocked in the infirmary formulary (medicine_id is NULL for these).
  { table: 'PRESCRIPTION_ITEMS', column: 'outside_name', type: "VARCHAR(200) NULL COMMENT 'Free-text drug name for outside (non-formulary) items'" },
  { table: 'PRESCRIPTION_ITEMS', column: 'quantity_prescribed', type: "INT NOT NULL DEFAULT 1 COMMENT 'Quantity prescribed by clinician'" },
  { table: 'INVENTORY_LOGS', column: 'prescription_item_id', type: 'BIGINT NULL' },
  { table: 'MEDICAL_CLEARANCES', column: 'pdf_s3_key', type: 'VARCHAR(500) NULL' },
  { table: 'MEDICAL_CLEARANCES', column: 'version', type: 'INT NOT NULL DEFAULT 1' },
  { table: 'MEDICAL_CLEARANCES', column: 'deleted_at', type: 'TIMESTAMP NULL DEFAULT NULL' },
  { table: 'INCIDENT_REPORTS', column: 'pdf_s3_key', type: 'VARCHAR(500) NULL' },
  { table: 'STAFF_PROFILES', column: 'signature_s3_key', type: 'VARCHAR(500) NULL' },
  { table: 'STAFF_PROFILES', column: 'signature_sha256', type: 'CHAR(64) NULL' },
  { table: 'STAFF_PROFILES', column: 'signature_updated_at', type: 'TIMESTAMP NULL DEFAULT NULL' },
  { table: 'HEALTH_PROFILES', column: 'sex', type: "ENUM('MALE', 'FEMALE') NULL" },
  { table: 'HEALTH_PROFILES', column: 'date_of_birth', type: 'DATE NULL' },
  {
    table: 'HEALTH_PROFILES',
    column: 'bmi',
    type: `DECIMAL(6,2) GENERATED ALWAYS AS (
      CASE
        WHEN height > 0 AND weight > 0
        THEN ROUND(weight / POW(height / 100, 2), 2)
        ELSE NULL
      END
    ) STORED`,
  },
];

export default {
  version: 2,
  name: 'clinical documents and inventory links',
  async prepare(connection) {
    return {
      initializePrescribedQuantity: !(await readColumn(connection, 'PRESCRIPTION_ITEMS', 'quantity_prescribed')),
    };
  },
  async schema(connection) {
    await ensureColumns(connection, columns);
    await ensureIndex(connection, 'PRESCRIPTIONS', 'idx_rx_expires', 'expires_at');
    const medicineId = await readColumn(connection, 'PRESCRIPTION_ITEMS', 'medicine_id');
    if (!medicineId || !/^bigint(?:\(\d+\))?$/.test(medicineId.COLUMN_TYPE)) {
      throw new Error('Unexpected definition for PRESCRIPTION_ITEMS.medicine_id.');
    }
    if (medicineId.IS_NULLABLE === 'NO') {
      await connection.query('ALTER TABLE PRESCRIPTION_ITEMS MODIFY COLUMN medicine_id BIGINT NULL');
    }
    await ensureIndex(connection, 'INVENTORY_LOGS', 'idx_inv_rx_item', 'prescription_item_id');
    const [links] = await connection.query(`
      SELECT k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE
      FROM information_schema.KEY_COLUMN_USAGE k
      JOIN information_schema.REFERENTIAL_CONSTRAINTS r
        ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
       AND r.TABLE_NAME = k.TABLE_NAME AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
      WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'INVENTORY_LOGS' AND k.CONSTRAINT_NAME = 'fk_inv_rx_item'
    `);
    if (!links.length) {
      await connection.query(`ALTER TABLE INVENTORY_LOGS ADD CONSTRAINT fk_inv_rx_item
        FOREIGN KEY (prescription_item_id) REFERENCES PRESCRIPTION_ITEMS (item_id) ON DELETE SET NULL`);
    } else if (links.length !== 1 || links[0].COLUMN_NAME !== 'prescription_item_id' ||
        links[0].REFERENCED_TABLE_NAME !== 'PRESCRIPTION_ITEMS' || links[0].REFERENCED_COLUMN_NAME !== 'item_id' ||
        links[0].DELETE_RULE !== 'SET NULL') {
      throw new Error('Unexpected definition for INVENTORY_LOGS.fk_inv_rx_item.');
    }
    await ensureEnum(connection, 'AUDIT_LOGS', 'action', ['LOGIN', 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'SIGN', 'REVOKE']);
    await ensureEnum(connection, 'MEDICAL_CLEARANCES', 'status', ['pending', 'approved', 'rejected', 'expired', 'revoked'], 'approved');
  },
  async data(connection, { initializePrescribedQuantity }) {
    if (typeof initializePrescribedQuantity !== 'boolean') throw new Error('Missing prescription backfill decision.');
    await connection.query(
      'UPDATE PRESCRIPTIONS SET expires_at = DATE(DATE_ADD(issued_at, INTERVAL 30 DAY)) WHERE expires_at IS NULL',
    );
    if (initializePrescribedQuantity) {
      await connection.query(`UPDATE PRESCRIPTION_ITEMS SET quantity_prescribed = quantity_dispensed
        WHERE quantity_prescribed = 1 AND quantity_dispensed > 1`);
    }
  },
};

