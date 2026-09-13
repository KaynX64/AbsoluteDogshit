// server/src/routes/inventory.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';

const router = express.Router();

// POST /api/inventory/deduct - Deduct stock from a specific batch
router.post('/deduct', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  const { batch_id, quantity_deducted, reason } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock the batch row and check current stock levels
    const [batchRows] = await connection.query(
      'SELECT quantity_on_hand FROM MEDICINE_BATCHES WHERE batch_id = ? FOR UPDATE',
      [batch_id]
    );

    if (batchRows.length === 0) {
      throw new Error('Medicine batch not found.');
    }
    if (batchRows[0].quantity_on_hand < quantity_deducted) {
      throw new Error('Insufficient stock in this batch to complete dispensation.');
    }

    // 2. Deduct the quantity from the batch
    await connection.query(
      'UPDATE MEDICINE_BATCHES SET quantity_on_hand = quantity_on_hand - ? WHERE batch_id = ?',
      [quantity_deducted, batch_id]
    );

    // 3. Append an immutable record to the inventory audit trail
    await connection.query(
      `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
       VALUES (?, ?, 'dispense', ?, ?)`,
      [batch_id, -quantity_deducted, reason || 'Prescription issuance', req.user.user_id]
    );

    await connection.commit();
    res.json({ message: 'Stock successfully deducted and logged.' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
});

export default router;