import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { deductStock, adjustStock } from '../../inventory/stockMutations.js';

export function registerInventoryStock(router, io) {
  // =============================================================================
  // 4. MANUAL DEDUCTION & STOCK ADJUSTMENT
  // =============================================================================

  router.post('/deduct', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
    const { batch_id, quantity_deducted, reason } = req.body;

    if (!Number.isInteger(Number(quantity_deducted)) || Number(quantity_deducted) <= 0) {
      return res.status(400).json({ error: 'Quantity deducted must be a positive integer.' });
    }

    try {
      const newQuantity = await deductStock({ batch_id, quantity_deducted, reason, userId: req.user.user_id, ipAddress: req.ip });

      if (io) io.emit('inventory:updated');

      res.json({ message: 'Stock successfully deducted and logged.', remainingStock: newQuantity });
    } catch (error) {
      if (!error.status) {
        console.error('[Inventory] Stock mutation failed.', error.code ?? error.name);
        return res.status(500).json({ error: 'Could not save the stock movement.' });
      }
      res.status(error.status).json({ error: error.message });
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

    try {
      const newQty = await adjustStock({ batch_id, quantity_removed, transaction_type, reason, userId: req.user.user_id, ipAddress: req.ip });

      if (io) io.emit('inventory:updated');

      res.json({
        message: `Adjustment logged. ${quantity_removed} units marked as '${transaction_type}'. Remaining: ${newQty}.`,
        remainingStock: newQty,
      });
    } catch (error) {
      if (!error.status) {
        console.error('[Inventory] Stock mutation failed.', error.code ?? error.name);
        return res.status(500).json({ error: 'Could not save the stock movement.' });
      }
      res.status(error.status).json({ error: error.message });
    }
  });
}
