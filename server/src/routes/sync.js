// server/src/routes/sync.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { logPhiAccess } from '../utils/phiLogger.js';
import { validateDentalChart } from '../utils/dentalValidator.js';

const router = express.Router();

/**
 * GET /api/sync/bootstrap
 * Pre-populates the Electron clinic workstation's embedded SQLite database.
 * Supports Delta Sync via the `lastSyncedAt` query parameter to minimize payload size.
 */
router.get('/bootstrap', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
  try {
    // 1. Parse optional delta sync timestamp
    const lastSyncedAt = req.query.lastSyncedAt ? new Date(req.query.lastSyncedAt) : null;
    
    // 2. Fetch active students & faculty (Always fetch full active roster as they rarely change)
    const [patients] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.phone, 
              COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS student_no, 
              COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS course, 
              sp.year_level, hp.blood_type, hp.allergies, hp.chronic_conditions 
       FROM USERS u 
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id 
       LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id 
       LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id 
       LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id 
       WHERE u.is_active = TRUE AND u.deleted_at IS NULL 
       LIMIT 500`
    );

    const decryptedPatients = patients.map((p) => ({
      ...p,
      allergies: decrypt(p.allergies) || 'None reported',
      chronic_conditions: decrypt(p.chronic_conditions) || 'None reported',
    }));

    // 3. Fetch EMR records (Delta Sync: only fetch records updated/created since last sync)
    let emrQuery = `
      SELECT e.emr_id, e.patient_user_id, e.doctor_user_id, e.encounter_date, 
             e.chief_complaint, e.diagnosis, e.treatment_plan, e.notes, e.version, 
             CONCAT('Dr. ', d.first_name, ' ', d.last_name) AS doctor_name 
      FROM EMR_RECORDS e 
      JOIN USERS d ON e.doctor_user_id = d.user_id 
      WHERE e.deleted_at IS NULL 
    `;
    
    const queryParams = [];
    if (lastSyncedAt && !isNaN(lastSyncedAt.getTime())) {
      emrQuery += ` AND (e.encounter_date >= ? OR e.updated_at >= ?) `;
      queryParams.push(lastSyncedAt, lastSyncedAt);
    } else {
      // Fallback to 90 days if no timestamp provided (initial sync)
      emrQuery += ` AND e.encounter_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) `;
    }
    
    emrQuery += ` ORDER BY e.encounter_date DESC LIMIT 500`;

    const [emrs] = await pool.query(emrQuery, queryParams);

    const decryptedEmrs = emrs.map((e) => ({
      ...e,
      chief_complaint: decrypt(e.chief_complaint) || '',
      diagnosis: decrypt(e.diagnosis) || '',
      treatment_plan: decrypt(e.treatment_plan) || '',
      notes: decrypt(e.notes) || '',
    }));

    // Statutory read log under R.A. 10173
    logPhiAccess({
      viewerUserId: req.user.user_id,
      patientUserId: null,   // bulk read — not tied to a single patient
      table: 'EMR_RECORDS',
      recordId: 0,
      purpose: 'Clinic Workstation Offline Cache Bootstrap',
      ipAddress: req.ip,
    });

    // 4. Return data with server timestamp for the next delta sync
    res.json({
      patients: decryptedPatients,
      emrRecords: decryptedEmrs,
      serverTime: new Date().toISOString(), // Client saves this for the next request
      bootstrappedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Sync Bootstrap Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve bootstrap cache.' });
  }
});

/**
 * POST /api/sync/replay
 * Replays a batch of offline mutations generated on the clinic Electron desktop.
 * Enforces idempotency via client_mutation_id and flags concurrent edit conflicts.
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

      // 1. IDEMPOTENCY CHECK
      const [existing] = await connection.query(
        'SELECT sync_id, sync_status, record_id FROM LOCAL_SYNC_LOGS WHERE client_mutation_id = ? FOR UPDATE',
        [client_mutation_id]
      );

      if (existing.length > 0) {
        await connection.commit();
        results.push({
          client_mutation_id,
          status: 'already_synced',
          sync_id: existing[0].sync_id,
          serverRecordId: existing[0].record_id,
        });
        continue;
      }

      try {
        let serverRecordId = null;

        // 2. DISPATCH MUTATION BASED ON TABLE & ACTION
        if (table_name === 'EMR_RECORDS' && action === 'CREATE') {
          const {
            patient_user_id,
            chief_complaint,
            diagnosis,
            treatment_plan,
            notes,
            appointment_id,
            vitals,
            dental_chart,
          } = payload;

          // Check if appointment was already processed while this PC was offline
          if (appointment_id) {
            const [appRows] = await connection.query(
              'SELECT status FROM APPOINTMENTS WHERE appointment_id = ? FOR UPDATE',
              [appointment_id]
            );
            if (appRows.length > 0 && appRows[0].status === 'completed') {
              await connection.query(
                `INSERT INTO LOCAL_SYNC_LOGS 
                 (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, sync_status, error_message)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'conflict', 'Appointment was already completed concurrently')`,
                [client_mutation_id, userId, device_id || 'CLINIC-DESKTOP', table_name, record_uuid, action, JSON.stringify(payload), local_version]
              );
              await connection.commit();
              results.push({ client_mutation_id, status: 'conflict', error: 'Appointment was already completed concurrently on the server.' });
              continue;
            }
          }

          // Insert new EMR with AES-256 encryption
          const [emrResult] = await connection.query(
            `INSERT INTO EMR_RECORDS 
              (patient_user_id, doctor_user_id, appointment_id, chief_complaint, diagnosis, treatment_plan, notes, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              patient_user_id, userId, appointment_id || null,
              encrypt(chief_complaint), encrypt(diagnosis), encrypt(treatment_plan || ''), encrypt(notes || ''),
              local_version,
            ]
          );
          serverRecordId = emrResult.insertId;

          // Dentist-only odontogram
          if (dental_chart && typeof dental_chart === 'object' && (req.user.roles || []).includes('DENTIST')) {
            const chartValidation = validateDentalChart(dental_chart);
            if (!chartValidation.valid) {
              await connection.rollback();
              results.push({ client_mutation_id, status: 'error', error: `Odontogram validation error: ${chartValidation.error}` });
              continue;
            }
            await connection.query(
              `INSERT INTO DENTAL_CHARTS (emr_id, patient_user_id, dentist_user_id, chart_data) VALUES (?, ?, ?, ?)`,
              [serverRecordId, patient_user_id, userId, encrypt(JSON.stringify(dental_chart))]
            );
          }

          // Link appointment and queue
          if (appointment_id) {
            await connection.query("UPDATE APPOINTMENTS SET status = 'completed' WHERE appointment_id = ?", [appointment_id]);
            await connection.query("UPDATE QUEUE SET status = 'done', served_at = CURRENT_TIMESTAMP WHERE appointment_id = ?", [appointment_id]);
          }

          // Persist replayed vitals
          if (vitals && typeof vitals === 'object') {
            for (const [metric, val] of Object.entries(vitals)) {
              if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val))) {
                const unit = metric.includes('bp') ? 'mmHg' : metric === 'temperature' ? '°C' : metric === 'pulse' ? 'bpm' : metric === 'spo2' ? '%' : 'cpm';
                await connection.query(
                  'INSERT INTO VITAL_SIGNS (emr_id, metric, value, unit, recorded_by) VALUES (?, ?, ?, ?, ?)',
                  [serverRecordId, metric, Number(val), unit, userId]
                );
              }
            }
          }
        } 
        else if (table_name === 'EMR_RECORDS' && action === 'UPDATE') {
          const { emr_id, chief_complaint, diagnosis, treatment_plan, notes } = payload;
          if (!emr_id) throw new Error('emr_id is required for UPDATE');
          
          await connection.query(
            `UPDATE EMR_RECORDS SET 
              chief_complaint = ?, diagnosis = ?, treatment_plan = ?, notes = ?, version = version + 1 
             WHERE emr_id = ? AND deleted_at IS NULL`,
            [
              encrypt(chief_complaint), encrypt(diagnosis), 
              encrypt(treatment_plan || ''), encrypt(notes || ''), 
              emr_id
            ]
          );
          serverRecordId = emr_id;
        } 
        else if (table_name === 'APPOINTMENTS' && action === 'UPDATE') {
          const { appointment_id, status } = payload;
          if (!appointment_id) throw new Error('appointment_id is required');
          
          await connection.query(
            'UPDATE APPOINTMENTS SET status = ?, version = version + 1 WHERE appointment_id = ? AND deleted_at IS NULL',
            [status, appointment_id]
          );
          
          // Sync queue status if needed
          if (status === 'completed' || status === 'cancelled') {
             const queueStatus = status === 'completed' ? 'done' : 'cancelled';
             await connection.query(
               "UPDATE QUEUE SET status = ?, served_at = CURRENT_TIMESTAMP WHERE appointment_id = ?",
               [queueStatus, appointment_id]
             );
          }
          serverRecordId = appointment_id;
        } 
        else {
          throw new Error(`Unsupported offline mutation: ${action} on ${table_name}`);
        }

        // 3. PERSIST SYNC LOG WITH DETERMINISTIC STATE
        // Note: Using the actual `action` variable instead of hardcoding 'CREATE'
        const [syncResult] = await connection.query(
          `INSERT INTO LOCAL_SYNC_LOGS 
           (client_mutation_id, user_id, device_id, table_name, record_id, record_uuid, action, payload, local_version, sync_status, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', CURRENT_TIMESTAMP)`,
          [
            client_mutation_id, userId, device_id || 'CLINIC-DESKTOP', table_name,
            serverRecordId, record_uuid || client_mutation_id, action, // <-- Fixed: use actual action
            JSON.stringify({ ...payload, dental_chart: undefined }), local_version,
          ]
        );

        // 4. APPEND TO IMMUTABLE HASH-CHAINED AUDIT LOG
        // Note: Using the actual `action` variable to maintain cryptographic chain integrity
        await logAudit(connection, {
          userId,
          action: action, // <-- Fixed: use actual action (CREATE/UPDATE/DELETE)
          table: 'LOCAL_SYNC_LOGS',
          recordId: syncResult.insertId,
          oldValue: null,
          newValue: {
            client_mutation_id,
            table_name,
            action,
            serverRecordId,
            replay: true,
          },
          ipAddress: req.ip,
        });

        await connection.commit();
        results.push({ client_mutation_id, status: 'synced', serverRecordId });

      } catch (mutationErr) {
        await connection.rollback();
        await connection.query(
          `INSERT INTO LOCAL_SYNC_LOGS 
           (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, sync_status, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'error', ?)`,
          [
            client_mutation_id, userId, device_id || 'CLINIC-DESKTOP', table_name,
            record_uuid || client_mutation_id, action,
            JSON.stringify({ ...payload, dental_chart: undefined }), local_version,
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

// GET /api/sync/status - Sync status telemetry
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sync_status, COUNT(*) as count FROM LOCAL_SYNC_LOGS GROUP BY sync_status`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve sync status.' });
  }
});

export default router;