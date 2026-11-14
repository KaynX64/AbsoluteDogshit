import { inTransaction } from '../../db/transaction.js';
import { logAudit } from '../../utils/auditLogger.js';

export function expireDuePrescriptions() {
  return inTransaction(async connection => {
    const [expired] = await connection.query(
      `SELECT p.prescription_id
         FROM PRESCRIPTIONS p
         WHERE p.status = 'active'
           AND p.deleted_at IS NULL
           AND (
             SELECT MAX(DATE_ADD(p.issued_at, INTERVAL pi.duration_days DAY))
             FROM PRESCRIPTION_ITEMS pi
             WHERE pi.prescription_id = p.prescription_id
           ) < NOW()
         ORDER BY p.prescription_id
         FOR UPDATE SKIP LOCKED`,
    );
    const ids = expired.map(row => row.prescription_id);

    if (ids.length) {
      const [result] = await connection.query(
        `UPDATE PRESCRIPTIONS SET status = 'expired'
         WHERE prescription_id IN (?) AND status = 'active' AND deleted_at IS NULL`,
        [ids],
      );
      if (result.affectedRows !== ids.length) throw new Error('Expiry update did not match the locked prescriptions.');

      await logAudit(connection, {
        userId: null,
        action: 'UPDATE',
        table: 'PRESCRIPTIONS',
        recordId: 0,
        oldValue: null,
        newValue: { operation: 'AUTO_EXPIRE_PRESCRIPTIONS', count: ids.length, prescription_ids: ids },
        ipAddress: 'system',
      });
    }

    return ids;
  });
}
