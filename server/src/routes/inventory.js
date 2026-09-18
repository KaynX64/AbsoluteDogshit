// server/src/routes/inventory.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

// GET /api/inventory/batches - Fetch catalog for the UI viewer
router.get('/batches', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.batch_id, m.name, b.batch_no, b.quantity_on_hand, b.expiry_date 
       FROM MEDICINE_BATCHES b 
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id 
       WHERE b.deleted_at IS NULL 
       ORDER BY b.expiry_date ASC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inventory batches.' });
  }
});

// POST /api/inventory/deduct - Deduct stock from a specific batch
router.post('/deduct', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  const { batch_id, quantity_deducted, reason } = req.body;
  
  if (!Number.isInteger(quantity_deducted) || quantity_deducted <= 0) {
    return res.status(400).json({ error: 'Quantity deducted must be a positive integer.' });
  }
  
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock the batch row and check current stock levels
    const [batchRows] = await connection.query(
      'SELECT quantity_on_hand FROM MEDICINE_BATCHES WHERE batch_id = ? FOR UPDATE',
      [batch_id]
    );

    if (batchRows.length === 0) throw new Error('Medicine batch not found.');
    
    const oldQuantity = batchRows[0].quantity_on_hand;
    if (oldQuantity < quantity_deducted) {
      throw new Error('Insufficient stock in this batch to complete dispensation.');
    }

    const newQuantity = oldQuantity - quantity_deducted;

    // 2. Deduct the quantity from the batch
    await connection.query(
      'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?',
      [newQuantity, batch_id]
    );

    // 3. Append to internal INVENTORY_LOGS
    await connection.query(
      `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
       VALUES (?, ?, 'dispense', ?, ?)`,
      [batch_id, -quantity_deducted, reason || 'Prescription issuance', req.user.user_id]
    );

    // 4. Append to Global Cryptographic Audit Trail (RA 10173 Compliance)
    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'UPDATE',
      table: 'MEDICINE_BATCHES',
      recordId: batch_id,
      oldValue: { quantity_on_hand: oldQuantity },
      newValue: { quantity_on_hand: newQuantity },
      ipAddress: req.ip
    });

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