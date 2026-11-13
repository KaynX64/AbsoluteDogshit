function registerOfflineHandlers(ipcMain, sqliteDb) {
  // ── IPC Handlers for SQLite Offline Sync ──────────────────────────────
  ipcMain.handle('offline-queue-mutation', async (event, mutation) => {
    if (!sqliteDb) return { success: false, error: 'Database not initialized' };
    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO LOCAL_SYNC_LOGS
          (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `);
      stmt.run(
        mutation.client_mutation_id,
        mutation.user_id || 0,
        mutation.device_id || 'CLINIC-DESKTOP',
        mutation.table_name,
        mutation.record_uuid,
        mutation.action,
        JSON.stringify(mutation.payload),
        mutation.local_version || 1
      );

      // If writing an EMR encounter offline, store locally in EMR cache as an offline draft
      if (mutation.table_name === 'EMR_RECORDS' && mutation.action === 'CREATE') {
        const p = mutation.payload;
        const emrStmt = sqliteDb.prepare(`
          INSERT OR REPLACE INTO CACHED_EMR_RECORDS
            (record_uuid, patient_user_id, doctor_user_id, doctor_name, encounter_date, chief_complaint, diagnosis, treatment_plan, notes, vitals_json, is_draft)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 1)
        `);
        emrStmt.run(
          mutation.record_uuid,
          p.patient_user_id,
          mutation.user_id || 0,
          'Attending Physician (Offline)',
          p.chief_complaint,
          p.diagnosis,
          p.treatment_plan || '',
          p.notes || '',
          JSON.stringify(p.vitals || {})
        );
      }

      return { success: true };
    } catch (err) {
      console.error('[SQLite Queue Error]:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('offline-get-pending-mutations', async () => {
    if (!sqliteDb) return [];
    try {
      const stmt = sqliteDb.prepare(`
        SELECT client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, created_at
        FROM LOCAL_SYNC_LOGS
        WHERE sync_status = 'pending'
        ORDER BY sync_id ASC
      `);
      const rows = stmt.all();
      return rows.map((r) => ({
        ...r,
        payload: JSON.parse(r.payload),
      }));
    } catch (err) {
      console.error('[SQLite Pending Error]:', err);
      return [];
    }
  });

  ipcMain.handle('offline-mark-synced', async (event, { client_mutation_id, server_record_id }) => {
    if (!sqliteDb) return { success: false };
    try {
      const stmt = sqliteDb.prepare(`
        UPDATE LOCAL_SYNC_LOGS
        SET sync_status = 'synced', record_id = ?, synced_at = CURRENT_TIMESTAMP
        WHERE client_mutation_id = ?
      `);
      stmt.run(server_record_id || null, client_mutation_id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('offline-mark-failed', async (event, { client_mutation_id, sync_status, error_message }) => {
    if (!sqliteDb) return { success: false };
    try {
      // Update the status to 'conflict' or 'error' so it's no longer fetched as 'pending'
      const stmt = sqliteDb.prepare(`
        UPDATE LOCAL_SYNC_LOGS
        SET sync_status = ?, error_message = ?
        WHERE client_mutation_id = ?
      `);
      stmt.run(sync_status || 'error', error_message || 'Failed', client_mutation_id);
      return { success: true };
    } catch (err) {
      console.error('[SQLite Mark Failed Error]:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('offline-cache-bootstrap', async (event, { patients, emrRecords }) => {
    if (!sqliteDb) return { success: false };
    let transactionOpen = false;
    try {
      sqliteDb.exec('BEGIN IMMEDIATE');
      transactionOpen = true;
      if (Array.isArray(patients)) {
        const pStmt = sqliteDb.prepare(`
          INSERT OR REPLACE INTO CACHED_PATIENTS
            (user_id, student_no, first_name, last_name, email, phone, course, year_level, blood_type, allergies, chronic_conditions, cached_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        for (const p of patients) {
          pStmt.run(
            p.user_id, p.student_no, p.first_name, p.last_name, p.email,
            p.phone, p.course, p.year_level, p.blood_type, p.allergies, p.chronic_conditions
          );
        }
      }

      if (Array.isArray(emrRecords)) {
        const eStmt = sqliteDb.prepare(`
          INSERT OR REPLACE INTO CACHED_EMR_RECORDS
            (record_uuid, emr_id, patient_user_id, doctor_user_id, doctor_name, encounter_date, chief_complaint, diagnosis, treatment_plan, notes, vitals_json, is_draft, cached_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
        `);
        for (const e of emrRecords) {
          eStmt.run(
            e.record_uuid || `SRV-${e.emr_id}`,
            e.emr_id,
            e.patient_user_id,
            e.doctor_user_id,
            e.doctor_name || 'Clinic Physician',
            e.encounter_date,
            e.chief_complaint,
            e.diagnosis,
            e.treatment_plan || '',
            e.notes || '',
            JSON.stringify(e.vitals || {})
          );
        }
      }

      sqliteDb.exec('COMMIT');
      return { success: true };
    } catch (err) {
      if (transactionOpen) {
        try {
          sqliteDb.exec('ROLLBACK');
        } catch (rollbackError) {
          console.error('[SQLite Bootstrap Rollback Error]:', rollbackError.code);
        }
      }
      console.error('[SQLite Bootstrap Error]:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('offline-get-emr-history', async (event, patientUserId) => {
    if (!sqliteDb) return [];
    try {
      const stmt = sqliteDb.prepare(`
        SELECT record_uuid, emr_id, patient_user_id, doctor_name, encounter_date, chief_complaint, diagnosis, treatment_plan, notes, vitals_json, is_draft
        FROM CACHED_EMR_RECORDS
        WHERE patient_user_id = ?
        ORDER BY encounter_date DESC
      `);
      const rows = stmt.all(Number(patientUserId));
      return rows.map((r) => ({
        ...r,
        vitals: r.vitals_json ? JSON.parse(r.vitals_json) : {},
      }));
    } catch (err) {
      console.error('[SQLite EMR Fetch Error]:', err);
      return [];
    }
  });

  ipcMain.handle('offline-search-patients', async (event, query) => {
    if (!sqliteDb) return [];
    try {
      const q = `%${(query || '').trim()}%`;
      const stmt = sqliteDb.prepare(`
        SELECT user_id, student_no, first_name, last_name, email, phone, course, blood_type, allergies, chronic_conditions
        FROM CACHED_PATIENTS
        WHERE student_no LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
        LIMIT 25
      `);
      return stmt.all(q, q, q, q);
    } catch (err) {
      return [];
    }
  });
}

module.exports = { registerOfflineHandlers };
