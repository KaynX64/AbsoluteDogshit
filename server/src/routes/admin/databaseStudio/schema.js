import { pool } from '../../../db/pool.js';
import { fail } from '../../../utils/dbStudioGuard.js';

export async function getWhitelistedTables() {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME as tableName, TABLE_ROWS as estimatedRows
   FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND UPPER(TABLE_NAME) NOT IN ('SERVER_POLICY', 'QUEUE_TICKET_COUNTERS', 'SCHEMA_MIGRATIONS')
   ORDER BY TABLE_NAME ASC`
  );
  return rows;
}

export async function getTableColumns(connection, tableName) {
  const [cols] = await connection.query(
    `SELECT COLUMN_NAME AS name, COLUMN_KEY AS columnKey
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  if (cols.length === 0) throw fail('Table does not exist.', 404);
  return {
    names: new Set(cols.map((c) => c.name)),
    pk: cols.filter((c) => c.columnKey === 'PRI').map((c) => c.name),
  };
}
