// Receives, deducts, and adjusts medicine lots and writes their stock ledger entries.

import { inTransaction } from '../db/transaction.js';
import { logAudit } from '../utils/auditLogger.js';
import { fail } from '../utils/httpError.js';

export function receiveStock({ medicine_id, batch_no, manufacture_date, expiry_date, supplier, quantity_received, userId, ipAddress }) {
  return inTransaction(async connection => {
    const [medRows] = await connection.query(
      'SELECT name FROM MEDICINES WHERE medicine_id = ? AND deleted_at IS NULL FOR UPDATE',
      [medicine_id]
    );
    if (medRows.length === 0) throw fail('Medicine not found in master formulary.');

    const [existingBatch] = await connection.query(
      'SELECT batch_id, quantity_on_hand FROM MEDICINE_BATCHES WHERE medicine_id = ? AND batch_no = ? AND deleted_at IS NULL FOR UPDATE',
      [medicine_id, batch_no]
    );

    let targetBatchId;
    let newQty;

    if (existingBatch.length > 0) {
      targetBatchId = existingBatch[0].batch_id;
      newQty = existingBatch[0].quantity_on_hand + Number(quantity_received);

      await connection.query(
        'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ?, supplier = ? WHERE batch_id = ?',
        [newQty, supplier || null, targetBatchId]
      );
    } else {
      const [batchResult] = await connection.query(
        `INSERT INTO MEDICINE_BATCHES 
         (medicine_id, batch_no, manufacture_date, expiry_date, supplier, quantity_on_hand)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [medicine_id, batch_no, manufacture_date, expiry_date, supplier || 'PSU Central Depot', Number(quantity_received)]
      );
      targetBatchId = batchResult.insertId;
      newQty = Number(quantity_received);
    }

    await connection.query(
      `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
       VALUES (?, ?, 'receive', ?, ?)`,
      [targetBatchId, Number(quantity_received), `Shipment received from ${supplier || 'Depot'}`, userId]
    );

    await logAudit(connection, {
      userId: userId,
      action: 'CREATE',
      table: 'MEDICINE_BATCHES',
      recordId: targetBatchId,
      oldValue: null,
      newValue: {
        medicine: medRows[0].name,
        batch_no,
        quantity_received: Number(quantity_received),
        new_total_stock: newQty,
        supplier,
      },
      ipAddress: ipAddress,
    });
    return { targetBatchId, newQty };
  });
}

export function deductStock({ batch_id, quantity_deducted, reason, userId, ipAddress }) {
  return inTransaction(async connection => {
    const [batchRows] = await connection.query(
      'SELECT quantity_on_hand, batch_no, expiry_date, DATEDIFF(expiry_date, CURDATE()) as days_until_expiry FROM MEDICINE_BATCHES WHERE batch_id = ? AND deleted_at IS NULL FOR UPDATE',
      [batch_id]
    );

    if (batchRows.length === 0) throw fail('Medicine batch not found.');

    if (batchRows[0].days_until_expiry < 0) {
      const expStr = new Date(batchRows[0].expiry_date).toISOString().split('T')[0];
      throw fail(
        `Cannot dispense expired medication: Lot "${batchRows[0].batch_no}" expired on ${expStr}. Please quarantine or dispose of this lot via Adjust & Dispose.`
      );
    }

    const oldQuantity = batchRows[0].quantity_on_hand;
    if (oldQuantity < Number(quantity_deducted)) {
      throw fail(`Insufficient stock. Batch ${batchRows[0].batch_no} only has ${oldQuantity} units left.`);
    }

    const newQuantity = oldQuantity - Number(quantity_deducted);

    await connection.query(
      'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?',
      [newQuantity, batch_id]
    );

    await connection.query(
      `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
       VALUES (?, ?, 'dispense', ?, ?)`,
      [batch_id, -Number(quantity_deducted), reason || 'Manual dispensation', userId]
    );

    await logAudit(connection, {
      userId: userId,
      action: 'UPDATE',
      table: 'MEDICINE_BATCHES',
      recordId: batch_id,
      oldValue: { quantity_on_hand: oldQuantity },
      newValue: { quantity_on_hand: newQuantity },
      ipAddress: ipAddress,
    });
    return newQuantity;
  });
}

export function adjustStock({ batch_id, quantity_removed, transaction_type, reason, userId, ipAddress }) {
  return inTransaction(async connection => {
    const [batchRows] = await connection.query(
      'SELECT quantity_on_hand, batch_no FROM MEDICINE_BATCHES WHERE batch_id = ? AND deleted_at IS NULL FOR UPDATE',
      [batch_id]
    );

    if (batchRows.length === 0) throw fail('Medicine batch not found.');

    const oldQty = batchRows[0].quantity_on_hand;
    if (oldQty < Number(quantity_removed)) {
      throw fail(`Cannot discard ${quantity_removed} units; lot only has ${oldQty} units.`);
    }

    const newQty = oldQty - Number(quantity_removed);

    await connection.query('UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?', [newQty, batch_id]);

    await connection.query(
      `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [batch_id, -Number(quantity_removed), transaction_type, reason || 'Disposal of spoiled/expired drugs', userId]
    );

    await logAudit(connection, {
      userId: userId,
      action: 'UPDATE',
      table: 'MEDICINE_BATCHES',
      recordId: batch_id,
      oldValue: { quantity_on_hand: oldQty },
      newValue: { quantity_on_hand: newQty, transaction_type, reason },
      ipAddress: ipAddress,
    });
    return newQty;
  });
}
