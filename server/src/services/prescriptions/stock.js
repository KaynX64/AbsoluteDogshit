import { logAudit } from '../../utils/auditLogger.js';

export async function planStock(connection, requestedByMedicine) {
  // ── FEFO Verification & Batch Allocation ────────────────────────────────
  const plannedDeductions = [];

  for (const [medIdStr, qtyNeeded] of Object.entries(requestedByMedicine)) {
    const medId = Number(medIdStr);

    const [medRows] = await connection.query(
      'SELECT medicine_id, name, generic_name, is_active FROM MEDICINES WHERE medicine_id = ? AND deleted_at IS NULL',
      [medId]
    );

    if (medRows.length === 0) {
      throw new Error(`Medicine #${medId} not found in the master formulary.`);
    }
    if (!Boolean(medRows[0].is_active)) {
      throw new Error(`Medicine "${medRows[0].name}" is currently deactivated in the formulary.`);
    }

    const medName = medRows[0].name;
    const genericName = medRows[0].generic_name;

    // Query active, unexpired batches ordered by earliest expiry (FEFO)
    const [batches] = await connection.query(
      `SELECT batch_id, batch_no, quantity_on_hand, expiry_date
         FROM MEDICINE_BATCHES
         WHERE medicine_id = ?
           AND deleted_at IS NULL
           AND expiry_date > CURDATE()
           AND quantity_on_hand > 0
         ORDER BY expiry_date ASC, batch_id ASC
         FOR UPDATE`,
      [medId]
    );

    const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity_on_hand), 0);

    if (totalAvailable < qtyNeeded) {
      const stockErr = new Error(
        `Insufficient unexpired stock for "${medName} (${genericName})". ` +
        `Requested: ${qtyNeeded}, Available in pharmacy: ${totalAvailable}.`
      );
      stockErr.code = 'INSUFFICIENT_STOCK';
      stockErr.medicine = medName;
      stockErr.available = totalAvailable;
      stockErr.requested = qtyNeeded;
      throw stockErr;
    }

    // Allocate across earliest-expiring batches
    let rem = qtyNeeded;
    for (const batch of batches) {
      if (rem <= 0) break;
      const take = Math.min(Number(batch.quantity_on_hand), rem);
      plannedDeductions.push({
        medicine_id: medId,
        medicine_name: medName,
        generic_name: genericName,
        batch_id: batch.batch_id,
        batch_no: batch.batch_no,
        expiry_date: batch.expiry_date,
        deducted_qty: take,
        old_qty: Number(batch.quantity_on_hand),
        new_qty: Number(batch.quantity_on_hand) - take,
      });
      rem -= take;
    }
  }
  return plannedDeductions;
}

export async function applyStockDeductions(connection, { plannedDeductions, formularyDispenseLines, prescriptionId, doctorUserId, ipAddress }) {
  // ── Execute planned FEFO stock deductions & write inventory logs ────────
  for (const d of plannedDeductions) {
    await connection.query(
      'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?',
      [d.new_qty, d.batch_id]
    );

    let qtyToLink = d.deducted_qty;
    const itemAllocations = [];
    for (const line of formularyDispenseLines) {
      if (line.medicine_id !== Number(d.medicine_id) || line.quantity_to_link <= 0) continue;
      const itemQty = Math.min(line.quantity_to_link, qtyToLink);
      if (itemQty > 0) {
        itemAllocations.push({ prescription_item_id: line.prescription_item_id, quantity: itemQty });
        line.quantity_to_link -= itemQty;
        qtyToLink -= itemQty;
      }
      if (qtyToLink === 0) break;
    }
    if (qtyToLink !== 0 || itemAllocations.some((allocation) => !allocation.prescription_item_id)) {
      throw new Error('Unable to link inventory deduction to its prescription item.');
    }

    for (const allocation of itemAllocations) {
      await connection.query(
        `INSERT INTO INVENTORY_LOGS
           (batch_id, prescription_item_id, quantity_change, transaction_type, reason, performed_by)
           VALUES (?, ?, ?, 'dispense', ?, ?)`,
        [
          d.batch_id,
          allocation.prescription_item_id,
          -allocation.quantity,
          `Automated FEFO dispense for Prescription #${prescriptionId} (${d.medicine_name}, Lot ${d.batch_no})`,
          doctorUserId,
        ]
      );
    }

    await logAudit(connection, {
      userId: doctorUserId,
      action: 'UPDATE',
      table: 'MEDICINE_BATCHES',
      recordId: d.batch_id,
      oldValue: { quantity_on_hand: d.old_qty },
      newValue: {
        quantity_on_hand: d.new_qty,
        prescription_id: prescriptionId,
        batch_no: d.batch_no,
        deducted: d.deducted_qty,
      },
      ipAddress,
    });
  }
  if (formularyDispenseLines.some((line) => line.quantity_to_link !== 0)) {
    throw new Error('Prescription item quantities do not match the planned inventory deductions.');
  }
}
