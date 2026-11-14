// Validates medicine deliveries and dispatches stock receipt and inventory updates.

import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { receiveStock } from '../../inventory/stockMutations.js';

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

    try {
      const { targetBatchId, newQty } = await receiveStock({ medicine_id, batch_no, manufacture_date, expiry_date, supplier, quantity_received, userId: req.user.user_id, ipAddress: req.ip });

      if (io) io.emit('inventory:updated');

      res.status(201).json({
        message: `Stock successfully logged. Batch ${batch_no} now has ${newQty} units.`,
        batchId: targetBatchId,
        quantityOnHand: newQty,
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
