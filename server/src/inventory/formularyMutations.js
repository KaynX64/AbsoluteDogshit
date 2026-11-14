// Creates and archives medicine catalog entries with transactional auditing.

import { inTransaction } from '../db/transaction.js';
import { logAudit } from '../utils/auditLogger.js';
import { fail } from '../utils/httpError.js';

export function createMedicine({ name, generic_name, form, strength, unit, reorder_level, userId, ipAddress }) {
  return inTransaction(async connection => {
    const [result] = await connection.query(
      `INSERT INTO MEDICINES (name, generic_name, form, strength, unit, reorder_level)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, generic_name, form, strength, unit || 'pcs', reorder_level]
    );

    const medicineId = result.insertId;

    await logAudit(connection, {
      userId: userId,
      action: 'CREATE',
      table: 'MEDICINES',
      recordId: medicineId,
      oldValue: null,
      newValue: { name, generic_name, form, strength, reorder_level },
      ipAddress,
    });
    return medicineId;
  });
}

export function archiveMedicine({ medicineId, userId, ipAddress }) {
  return inTransaction(async connection => {
    const [medRows] = await connection.query(
      'SELECT name, generic_name, strength FROM MEDICINES WHERE medicine_id = ? AND deleted_at IS NULL FOR UPDATE',
      [medicineId]
    );

    if (medRows.length === 0) {
      throw fail('Medicine definition not found or already deleted.');
    }

    const [activeBatches] = await connection.query(
      'SELECT COALESCE(SUM(quantity_on_hand), 0) as total_stock FROM MEDICINE_BATCHES WHERE medicine_id = ? AND deleted_at IS NULL AND quantity_on_hand > 0',
      [medicineId]
    );

    const stockRemaining = activeBatches[0]?.total_stock || 0;
    if (stockRemaining > 0) {
      throw fail(
        `Cannot delete "${medRows[0].name}". There are still ${stockRemaining} units in active stock. Dispose or dispense the stock before deleting this formulary entry.`
      );
    }

    await connection.query(
      'UPDATE MEDICINES SET is_active = FALSE, deleted_at = CURRENT_TIMESTAMP WHERE medicine_id = ?',
      [medicineId]
    );

    await connection.query(
      'UPDATE MEDICINE_BATCHES SET deleted_at = CURRENT_TIMESTAMP WHERE medicine_id = ?',
      [medicineId]
    );

    await logAudit(connection, {
      userId: userId,
      action: 'DELETE',
      table: 'MEDICINES',
      recordId: medicineId,
      oldValue: medRows[0],
      newValue: { operation: 'FORMULARY_DELETED', is_active: false },
      ipAddress,
    });
    return medRows[0];
  });
}
