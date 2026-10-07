// server/src/routes/sync.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { logAudit } from '../utils/auditLogger.js';
import { encrypt } from '../utils/cryptoVault.js';

const router = express.Router();

/**
 * POST /api/sync/replay
 * Replays a batch of offline mutations generated during network disruptions.
 */
router.post('/replay', authenticateToken, async (req, res) => {
  const { mutations, device_id } = req.body;
  const userId = req.user.user_id;

  if (!Array.isArray(mutations) || mutations.length === 0) {
    return res.status(400).json({ error: 'mutations array is required.' });
  }

  const results = [];
  const connection = await pool.getConnection();

  try {
    for (const m of mutations) {
      const {
        client_mutation_id,
        table_name,
        record_uuid,
        action,
        payload,
        local_version = 1,
      } = m;

      if (!client_mutation_id || !table_name || !action) {
        results.push({ client_mutation_id, status: 'error', error: 'Incomplete mutation data' });
        continue;
      }

      await connection.beginTransaction();

      // 1. IDEMPOTENCY CHECK: Has this mutation already been replayed?
      const [existing] = await connection.query(
        'SELECT sync_id, sync_status FROM LOCAL_SYNC_LOGS WHERE client_mutation_id = ? FOR UPDATE',
        [client_mutation_id]
      );

      if (existing.length > 0) {
        await connection.commit();
        results.push({
          client_mutation_id,
          status: 'already_synced',
          sync_id: existing[0].sync_id,
        });
        continue;
      }

      try {
        let serverRecordId = null;

        // 2. DISPATCH MUTATION BASED ON TABLE
        if (table_name === 'EMR_RECORDS' && action === 'CREATE') {
            const { patient_user_id, chief_complaint, diagnosis, treatment_plan, notes, appointment_id, vitals, dental_chart } = payload;
            const [emrResult] = await connection.query(
              `INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, appointment_id, chief_complaint, diagnosis, treatment_plan, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              patient_user_id,
              userId,
              appointment_id || null,
              encrypt(chief_complaint),
              encrypt(diagnosis),
              encrypt(treatment_plan || ''),
              encrypt(notes || ''),
            ]
          );
          serverRecordId = emrResult.insertId;
          
          // Dentist-only odontogram from an offline-queued encounter
          if (dental_chart && typeof dental_chart === 'object' && (req.user.roles || []).includes('DENTIST')) {
            await connection.query(
              `INSERT INTO DENTAL_CHARTS (emr_id, patient_user_id, dentist_user_id, chart_data)
               VALUES (?, ?, ?, ?)`,
              [serverRecordId, patient_user_id, userId, encrypt(JSON.stringify(dental_chart))]
            );
          }

          // If linked to an appointment, complete it
          if (appointment_id) {
            await connection.query("UPDATE APPOINTMENTS SET status = 'completed' WHERE appointment_id = ?", [appointment_id]);
            await connection.query("UPDATE QUEUE SET status = 'done', served_at = CURRENT_TIMESTAMP WHERE appointment_id = ?", [appointment_id]);
          }

          // Persist replayed vitals to VITAL_SIGNS
          if (vitals && typeof vitals === 'object') {
            for (const [metric, val] of Object.entries(vitals)) {
              if (val && !isNaN(Number(val))) {
                const unit = metric.includes('bp') ? 'mmHg' : metric === 'temperature' ? '°C' : metric === 'pulse' ? 'bpm' : metric === 'spo2' ? '%' : 'cpm';
                await connection.query(
                  "INSERT INTO VITAL_SIGNS (emr_id, metric, value, unit, recorded_by) VALUES (?, ?, ?, ?, ?)",
                  [serverRecordId, metric, Number(val), unit, userId]
                );
              }
            }
          }
        }

        // 3. RECORD INTO LOCAL_SYNC_LOGS TABLE
        const [syncResult] = await connection.query(
          `INSERT INTO LOCAL_SYNC_LOGS 
           (client_mutation_id, user_id, device_id, table_name, record_id, record_uuid, action, payload, local_version, sync_status, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', CURRENT_TIMESTAMP)`,
          [
            client_mutation_id,
            userId,
            device_id || 'CLINIC-ELECTRON-TERMINAL-01',
            table_name,
            serverRecordId,
            record_uuid || client_mutation_id,
            action,
            JSON.stringify({ ...payload, dental_chart: undefined }),
            local_version,
          ]
        );

        // 4. APPEND TO R.A. 10173 AUDIT LOGS
        await logAudit(connection, {
          userId,
          action: 'CREATE',
          table: 'LOCAL_SYNC_LOGS',
          recordId: syncResult.insertId,
          oldValue: null,
          newValue: { client_mutation_id, table_name, action, serverRecordId, replay: true },
          ipAddress: req.ip,
        });

        await connection.commit();
        results.push({ client_mutation_id, status: 'synced', serverRecordId });
      } catch (mutationErr) {
        await connection.rollback();

        // Log conflict/error in LOCAL_SYNC_LOGS
        await connection.query(
          `INSERT INTO LOCAL_SYNC_LOGS 
           (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, sync_status, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'error', ?)`,
          [
            client_mutation_id,
            userId,
            device_id || 'CLINIC-ELECTRON-TERMINAL-01',
            table_name,
            record_uuid || client_mutation_id,
            action,
            JSON.stringify({ ...payload, dental_chart: undefined }),
            local_version,
            mutationErr.message,
          ]
        );

        results.push({ client_mutation_id, status: 'error', error: mutationErr.message });
      }
    }

    res.json({
      message: 'Batch synchronization processed.',
      totalReceived: mutations.length,
      syncedCount: results.filter((r) => r.status === 'synced' || r.status === 'already_synced').length,
      results,
    });
  } catch (error) {
    console.error('[Sync Route Error]:', error);
    res.status(500).json({ error: 'Failed to process sync replay.' });
  } finally {
    connection.release();
  }
});

// GET /api/sync/status - Telemetry of synced vs pending/error sync records
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sync_status, COUNT(*) as count 
       FROM LOCAL_SYNC_LOGS 
       GROUP BY sync_status`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve sync status.' });
  }
});

export default router;