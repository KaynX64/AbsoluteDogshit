const { insertMutation, importLegacyQueue, unassignedAppointments, assignLegacyAppointments } = require('./queue.cjs');

function registerOfflineHandlers(ipcMain, sqliteDb) {
  const sessions = new WeakMap();
  const owner = event => sessions.get(event.sender);
  const requireDatabase = () => {
    if (!sqliteDb) throw new Error('Encrypted offline storage is unavailable. Offline changes cannot be saved.');
  };
  ipcMain.handle('offline-set-account', (event, userId) => {
    if (Number.isSafeInteger(userId) && userId > 0) sessions.set(event.sender, userId);
    else sessions.delete(event.sender);
  });
  ipcMain.handle('offline-import-legacy', (_event, rows) => {
    requireDatabase();
    importLegacyQueue(sqliteDb, rows);
  });
  ipcMain.handle('offline-unassigned-appointments', event => {
    requireDatabase();
    return owner(event) ? unassignedAppointments(sqliteDb) : [];
  });
  ipcMain.handle('offline-assign-legacy', (event, { userId, ids }) => {
    requireDatabase();
    if (owner(event) !== userId || !Array.isArray(ids) || ids.length > 100 ||
        ids.some(id => !Number.isSafeInteger(id) || id <= 0)) return;
    assignLegacyAppointments(sqliteDb, userId, ids);
  });
  ipcMain.handle('offline-pending-count', event => {
    requireDatabase();
    if (!owner(event)) return { pending: 0, needsReview: 0, unassigned: 0 };
    return sqliteDb.prepare(`
      SELECT COUNT(CASE WHEN user_id <> 0 AND sync_status = 'pending' THEN 1 END) AS pending,
             COUNT(CASE WHEN user_id <> 0 AND sync_status IN ('conflict', 'error') THEN 1 END) AS needsReview,
             COUNT(CASE WHEN user_id = 0 THEN 1 END) AS unassigned
      FROM LOCAL_SYNC_LOGS WHERE (user_id = ? OR user_id = 0) AND sync_status <> 'synced'
    `).get(owner(event));
  });
  // ── IPC Handlers for SQLite Offline Sync ──────────────────────────────
  ipcMain.handle('offline-queue-mutation', async (event, mutation) => {
    requireDatabase();
    const userId = owner(event);
    if (!userId || userId !== mutation?.user_id) throw new Error('Sign in to save offline changes.');
    if (mutation.table_name !== 'EMR_RECORDS' || mutation.action !== 'CREATE') {
      throw new Error('Unsupported offline change.');
    }
    sqliteDb.transaction(() => insertMutation(sqliteDb, mutation, userId))();
    return { success: true };
  });

  ipcMain.handle('offline-get-pending-mutations', (event, limit = 25) => {
    requireDatabase();
    const userId = owner(event);
    if (!userId) return [];
    const rows = sqliteDb.prepare(`
      SELECT client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, created_at
      FROM LOCAL_SYNC_LOGS WHERE user_id = ? AND sync_status = 'pending'
      ORDER BY sync_id ASC LIMIT ?
    `).all(userId, Number.isInteger(limit) && limit >= 1 && limit <= 25 ? limit : 25);
    return rows.map(row => ({ ...row, payload: JSON.parse(row.payload) }));
  });

  ipcMain.handle('offline-mark-synced', (event, { client_mutation_id, server_record_id, user_id }) => {
    requireDatabase();
    if (!user_id || owner(event) !== user_id) return { success: false };
    sqliteDb.transaction(() => {
      const entry = sqliteDb.prepare(`
        UPDATE LOCAL_SYNC_LOGS SET sync_status = 'synced', record_id = ?, synced_at = CURRENT_TIMESTAMP, payload = '{}'
        WHERE client_mutation_id = ? AND user_id = ? AND sync_status = 'pending' RETURNING record_uuid
      `).get(server_record_id ?? null, client_mutation_id, user_id);
      // Canonical rows arrive via bootstrap. Remove the local duplicate only after acknowledgement.
      if (entry) sqliteDb.prepare('DELETE FROM CACHED_EMR_RECORDS WHERE record_uuid = ? AND doctor_user_id = ? AND is_draft = 1')
        .run(entry.record_uuid, user_id);
    })();
    return { success: true };
  });

  ipcMain.handle('offline-mark-failed', (event, { client_mutation_id, sync_status, user_id }) => {
    requireDatabase();
    if (!user_id || owner(event) !== user_id) return { success: false };
    sqliteDb.prepare(`
      UPDATE LOCAL_SYNC_LOGS SET sync_status = ?, error_message = NULL
      WHERE client_mutation_id = ? AND user_id = ? AND sync_status = 'pending'
    `).run(sync_status === 'conflict' ? 'conflict' : 'error', client_mutation_id, user_id);
    return { success: true };
  });

  ipcMain.handle('offline-cache-bootstrap', async (event, { patients, emrRecords }) => {
    if (!sqliteDb || !owner(event)) return { success: false };
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
      console.error('[SQLite Bootstrap Error]:', err.code || err.name);
      return { success: false };
    }
  });

  ipcMain.handle('offline-get-emr-history', async (event, patientUserId) => {
    if (!sqliteDb || !owner(event)) return [];
    try {
      const stmt = sqliteDb.prepare(`
        SELECT record_uuid, emr_id, patient_user_id, doctor_name, encounter_date, chief_complaint, diagnosis, treatment_plan, notes, vitals_json, is_draft
        FROM CACHED_EMR_RECORDS
        WHERE patient_user_id = ? AND (is_draft = 0 OR doctor_user_id = ?)
        ORDER BY encounter_date DESC
      `);
      const rows = stmt.all(Number(patientUserId), owner(event));
      return rows.map((r) => ({
        ...r,
        vitals: r.vitals_json ? JSON.parse(r.vitals_json) : {},
      }));
    } catch (err) {
      console.error('[SQLite EMR Fetch Error]:', err.code || err.name);
      return [];
    }
  });

  ipcMain.handle('offline-search-patients', async (event, query) => {
    if (!sqliteDb || !owner(event)) return [];
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
