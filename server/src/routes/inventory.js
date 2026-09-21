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
      `SELECT b.batch_id, m.name, b.batch_no, b.quantity_on_hand, b.expiry_date, b.manufacture_date, b.supplier, b.medicine_id 
      FROM MEDICINE_BATCHES b 
      JOIN MEDICINES m ON b.medicine_id = m.medicine_id 
      WHERE b.deleted_at IS NULL 
      AND m.deleted_at IS NULL 
      AND m.is_active = TRUE
      ORDER BY b.expiry_date ASC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inventory batches.' });
  }
});

// GET /api/inventory/medicines - Fetch master medicines catalog for batch receiving
router.get('/medicines', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT medicine_id, name, generic_name, form, strength, unit FROM MEDICINES WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY name ASC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch medicines master list.' });
  }
});

// POST /api/inventory/receive - Add a new medicine batch / stock receipt
router.post('/receive', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  const { medicine_id, batch_no, manufacture_date, expiry_date, supplier, quantity_received, reason } = req.body;

  const parsedMedicineId = parseInt(medicine_id, 10);
  const parsedQuantity = parseInt(quantity_received, 10);

  if (isNaN(parsedMedicineId) || parsedMedicineId <= 0) {
    return res.status(400).json({ error: 'Valid medicine ID is required.' });
  }
  if (!batch_no || !manufacture_date || !expiry_date) {
    return res.status(400).json({ error: 'Batch number, manufacture date, and expiry date are required.' });
  }
  if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
    return res.status(400).json({ error: 'Quantity received must be a positive integer.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [batchResult] = await connection.query(
      `INSERT INTO MEDICINE_BATCHES (medicine_id, batch_no, manufacture_date, expiry_date, supplier, quantity_on_hand)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [parsedMedicineId, batch_no, manufacture_date, expiry_date, supplier || 'University Supplier', parsedQuantity]
    );

    const batchId = batchResult.insertId;

    await connection.query(
      `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
       VALUES (?, ?, 'receive', ?, ?)`,
      [batchId, parsedQuantity, reason || 'New stock shipment received', req.user.user_id]
    );

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'CREATE',
      table: 'MEDICINE_BATCHES',
      recordId: batchId,
      oldValue: null,
      newValue: { medicine_id: parsedMedicineId, batch_no, quantity_on_hand: parsedQuantity, expiry_date },
      ipAddress: req.ip
    });

    await connection.commit();
    return res.status(201).json({ message: 'New medicine batch successfully received and logged.', batchId });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ error: error.message || 'Failed to receive stock batch.' });
  } finally {
    connection.release();
  }
});

// POST /api/inventory/deduct - Deduct stock from a specific batch
router.post('/deduct', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  const { batch_id, quantity_deducted, reason } = req.body;
  
  const parsedBatchId = parseInt(batch_id, 10);
  const parsedQuantity = parseInt(quantity_deducted, 10);

  if (isNaN(parsedBatchId) || parsedBatchId <= 0) {
    return res.status(400).json({ error: 'Valid batch ID is required.' });
  }

  if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
    return res.status(400).json({ error: 'Quantity deducted must be a positive integer.' });
  }
  
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [batches] = await connection.query(
      'SELECT quantity_on_hand FROM MEDICINE_BATCHES WHERE batch_id = ? AND deleted_at IS NULL FOR UPDATE',
      [parsedBatchId]
    );

    if (batches.length === 0) {
      throw new Error('Batch not found or has been deleted.');
    }

    const currentStock = batches[0].quantity_on_hand;
    if (currentStock < parsedQuantity) {
      throw new Error(`Insufficient stock. Only ${currentStock} units remaining in this batch.`);
    }

    await connection.query(
      'UPDATE MEDICINE_BATCHES SET quantity_on_hand = quantity_on_hand - ? WHERE batch_id = ?',
      [parsedQuantity, parsedBatchId]
    );

    await connection.query(
      `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by) 
       VALUES (?, ?, 'dispense', ?, ?)`,
      [parsedBatchId, -parsedQuantity, reason || 'Prescription issuance', req.user.user_id]
    );

    await connection.commit();
    connection.release();
    
    return res.status(200).json({ message: 'Stock successfully deducted.' });

  } catch (error) {
    await connection.rollback();
    connection.release();
    return res.status(400).json({ error: error.message });
  }
});

export default router;