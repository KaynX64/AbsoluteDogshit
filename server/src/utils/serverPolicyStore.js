import { pool } from '../db.js';
import { activateServerPolicy, makeServerPolicy, validatePolicyOverrides } from '../config/serverPolicy.js';
import { logAudit } from './auditLogger.js';

export async function readServerPolicy(connection, lock = '', allowMissing = false) {
  const [[row]] = await connection.query(`SELECT revision, overrides FROM SERVER_POLICY WHERE policy_id = 1 ${lock}`);
  if (!row && allowMissing) return null;
  if (!row) throw new Error('Server policy row is missing.');
  const overrides = (typeof row.overrides === 'string' ? JSON.parse(row.overrides) : row.overrides) ?? {};
  const { values, errors } = validatePolicyOverrides(overrides);
  if (Object.keys(errors).length) throw new Error('Stored server policy is invalid.');
  return makeServerPolicy(row.revision, values);
}

export async function loadServerPolicy() {
  let saved;
  try {
    saved = await readServerPolicy(pool, '', true);
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    await pool.query(`CREATE TABLE IF NOT EXISTS SERVER_POLICY (
      policy_id TINYINT UNSIGNED NOT NULL PRIMARY KEY CHECK (policy_id = 1),
      revision INT UNSIGNED NOT NULL DEFAULT 0,
      overrides JSON NOT NULL
    ) ENGINE=InnoDB`);
  }
  if (!saved) {
    await pool.query('INSERT IGNORE INTO SERVER_POLICY (policy_id, overrides) VALUES (1, JSON_OBJECT())');
    saved = await readServerPolicy(pool);
  }
  activateServerPolicy(saved);
}

export async function saveServerPolicy(version, overrides, userId, ipAddress) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const previous = await readServerPolicy(connection, 'FOR UPDATE');
    if (previous.version !== version) {
      await connection.rollback();
      return null;
    }
    const next = makeServerPolicy(version + 1, overrides);
    await connection.query('UPDATE SERVER_POLICY SET revision = ?, overrides = ? WHERE policy_id = 1',
      [next.version, JSON.stringify(next.overrides)]);
    await logAudit(connection, {
      userId, action: 'UPDATE', table: 'SERVER_POLICY', recordId: 1,
      oldValue: { version, values: previous.values, overrides: previous.overrides },
      newValue: { version: next.version, values: next.values, overrides: next.overrides }, ipAddress,
    });
    await connection.commit();
    activateServerPolicy(next);
    return next;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
