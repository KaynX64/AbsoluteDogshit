// Adds qualified responder eligibility and backfills legacy accounts when needed.

import { ensureColumns, ensureIndex, readColumn } from './schema.js';

export default {
  version: 3,
  name: 'qualified responder eligibility',
  async prepare(connection) {
    return { backfill: !(await readColumn(connection, 'USERS', 'is_qualified_responder')) };
  },
  async schema(connection) {
    await ensureColumns(connection, [
      { table: 'USERS', column: 'is_qualified_responder', type: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { table: 'USERS', column: 'qualified_responder_since', type: 'TIMESTAMP NULL DEFAULT NULL' },
      { table: 'USERS', column: 'qualified_responder_note', type: 'VARCHAR(150) NULL' },
    ]);
    await ensureIndex(connection, 'USERS', 'idx_users_qualified_responder', 'is_qualified_responder');
  },
  async data(connection, { backfill }) {
    if (typeof backfill !== 'boolean') throw new Error('Missing responder backfill decision.');
    if (!backfill) return;
    await connection.query(`
      UPDATE USERS u
      SET u.is_qualified_responder = 1,
          u.qualified_responder_since = CURRENT_TIMESTAMP,
          u.qualified_responder_note = 'Migrated from EMERGENCY_RESPONDER role'
      WHERE u.is_qualified_responder = 0
        AND EXISTS (
          SELECT 1 FROM USER_ROLES ur
          INNER JOIN ROLES r ON ur.role_id = r.role_id
          WHERE ur.user_id = u.user_id AND r.code = 'EMERGENCY_RESPONDER'
        )
    `);
  },
};
