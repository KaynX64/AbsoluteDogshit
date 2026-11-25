// Appends audit entries at the end of the caller's transaction.
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { recordLoadTiming } from '../bootstrap/loadMetrics.js';

export function logAudit(connection, entry) {
  return logAuditBatch(connection, [entry]);
}

export async function logAuditBatch(connection, entries) {
  if (!entries.length) return;
  const prepared = entries.map(entry => ({ ...entry,
    oldJson: entry.oldValue ? JSON.stringify(entry.oldValue) : null,
    newJson: entry.newValue ? JSON.stringify(entry.newValue) : null,
  }));
  const actors = [...new Set(prepared.flatMap(({ userId }) => userId == null ? [] : [userId]))];
  if (actors.length) await connection.query('SELECT user_id FROM USERS FORCE INDEX (PRIMARY) WHERE user_id IN (?) ORDER BY user_id FOR SHARE', [actors]);

  const waiting = performance.now();
  const [[head]] = await connection.query('SELECT last_entry_hash FROM AUDIT_CHAIN_STATE WHERE chain_id = 1 FOR UPDATE');
  recordLoadTiming('auditLock', performance.now() - waiting);
  if (!head) throw new Error('Audit chain state is missing.');

  let previous = head.last_entry_hash;
  let id;
  for (const { userId, action, table, recordId, oldJson, newJson, ipAddress } of prepared) {
    const payload = `${previous}${action}${table}${recordId}${oldJson || ''}${newJson || ''}`;
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const [result] = await connection.query(
      `INSERT INTO AUDIT_LOGS
       (user_id, action, table_affected, record_id, old_value, new_value, ip_address, prev_hash, entry_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, action, table, recordId, oldJson, newJson, ipAddress || 'Unknown', previous, hash],
    );
    id = result.insertId;
    previous = hash;
  }
  await connection.query('UPDATE AUDIT_CHAIN_STATE SET last_audit_id = ?, last_entry_hash = ? WHERE chain_id = 1', [id, previous]);
}
