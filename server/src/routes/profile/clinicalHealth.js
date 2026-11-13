import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { logAudit } from '../../utils/auditLogger.js';
import { requireRoles } from '../../middleware/rbac.js';
import { SignerError, assertAppointmentInQueue } from '../../documents/signing/signatory.js';

export function registerClinicalHealthRoutes(router) {
  // =============================================================================
  // PATIENT IMMUNIZATION ENDPOINTS (CLINICAL WORKSPACE)
  // =============================================================================

  // GET /api/profile/patient/:patientId/immunizations
  router.get(
    '/patient/:patientId/immunizations',
    authenticateToken,
    requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'),
    async (req, res) => {
      try {
        const patientId = Number(req.params.patientId);

        const [rows] = await pool.query(
          'SELECT immunization_history FROM HEALTH_PROFILES WHERE user_id = ? AND deleted_at IS NULL',
          [patientId]
        );

        if (rows.length === 0 || !rows[0].immunization_history) {
          return res.json({ immunizations: [] });
        }

        let immunizations = [];
        const raw = rows[0].immunization_history;

        if (Array.isArray(raw)) {
          immunizations = raw;
        } else if (typeof raw === 'string') {
          try {
            immunizations = JSON.parse(raw);
          } catch (_) {
            immunizations = raw ? [raw] : [];
          }
        }

        res.json({ immunizations });
      } catch (error) {
        console.error('[Immunizations Fetch Error]:', error);
        res.status(500).json({ error: 'Failed to retrieve immunization history.' });
      }
    }
  );

  // PUT /api/profile/patient/:patientId/immunizations
  router.put(
    '/patient/:patientId/immunizations',
    authenticateToken,
    requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'),
    async (req, res) => {
      const patientId = Number(req.params.patientId);
      const { immunizations, appointment_id } = req.body;

      if (!Array.isArray(immunizations)) {
        return res.status(400).json({ error: 'immunizations must be an array of strings.' });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
      
        // Doctors/dentists may only record immunizations for a patient in their
        // QUEUE. Nurses and admins are exempt.
        const roles = req.user.roles || [];
        const isPractitionerOnly =
          (roles.includes('DOCTOR') || roles.includes('DENTIST')) &&
          !roles.includes('ADMIN') &&
          !roles.includes('NURSE');
        if (isPractitionerOnly) {
          await assertAppointmentInQueue(connection, appointment_id, patientId, req.user.user_id);
        }

        const [hpRows] = await connection.query(
          'SELECT profile_id FROM HEALTH_PROFILES WHERE user_id = ? FOR UPDATE',
          [patientId]
        );

        const jsonVal = JSON.stringify(immunizations);

        if (hpRows.length > 0) {
          await connection.query(
            `UPDATE HEALTH_PROFILES 
           SET immunization_history = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP 
           WHERE user_id = ?`,
            [jsonVal, patientId]
          );
        } else {
          await connection.query(
            `INSERT INTO HEALTH_PROFILES (user_id, immunization_history) 
           VALUES (?, ?)`,
            [patientId, jsonVal]
          );
        }

        await logAudit(connection, {
          userId: req.user.user_id,
          action: 'UPDATE',
          table: 'HEALTH_PROFILES',
          recordId: hpRows[0]?.profile_id || patientId,
          oldValue: null,
          newValue: { operation: 'UPDATE_IMMUNIZATION_RECORDS', patient_user_id: patientId, immunizations },
          ipAddress: req.ip,
        });

        await connection.commit();
        res.json({ message: 'Immunization records updated successfully.', immunizations });
      } catch (error) {
        await connection.rollback();
              if (error instanceof SignerError) {
          return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('[Immunizations Update Error]:', error);
        res.status(500).json({ error: 'Failed to save immunization records.' });
      } finally {
        connection.release();
      }
    }
  );
}
