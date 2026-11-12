export async function readColumn(connection, table, column) {
  const [[field]] = await connection.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE, EXTRA FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return field;
}

const normalizeType = value => value.toLowerCase()
  .replace(/\b(tinyint|smallint|mediumint|int|bigint)\(\d+\)/g, '$1')
  .replace(/,\s+/g, ',');

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

export async function ensureEnum(connection, table, column, values, defaultValue) {
  const field = await readColumn(connection, table, column);
  const actual = field?.COLUMN_TYPE.match(/^enum\((.*)\)$/i)?.[1];
  const existing = actual && [...actual.matchAll(/'([^']+)'/g)].map(match => match[1]);
  if (!existing?.length || field.IS_NULLABLE !== 'NO' || existing.some(value => !values.includes(value))) {
    throw new Error('Unexpected definition for ' + table + '.' + column + '.');
  }
  if (existing.length === values.length) return;
  const enumValues = values.map(value => "'" + value + "'").join(', ');
  const defaultClause = defaultValue ? " DEFAULT '" + defaultValue + "'" : '';
  await connection.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ENUM(${enumValues}) NOT NULL${defaultClause}`);
}

export async function ensureIndex(connection, table, index, column) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     ORDER BY SEQ_IN_INDEX`,
    [table, index],
  );
  if (!rows.length) {
    await connection.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (\`${column}\`)`);
  } else if (rows.length !== 1 || rows[0].COLUMN_NAME !== column) {
    throw new Error('Unexpected definition for ' + table + '.' + index + '.');
  }
}
