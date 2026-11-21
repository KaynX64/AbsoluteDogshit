// Provides schema inspection and conditional column, enum, and index helpers for migrations.

// Read column type and nullability from the current database's metadata.
export async function readColumn(connection, table, column) {
  const [[field]] = await connection.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE, EXTRA FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return field;
}

// Normalize type syntax for comparison across MySQL display formats.
const normalizeType = value => value.toLowerCase()
  .replace(/\b(tinyint|smallint|mediumint|int|bigint)\(\d+\)/g, '$1')
  .replace(/,\s+/g, ',');

// Add missing columns and validate compatible existing definitions.
export async function ensureColumns(connection, columns) {
  for (const { table, column, type, allowRequired = false } of columns) {
    const field = await readColumn(connection, table, column);
    if (!field) {
      await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`);
      continue;
    }
    const declaredType = type.match(/^\w+(?:\([^)]+\))?/)[0];
    const nullable = /\bNOT NULL\b/i.test(type) ? 'NO' : 'YES';
    if (normalizeType(field.COLUMN_TYPE) !== normalizeType(declaredType) ||
        (field.IS_NULLABLE !== nullable && !(allowRequired && field.IS_NULLABLE === 'NO')) ||
        (/GENERATED ALWAYS/i.test(type) && !field.EXTRA.includes('STORED GENERATED'))) {
      throw new Error('Unexpected definition for ' + table + '.' + column + '.');
    }
  }
}

// Check existing enum members before applying the required enum definition.
export async function ensureEnum(connection, table, column, values, defaultValue) {
  const field = await readColumn(connection, table, column);
  const actual = field?.COLUMN_TYPE.match(/^enum\((.*)\)$/i)?.[1];
  // Extract enum member names from the stored column type.
  const existing = actual && [...actual.matchAll(/'([^']+)'/g)].map(match => match[1]);
  if (!existing?.length || field.IS_NULLABLE !== 'NO' || existing.some(/* Check whether the proposed enum would remove an existing allowed value. */ value => !values.includes(value))) {
    throw new Error('Unexpected definition for ' + table + '.' + column + '.');
  }
  if (existing.length === values.length) return;
  // Quote each migration-provided enum value for DDL.
  const enumValues = values.map(value => "'" + value + "'").join(', ');
  const defaultClause = defaultValue ? " DEFAULT '" + defaultValue + "'" : '';
  await connection.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ENUM(${enumValues}) NOT NULL${defaultClause}`);
}

// Create an index when absent and validate the column order when it already exists.
export async function ensureIndex(connection, table, index, column) {
  const columns = Array.isArray(column) ? column : [column];
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     ORDER BY SEQ_IN_INDEX`,
    [table, index],
  );
  if (!rows.length) {
    // Add one identifier placeholder for each column in the index.
    await connection.query(`ALTER TABLE ?? ADD INDEX ?? (${columns.map(() => '??').join(', ')})`, [table, index, ...columns]);
  } else if (rows.length !== columns.length || rows.some(/* Compare each indexed column with its expected position. */ (row, i) => row.COLUMN_NAME !== columns[i])) {
    throw new Error('Unexpected definition for ' + table + '.' + index + '.');
  }
}
