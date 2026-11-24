// Discovers allowed tables and reads column and primary-key metadata for Database Studio.

import { pool } from '../../../db/pool.js';
import { fail } from '../../../utils/httpError.js';

// Read the approved table names and their estimated row counts.
export async function getWhitelistedTables() {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME as tableName, TABLE_ROWS as estimatedRows
   FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND UPPER(TABLE_NAME) NOT LIKE 'RESPONDER\_%' AND UPPER(TABLE_NAME) NOT IN ('SERVER_POLICY', 'QUEUE_TICKET_COUNTERS', 'SCHEMA_MIGRATIONS')
   ORDER BY TABLE_NAME ASC`
  );
  return rows;
}

// Load column and primary key metadata for the requested table.
export async function getTableColumns(connection, tableName) {
  const [cols] = await connection.query(
    `SELECT COLUMN_NAME AS name, COLUMN_KEY AS columnKey
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  if (cols.length === 0) throw fail('Table does not exist.', 404);
  return {
    names: new Set(cols.map(/* Extract the column names allowed in writes. */ (c) => c.name)),
    pk: cols.filter(/* Select the columns marked as part of the primary key. */ (c) => c.columnKey === 'PRI').map(/* Extract a primary key column name for lookup and validation. */ (c) => c.name),
  };
}
