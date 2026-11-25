export const auditStateSql = `CREATE TABLE IF NOT EXISTS AUDIT_CHAIN_STATE (
  chain_id TINYINT UNSIGNED PRIMARY KEY CHECK (chain_id = 1),
  last_audit_id BIGINT NULL,
  last_entry_hash VARCHAR(64) NOT NULL
) ENGINE=InnoDB`;

export const emptyAuditHash = '0'.repeat(64);

export async function verifyAuditHead(connection) {
  const [[head]] = await connection.query(`
    SELECT CAST(s.last_audit_id AS CHAR) AS lastId, s.last_entry_hash AS lastHash,
           CAST(a.audit_id AS CHAR) AS tailId, a.entry_hash AS tailHash
    FROM AUDIT_CHAIN_STATE s
    LEFT JOIN (SELECT audit_id, entry_hash FROM AUDIT_LOGS ORDER BY audit_id DESC LIMIT 1) a ON TRUE
    WHERE s.chain_id = 1`);
  if (!head || head.lastId !== head.tailId || head.lastHash !== (head.tailHash ?? emptyAuditHash)) {
    throw Object.assign(new Error('Audit chain state disagrees with the ledger. Stop audit writers and verify the cutover.'),
      { code: 'AUDIT_CHAIN_HEAD_MISMATCH' });
  }
}

export default {
  version: 16,
  name: 'Single-row audit chain state',
  async schema(connection) { await connection.query(auditStateSql); },
  async data(connection) {
    const [[tail]] = await connection.query('SELECT CAST(audit_id AS CHAR) AS id, entry_hash AS hash FROM AUDIT_LOGS ORDER BY audit_id DESC LIMIT 1');
    await connection.query('INSERT IGNORE INTO AUDIT_CHAIN_STATE (chain_id, last_audit_id, last_entry_hash) VALUES (1, ?, ?)',
      [tail?.id ?? null, tail?.hash ?? emptyAuditHash]);
    await verifyAuditHead(connection);
  },
};
