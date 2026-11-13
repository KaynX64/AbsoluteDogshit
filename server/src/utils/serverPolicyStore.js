import { pool } from '../db/pool.js';
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
  activateServerPolicy(await readServerPolicy(pool));
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
