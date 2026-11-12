import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';

export function registerFormularyRoutes(router, io) {
  // =============================================================================
  // 3. MASTER FORMULARY REGISTRATION
  // =============================================================================

  router.post('/medicines', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
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

      if (io) io.emit('inventory:updated');

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

  router.delete('/medicines/:id', authenticateToken, requireRoles('NURSE', 'ADMIN'), async (req, res) => {
    const medicineId = Number(req.params.id);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [medRows] = await connection.query(
        'SELECT name, generic_name, strength FROM MEDICINES WHERE medicine_id = ? AND deleted_at IS NULL',
        [medicineId]
      );

      if (medRows.length === 0) {
        throw new Error('Medicine definition not found or already deleted.');
      }

      const [activeBatches] = await connection.query(
        'SELECT COALESCE(SUM(quantity_on_hand), 0) as total_stock FROM MEDICINE_BATCHES WHERE medicine_id = ? AND deleted_at IS NULL AND quantity_on_hand > 0',
        [medicineId]
      );

      const stockRemaining = activeBatches[0]?.total_stock || 0;
      if (stockRemaining > 0) {
        throw new Error(
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
        userId: req.user.user_id,
        action: 'DELETE',
        table: 'MEDICINES',
        recordId: medicineId,
        oldValue: medRows[0],
        newValue: { operation: 'FORMULARY_DELETED', is_active: false },
        ipAddress: req.ip,
      });

      await connection.commit();

      if (io) io.emit('inventory:updated');

      res.json({ message: `Medicine "${medRows[0].name}" (${medRows[0].strength}) deleted from formulary.` });
    } catch (error) {
      await connection.rollback();
      console.error('Delete medicine error:', error);
      res.status(400).json({ error: error.message || 'Failed to delete medicine definition.' });
    } finally {
      connection.release();
    }
  });
}
