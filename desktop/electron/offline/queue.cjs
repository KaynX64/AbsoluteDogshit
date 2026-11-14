function insertMutation(db, mutation, userId, { restoreLegacy = false } = {}) {
  const { client_mutation_id, device_id, table_name, record_uuid, action, payload, local_version, created_at } = mutation;
  const inserted = db.prepare(`
    INSERT INTO LOCAL_SYNC_LOGS
      (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    ON CONFLICT(client_mutation_id) DO NOTHING
  `).run(client_mutation_id, userId, device_id || 'CLINIC-DESKTOP', table_name, record_uuid, action,
    JSON.stringify(payload), local_version || 1, created_at || null);
  if (!inserted.changes || table_name !== 'EMR_RECORDS' || action !== 'CREATE') return;
  if (restoreLegacy && (!payload.patient_user_id || typeof payload.chief_complaint !== 'string' ||
      typeof payload.diagnosis !== 'string')) return;

  db.prepare(`
    INSERT INTO CACHED_EMR_RECORDS
      (record_uuid, patient_user_id, doctor_user_id, doctor_name, encounter_date,
       chief_complaint, diagnosis, treatment_plan, notes, vitals_json, is_draft)
    VALUES (?, ?, ?, 'Attending Physician (Offline)', COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, 1)
    ON CONFLICT(record_uuid) DO NOTHING
  `).run(record_uuid, payload.patient_user_id, userId, created_at || null,
    payload.chief_complaint, payload.diagnosis, payload.treatment_plan || '',
    payload.notes || '', JSON.stringify(payload.vitals || {}));
}

function discardSyncedPayloads(db) {
  db.transaction(() => {
    db.prepare(`
      DELETE FROM CACHED_EMR_RECORDS WHERE is_draft = 1 AND record_uuid IN
        (SELECT record_uuid FROM LOCAL_SYNC_LOGS WHERE sync_status = 'synced')
    `).run();
    db.prepare("UPDATE LOCAL_SYNC_LOGS SET payload = '{}' WHERE sync_status = 'synced' AND payload <> '{}'").run();
  })();
}

function importLegacyQueue(db, mutations) {
  if (!Array.isArray(mutations)) throw new Error('The previous offline queue is unreadable.');
  db.transaction(() => {
    for (const mutation of mutations) {
      if (!mutation?.client_mutation_id || !mutation.payload || typeof mutation.payload !== 'object') {
        throw new Error('A previous offline change could not be imported.');
      }
      const userId = Number(mutation.user_id);
      insertMutation(db, mutation, Number.isSafeInteger(userId) && userId > 0 ? userId : 0, { restoreLegacy: true });
    }
  })();
}

function unassignedAppointments(db) {
  return db.prepare(`
    SELECT DISTINCT CAST(json_extract(payload, '$.appointment_id') AS INTEGER) AS id
    FROM LOCAL_SYNC_LOGS
    WHERE user_id = 0 AND sync_status = 'pending' AND table_name = 'EMR_RECORDS' AND action = 'CREATE'
      AND json_valid(payload)
  `).all().map(row => row.id).filter(id => Number.isSafeInteger(id) && id > 0);
}

function assignLegacyAppointments(db, userId, appointmentIds) {
  const updateDraft = db.prepare('UPDATE CACHED_EMR_RECORDS SET doctor_user_id = ? WHERE record_uuid = ? AND is_draft = 1 AND doctor_user_id = 0');
  const claim = db.prepare(`
    UPDATE LOCAL_SYNC_LOGS SET user_id = ?
    WHERE user_id = 0 AND sync_status = 'pending' AND table_name = 'EMR_RECORDS' AND action = 'CREATE'
      AND CAST(json_extract(payload, '$.appointment_id') AS INTEGER) = ?
    RETURNING record_uuid
  `);
  db.transaction(() => {
    for (const id of appointmentIds) for (const row of claim.all(userId, id)) updateDraft.run(userId, row.record_uuid);
  })();
}

module.exports = { insertMutation, discardSyncedPayloads, importLegacyQueue, unassignedAppointments, assignLegacyAppointments };
