// server/src/routes/inventory.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

// =============================================================================
// 1. READ / QUERY CATALOGUE
// =============================================================================

// GET /api/inventory/batches - Fetch all active inventory batches (FEFO sorted)
router.get('/batches', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.batch_id, m.medicine_id, m.name, m.generic_name, m.form, m.strength,
              b.batch_no, b.quantity_on_hand, b.manufacture_date, b.expiry_date, b.supplier,
              DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry
       FROM MEDICINE_BATCHES b 
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id 
       WHERE b.deleted_at IS NULL 
       ORDER BY b.expiry_date ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching inventory batches:', error);
    res.status(500).json({ error: 'Failed to fetch inventory batches.' });
  }
});

// GET /api/inventory/medicines - Master drug catalogue for prescriptions & stock-in dropdowns
router.get('/medicines', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'), async (req, res) => {
  try {
    const [medicines] = await pool.query(
      `SELECT medicine_id, name, generic_name, form, strength, unit, reorder_level 
       FROM MEDICINES 
       WHERE is_active = TRUE AND deleted_at IS NULL 
       ORDER BY name ASC`
    );
    res.json(medicines);
  } catch (error) {
    console.error('Failed to fetch medicine master:', error);
    res.status(500).json({ error: 'Failed to fetch medicines catalogue.' });
  }
});

// GET /api/inventory/expiring-soon - Sweeps for lots expiring within 90 days or below reorder level
router.get('/expiring-soon', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.batch_id, m.name, m.generic_name, b.batch_no, b.quantity_on_hand, m.reorder_level,
              b.expiry_date, DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry,
              CASE 
                WHEN DATEDIFF(b.expiry_date, CURDATE()) < 0 THEN 'EXPIRED'
                WHEN DATEDIFF(b.expiry_date, CURDATE()) <= 30 THEN 'CRITICAL'
                WHEN DATEDIFF(b.expiry_date, CURDATE()) <= 90 THEN 'EXPIRING_SOON'
                ELSE 'OK'
              END AS alert_level
       FROM MEDICINE_BATCHES b
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id
       WHERE b.deleted_at IS NULL 
         AND (DATEDIFF(b.expiry_date, CURDATE()) <= 90 OR b.quantity_on_hand <= m.reorder_level)
       ORDER BY b.expiry_date ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error in expiry sweep:', error);
    res.status(500).json({ error: 'Failed to execute expiry sweep.' });
  }
});

// =============================================================================
// 2. INBOUND & STOCK REPLENISHMENT (NEW FEATURE)
// =============================================================================

