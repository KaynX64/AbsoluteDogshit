import { pool } from '../../../db/pool.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { requireRoles } from '../../../middleware/rbac.js';
import { logAudit } from '../../../utils/auditLogger.js';
import { encrypt, decrypt } from '../../../utils/cryptoVault.js';

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

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rows] = await connection.query(
          'SELECT * FROM PRESCRIPTIONS WHERE prescription_id = ? AND deleted_at IS NULL FOR UPDATE',
          [prescriptionId]
        );

        if (rows.length === 0) {
          await connection.rollback();
          return res.status(404).json({ error: 'Prescription not found.' });
        }

        const rx = rows[0];

        if (rx.status !== 'active') {
          await connection.rollback();
          return res.status(409).json({
            error: `Cannot cancel a prescription with status "${rx.status}".`,
            code: 'INVALID_STATE',
            currentStatus: rx.status,
          });
        }

        const isIssuer = Number(rx.doctor_user_id) === Number(req.user.user_id);
        const isAdmin = (req.user.roles || []).includes('ADMIN');
        if (!isIssuer && !isAdmin) {
          await connection.rollback();
          return res.status(403).json({
            error: 'Only the issuing practitioner or an administrator may cancel this prescription.',
          });
        }

        const cancellationNote = `\n[CANCELLED ${new Date().toISOString()}] ${reason || 'Cancelled by practitioner'}`;
        // notes is AES-encrypted at rest: decrypt, append, re-encrypt. A raw SQL
        // CONCAT corrupts the ciphertext and makes the notes undecryptable.
        const existingNotes = rx.notes ? decrypt(rx.notes) : '';
        await connection.query(
          `UPDATE PRESCRIPTIONS
           SET status = 'cancelled',
               notes = ?
           WHERE prescription_id = ?`,
          [encrypt(existingNotes + cancellationNote), prescriptionId]
        );

        // ── Trace & restore deducted stock batches ───────────────────────────
        const [dispenseLogs] = await connection.query(
          `SELECT l.log_id, l.batch_id, l.prescription_item_id,
                  ABS(l.quantity_change) AS qty_dispensed
           FROM INVENTORY_LOGS l
           WHERE l.transaction_type = 'dispense'
             AND (
               l.prescription_item_id IN (
                 SELECT item_id FROM PRESCRIPTION_ITEMS WHERE prescription_id = ?
               )
               OR (
                 l.prescription_item_id IS NULL
                 AND l.reason LIKE ?
               )
             )
           FOR UPDATE`,
          [prescriptionId, `Automated FEFO dispense for Prescription #${prescriptionId} (%`]
        );
        const restoredBatchCount = new Set(dispenseLogs.map((log) => Number(log.batch_id))).size;

        for (const log of dispenseLogs) {
          const [batchRows] = await connection.query(
            'SELECT quantity_on_hand FROM MEDICINE_BATCHES WHERE batch_id = ? FOR UPDATE',
            [log.batch_id]
          );

          if (batchRows.length > 0) {
            const currentQty = batchRows[0].quantity_on_hand;
            const restoredQty = currentQty + log.qty_dispensed;

            await connection.query(
              'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?',
              [restoredQty, log.batch_id]
            );

            await connection.query(
              `INSERT INTO INVENTORY_LOGS
               (batch_id, prescription_item_id, quantity_change, transaction_type, reason, performed_by)
               VALUES (?, ?, ?, 'return', ?, ?)`,
              [
                log.batch_id,
                log.prescription_item_id,
                log.qty_dispensed,
                `Restored stock from cancelled Prescription #${prescriptionId}`,
                req.user.user_id,
              ]
            );

            await logAudit(connection, {
              userId: req.user.user_id,
              action: 'UPDATE',
              table: 'MEDICINE_BATCHES',
              recordId: log.batch_id,
              oldValue: { quantity_on_hand: currentQty },
              newValue: {
                quantity_on_hand: restoredQty,
                prescription_id: prescriptionId,
                restored_qty: log.qty_dispensed,
              },
              ipAddress: req.ip,
            });
          }
        }

        await logAudit(connection, {
          userId: req.user.user_id,
          action: 'REVOKE',
          table: 'PRESCRIPTIONS',
          recordId: prescriptionId,
          oldValue: { status: 'active' },
          newValue: {
            status: 'cancelled',
            reason: reason || 'Cancelled by practitioner',
            cancelled_by_role: req.user.roles[0],
            cancelled_at: new Date().toISOString(),
            restored_batches_count: restoredBatchCount,
          },
          ipAddress: req.ip,
        });

        await connection.commit();

        if (io) {
          io.emit('inventory:updated');
        }

        res.json({
          message: `Prescription cancelled successfully and stock was returned from ${restoredBatchCount} medication batch(es).`,
          prescriptionId,
          status: 'cancelled',
        });
      } catch (error) {
        await connection.rollback();
        console.error('[Prescription Cancel Error]:', error);
        res.status(400).json({ error: error.message || 'Failed to cancel prescription.' });
      } finally {
        connection.release();
      }
    }
  );
}
