import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';

export function registerInventoryReceiving(router, io) {
  // =============================================================================
  // 2. INBOUND & STOCK REPLENISHMENT
  // =============================================================================

  router.post('/receive', authenticateToken, requireRoles('NURSE', 'ADMIN'), async (req, res) => {
    const { medicine_id, batch_no, manufacture_date, expiry_date, supplier, quantity_received } = req.body;

    if (!medicine_id || !batch_no || !manufacture_date || !expiry_date || !quantity_received) {
      return res.status(400).json({
        error: 'medicine_id, batch_no, manufacture_date, expiry_date, and quantity_received are required.',
      });
    }

    if (!Number.isInteger(Number(quantity_received)) || Number(quantity_received) <= 0) {
      return res.status(400).json({ error: 'Quantity received must be a positive integer.' });
    }

    if (new Date(expiry_date) <= new Date(manufacture_date)) {
      return res.status(400).json({ error: 'Expiry date must be later than manufacture date.' });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [medRows] = await connection.query(
        'SELECT name FROM MEDICINES WHERE medicine_id = ? AND deleted_at IS NULL',
        [medicine_id]
      );
      if (medRows.length === 0) throw new Error('Medicine not found in master formulary.');

      const [existingBatch] = await connection.query(
        'SELECT batch_id, quantity_on_hand FROM MEDICINE_BATCHES WHERE medicine_id = ? AND batch_no = ? FOR UPDATE',
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
        [targetBatchId, Number(quantity_received), `Shipment received from ${supplier || 'Depot'}`, req.user.user_id]
      );

      await logAudit(connection, {
        userId: req.user.user_id,
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
        ipAddress: req.ip,
      });

      await connection.commit();

      if (io) io.emit('inventory:updated');

      res.status(201).json({
        message: `Stock successfully logged. Batch ${batch_no} now has ${newQty} units.`,
        batchId: targetBatchId,
        quantityOnHand: newQty,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Stock-in error:', error);
      res.status(400).json({ error: error.message || 'Failed to process shipment intake.' });
    } finally {
      connection.release();
    }
  });
}
