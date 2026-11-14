import { cancelPrescription } from '../../../documents/prescriptions/cancelPrescription.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { requireRoles } from '../../../middleware/rbac.js';

export function registerPrescriptionCancellation(router, io) {
  // ── Cancel Prescription & Restore Stock ─────────────────────────────────────
  router.patch(
    '/prescriptions/:id/cancel',
    authenticateToken,
    requireRoles('DOCTOR', 'DENTIST', 'ADMIN'),
    async (req, res) => {
      const prescriptionId = Number(req.params.id);
      const { reason } = req.body;

      if (!prescriptionId || Number.isNaN(prescriptionId)) {
        return res.status(400).json({ error: 'A valid prescription id is required.' });
      }

      let result;
      try {
        result = await cancelPrescription({ prescriptionId, reason, user: req.user, ipAddress: req.ip });
      } catch (error) {
        if (error.status) {
          return res.status(error.status).json({ error: error.message, code: error.code, currentStatus: error.currentStatus });
        }
        console.error('[Prescription Cancel Error]:', error.code ?? error.name);
        return res.status(500).json({ error: 'Failed to cancel prescription.' });
      }
      io?.emit('inventory:updated');
      return res.json(result);
    }
  );
}
