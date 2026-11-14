// Handles medicine catalog creation and archival and publishes inventory updates.

import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { archiveMedicine, createMedicine } from '../../inventory/formularyMutations.js';

export function registerFormularyRoutes(router, io) {
  // =============================================================================
  // 3. MASTER FORMULARY REGISTRATION
  // =============================================================================

  router.post('/medicines', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
    const { name, generic_name, form, strength, unit, reorder_level: rawReorderLevel } = req.body;

    if (!name || !generic_name || !form || !strength) {
      return res.status(400).json({ error: 'name, generic_name, form, and strength are required.' });
    }

    const reorder_level = rawReorderLevel === undefined || rawReorderLevel === null || rawReorderLevel === ''
      ? 15 : Number(rawReorderLevel);
    if (!Number.isInteger(reorder_level) || reorder_level < 0 || reorder_level > 2147483647 ||
        (rawReorderLevel != null && !['number', 'string'].includes(typeof rawReorderLevel))) {
      return res.status(400).json({ error: 'Reorder level must be a nonnegative integer.' });
    }

    try {
      const medicineId = await createMedicine({ name, generic_name, form, strength, unit, reorder_level, userId: req.user.user_id, ipAddress: req.ip });

      if (io) io.emit('inventory:updated');

      res.status(201).json({
        message: `Medicine "${name}" (${generic_name}) added to hospital formulary.`,
        medicineId,
      });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      console.error('[Formulary Mutation Error]:', error.code ?? error.name);
      return res.status(500).json({ error: 'Could not save the formulary change.' });
    }
  });

  router.delete('/medicines/:id', authenticateToken, requireRoles('NURSE', 'ADMIN'), async (req, res) => {
    const medicineId = Number(req.params.id);
    try {
      const medicine = await archiveMedicine({ medicineId, userId: req.user.user_id, ipAddress: req.ip });

      if (io) io.emit('inventory:updated');

      res.json({ message: `Medicine "${medicine.name}" (${medicine.strength}) deleted from formulary.` });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      console.error('[Formulary Mutation Error]:', error.code ?? error.name);
      return res.status(500).json({ error: 'Could not save the formulary change.' });
    }
  });
}
