// Cancels a prescription and restores associated stock in the same transaction.

import { inTransaction } from '../../db/transaction.js';
import { restorePrescriptionStock } from '../../inventory/prescriptionStock.js';
import { logAudit } from '../../utils/auditLogger.js';
import { encrypt, decrypt } from '../../utils/cryptoVault.js';
import { fail } from '../../utils/httpError.js';

export function cancelPrescription({ prescriptionId, reason, user, ipAddress }) {
  return inTransaction(async connection => {
    const [rows] = await connection.query(
      'SELECT doctor_user_id, status, notes FROM PRESCRIPTIONS WHERE prescription_id = ? AND deleted_at IS NULL FOR UPDATE',
      [prescriptionId]
    );

    if (rows.length === 0) {
      throw fail('Prescription not found.', 404);
    }

    const rx = rows[0];

    if (rx.status !== 'active') {
      throw Object.assign(fail(`Cannot cancel a prescription with status "${rx.status}".`, 409), {
        code: 'INVALID_STATE', currentStatus: rx.status,
      });
    }

    const isIssuer = Number(rx.doctor_user_id) === Number(user.user_id);
    const isAdmin = (user.roles || []).includes('ADMIN');
    if (!isIssuer && !isAdmin) {
      throw fail('Only the issuing practitioner or an administrator may cancel this prescription.', 403);
    }

    const cancellationNote = `\n[CANCELLED ${new Date().toISOString()}] ${reason || 'Cancelled by practitioner'}`;
    // notes is AES-encrypted at rest: decrypt, append, re-encrypt. A raw SQL
    // CONCAT corrupts the ciphertext and makes the notes undecryptable.
    const existingNotes = rx.notes ? decrypt(rx.notes) : '';
    await connection.query(
      `UPDATE PRESCRIPTIONS
       SET status = 'cancelled',
           notes = ?
       WHERE prescription_id = ?`,
      [encrypt(existingNotes + cancellationNote), prescriptionId]
    );

    const restoredBatchCount = await restorePrescriptionStock(connection, {
      prescriptionId, userId: user.user_id, ipAddress,
    });

    await logAudit(connection, {
      userId: user.user_id,
      action: 'REVOKE',
      table: 'PRESCRIPTIONS',
      recordId: prescriptionId,
      oldValue: { status: 'active' },
      newValue: {
        status: 'cancelled',
        reason: reason || 'Cancelled by practitioner',
        cancelled_by_role: user.roles[0],
        cancelled_at: new Date().toISOString(),
        restored_batches_count: restoredBatchCount,
      },
      ipAddress: ipAddress,
    });
    return {
      message: `Prescription cancelled successfully and stock was returned from ${restoredBatchCount} medication batch(es).`,
      prescriptionId,
      status: 'cancelled',
    };
  });
}
