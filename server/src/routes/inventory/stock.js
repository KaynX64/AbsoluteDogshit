import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';

export function registerInventoryStock(router, io) {
  // =============================================================================
  // 4. MANUAL DEDUCTION & STOCK ADJUSTMENT
  // =============================================================================

  router.post('/deduct', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
    const { batch_id, quantity_deducted, reason } = req.body;

    if (!Number.isInteger(Number(quantity_deducted)) || Number(quantity_deducted) <= 0) {
      return res.status(400).json({ error: 'Quantity deducted must be a positive integer.' });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [batchRows] = await connection.query(
        'SELECT quantity_on_hand, batch_no, expiry_date, DATEDIFF(expiry_date, CURDATE()) as days_until_expiry FROM MEDICINE_BATCHES WHERE batch_id = ? FOR UPDATE',
        [batch_id]
      );

      if (batchRows.length === 0) throw new Error('Medicine batch not found.');

      if (batchRows[0].days_until_expiry < 0) {
        const expStr = new Date(batchRows[0].expiry_date).toISOString().split('T')[0];
        throw new Error(
          `Cannot dispense expired medication: Lot "${batchRows[0].batch_no}" expired on ${expStr}. Please quarantine or dispose of this lot via Adjust & Dispose.`
        );
      }

      const oldQuantity = batchRows[0].quantity_on_hand;
      if (oldQuantity < Number(quantity_deducted)) {
        throw new Error(`Insufficient stock. Batch ${batchRows[0].batch_no} only has ${oldQuantity} units left.`);
      }

      const newQuantity = oldQuantity - Number(quantity_deducted);

      await connection.query(
        'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?',
        [newQuantity, batch_id]
      );

      await connection.query(
        `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
         VALUES (?, ?, 'dispense', ?, ?)`,
        [batch_id, -Number(quantity_deducted), reason || 'Manual dispensation', req.user.user_id]
      );

      await logAudit(connection, {
        userId: req.user.user_id,
        action: 'UPDATE',
        table: 'MEDICINE_BATCHES',
        recordId: batch_id,
        oldValue: { quantity_on_hand: oldQuantity },
        newValue: { quantity_on_hand: newQuantity },
        ipAddress: req.ip,
      });

      await connection.commit();

      if (io) io.emit('inventory:updated');

      res.json({ message: 'Stock successfully deducted and logged.', remainingStock: newQuantity });
    } catch (error) {
      await connection.rollback();
      res.status(400).json({ error: error.message });
    } finally {
      connection.release();
    }
  });

  router.post('/adjust', authenticateToken, requireRoles('NURSE', 'ADMIN'), async (req, res) => {
    const { batch_id, quantity_removed, transaction_type, reason } = req.body;
    const validTypes = ['dispose', 'adjust', 'recall', 'return'];

    if (!validTypes.includes(transaction_type)) {
      return res.status(400).json({ error: `transaction_type must be one of: ${validTypes.join(', ')}` });
    }

    if (!Number.isInteger(Number(quantity_removed)) || Number(quantity_removed) <= 0) {
      return res.status(400).json({ error: 'Quantity removed must be a positive integer.' });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [batchRows] = await connection.query(
        'SELECT quantity_on_hand, batch_no FROM MEDICINE_BATCHES WHERE batch_id = ? FOR UPDATE',
        [batch_id]
      );

      if (batchRows.length === 0) throw new Error('Medicine batch not found.');

      const oldQty = batchRows[0].quantity_on_hand;
      if (oldQty < Number(quantity_removed)) {
        throw new Error(`Cannot discard ${quantity_removed} units; lot only has ${oldQty} units.`);
      }

      const newQty = oldQty - Number(quantity_removed);

      await connection.query('UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?', [newQty, batch_id]);

      await connection.query(
        `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
         VALUES (?, ?, ?, ?, ?)`,
        [batch_id, -Number(quantity_removed), transaction_type, reason || 'Disposal of spoiled/expired drugs', req.user.user_id]
      );

      await logAudit(connection, {
        userId: req.user.user_id,
        action: 'UPDATE',
        table: 'MEDICINE_BATCHES',
        recordId: batch_id,
        oldValue: { quantity_on_hand: oldQty },
        newValue: { quantity_on_hand: newQty, transaction_type, reason },
        ipAddress: req.ip,
      });

      await connection.commit();

      if (io) io.emit('inventory:updated');

      res.json({
        message: `Adjustment logged. ${quantity_removed} units marked as '${transaction_type}'. Remaining: ${newQty}.`,
        remainingStock: newQty,
      });
    } catch (error) {
      await connection.rollback();
      res.status(400).json({ error: error.message });
    } finally {
      connection.release();
    }
  });
}
