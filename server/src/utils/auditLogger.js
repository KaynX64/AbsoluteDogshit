import crypto from 'crypto';

export async function logAudit(connection, { userId, action, table, recordId, oldValue, newValue, ipAddress }) {
  // 1. Lock and fetch the most recent hash to prevent branching in concurrent requests
  const [lastLog] = await connection.query(
    'SELECT entry_hash FROM AUDIT_LOGS ORDER BY audit_id DESC LIMIT 1 FOR SHARE'
  );
  
  // Fallback to 64 zeros if the Genesis block is somehow missing
  const prevHash = lastLog.length > 0 ? lastLog[0].entry_hash : '0'.repeat(64);

  // 2. Prepare JSON representations of the data changes
  const oldValStr = oldValue ? JSON.stringify(oldValue) : null;
  const newValStr = newValue ? JSON.stringify(newValue) : null;

  // 3. Generate the cryptographic signature for RA 10173 tamper-proofing
  const payload = `${prevHash}${action}${table}${recordId}${oldValStr || ''}${newValStr || ''}`;
  const entryHash = crypto.createHash('sha256').update(payload).digest('hex');

  // 4. Insert the immutable log into the chain
  await connection.query(
    `INSERT INTO AUDIT_LOGS 
     (user_id, action, table_affected, record_id, old_value, new_value, ip_address, prev_hash, entry_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, action, table, recordId, oldValStr, newValStr, ipAddress || 'Unknown', prevHash, entryHash]
  );
}