// POST /api/inventory/receive - Log a new shipment delivery / stock-in
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

    // 1. Verify medicine exists in master
    const [medRows] = await connection.query(
      'SELECT name FROM MEDICINES WHERE medicine_id = ? AND deleted_at IS NULL',
      [medicine_id]
    );
    if (medRows.length === 0) throw new Error('Medicine not found in master formulary.');

    // 2. Check if this exact batch number already exists for this medicine
    const [existingBatch] = await connection.query(
      'SELECT batch_id, quantity_on_hand FROM MEDICINE_BATCHES WHERE medicine_id = ? AND batch_no = ? FOR UPDATE',
      [medicine_id, batch_no]
    );

    let targetBatchId;
    let newQty;

    if (existingBatch.length > 0) {
      // Restock existing lot
      targetBatchId = existingBatch[0].batch_id;
      newQty = existingBatch[0].quantity_on_hand + Number(quantity_received);

      await connection.query(
        'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ?, supplier = ? WHERE batch_id = ?',
        [newQty, supplier || null, targetBatchId]
      );
    } else {
      // Create new lot batch
      const [batchResult] = await connection.query(
        `INSERT INTO MEDICINE_BATCHES 
         (medicine_id, batch_no, manufacture_date, expiry_date, supplier, quantity_on_hand)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [medicine_id, batch_no, manufacture_date, expiry_date, supplier || 'PSU Central Depot', Number(quantity_received)]
      );
      targetBatchId = batchResult.insertId;
      newQty = Number(quantity_received);
    }

    // 3. Log into INVENTORY_LOGS as 'receive'
    await connection.query(
      `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
       VALUES (?, ?, 'receive', ?, ?)`,
      [targetBatchId, Number(quantity_received), `Shipment received from ${supplier || 'Depot'}`, req.user.user_id]
    );

    // 4. Record to R.A. 10173 Audit Ledger
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

// =============================================================================
// 3. MASTER FORMULARY REGISTRATION (NEW FEATURE)
// =============================================================================

// POST /api/inventory/medicines - Add a new drug definition to the University formulary
router.post('/medicines', authenticateToken, requireRoles('DOCTOR', 'NURSE', 'ADMIN'), async (req, res) => {
  const { name, generic_name, form, strength, unit, reorder_level } = req.body;

  if (!name || !generic_name || !form || !strength) {
    return res.status(400).json({ error: 'name, generic_name, form, and strength are required.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO MEDICINES (name, generic_name, form, strength, unit, reorder_level)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, generic_name, form, strength, unit || 'pcs', Number(reorder_level) || 15]
    );

    const medicineId = result.insertId;

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'CREATE',
      table: 'MEDICINES',
      recordId: medicineId,
      oldValue: null,
      newValue: { name, generic_name, form, strength, reorder_level },
      ipAddress: req.ip,
    });

    await connection.commit();

    res.status(201).json({
      message: `Medicine "${name}" (${generic_name}) added to hospital formulary.`,
      medicineId,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Add medicine error:', error);
    res.status(500).json({ error: 'Failed to create medicine definition.' });
  } finally {
    connection.release();
  }
});

// =============================================================================
// 4. DISPENSATION & OUTBOUND DEDUCTIONS
// =============================================================================

// POST /api/inventory/deduct - Deduct stock from a specific batch for prescription
router.post('/deduct', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  const { batch_id, quantity_deducted, reason } = req.body;

  if (!Number.isInteger(Number(quantity_deducted)) || Number(quantity_deducted) <= 0) {
    return res.status(400).json({ error: 'Quantity deducted must be a positive integer.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock the batch row and check current stock levels
    const [batchRows] = await connection.query(
      'SELECT quantity_on_hand, batch_no FROM MEDICINE_BATCHES WHERE batch_id = ? FOR UPDATE',
      [batch_id]
    );

    if (batchRows.length === 0) throw new Error('Medicine batch not found.');

    const oldQuantity = batchRows[0].quantity_on_hand;
    if (oldQuantity < Number(quantity_deducted)) {
      throw new Error(`Insufficient stock. Batch ${batchRows[0].batch_no} only has ${oldQuantity} units left.`);
    }

    const newQuantity = oldQuantity - Number(quantity_deducted);

    // 2. Deduct the quantity
    await connection.query(
      'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?',
      [newQuantity, batch_id]
    );

    // 3. Append to internal INVENTORY_LOGS
    await connection.query(
      `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
       VALUES (?, ?, 'dispense', ?, ?)`,
      [batch_id, -Number(quantity_deducted), reason || 'Prescription issuance', req.user.user_id]
    );

    // 4. Append to Global Cryptographic Audit Trail
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
    res.json({ message: 'Stock successfully deducted and logged.', remainingStock: newQuantity });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// =============================================================================
// 5. STOCK ADJUSTMENT & EXPIRED DRUG DISPOSAL (NEW FEATURE)
// =============================================================================

// POST /api/inventory/adjust - Discard expired medicine, damaged bottles, or log returns
router.post('/adjust', authenticateToken, requireRoles('NURSE', 'ADMIN'), async (req, res) => {
  const { batch_id, quantity_removed, transaction_type, reason } = req.body;
  // Allowed types: 'dispose', 'adjust', 'recall', 'return'
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

export default router;