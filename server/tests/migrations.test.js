// Rehearses fresh, legacy, and interrupted database upgrades against disposable MySQL.

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { runMigrations } from '../src/db/migrate.js';

// Opt in with the published port of a disposable local MySQL 8 container.
const port = Number(process.env.VALETUDO_MIGRATION_TEST_PORT);
const skip = !port && 'Set VALETUDO_MIGRATION_TEST_PORT to rehearse against disposable MySQL';
const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');

// Create a disposable database and optionally load the base schema.
async function fixture(t, provision = true) {
  const database = 'vhl_migrate_test_' + randomUUID().replaceAll('-', '');
  const options = { host: '127.0.0.1', port, user: 'root', password: process.env.VALETUDO_MIGRATION_TEST_PASSWORD || '' };
  const admin = await mysql.createConnection({ ...options, multipleStatements: true });
  const pool = mysql.createPool({ ...options, database, connectionLimit: 3 });
  // Close fixture connections and drop the disposable database after the test.
  t.after(async () => {
    await pool.end();
    try {
      await admin.query('DROP DATABASE IF EXISTS ??', [database]);
    } finally {
      await admin.end();
    }
  });
  if (provision) {
    await admin.query(schema.replaceAll('`valetudo_healthlink`', '`' + database + '`'));
  } else {
    await admin.query('CREATE DATABASE ??', [database]);
  }
  return pool;
}

// Read the test account's current Qualified Responder flag.
async function responderFlag(pool) {
  const [[row]] = await pool.query('SELECT is_qualified_responder FROM USERS WHERE user_id = 4');
  return row.is_qualified_responder;
}

// Capture the DDL for the foundational tables for schema comparison.
async function foundationSchema(pool) {
  const definitions = {};
  for (const table of ['SERVER_POLICY', 'QUEUE_TICKET_COUNTERS', 'ADMIN_PERMISSIONS', 'USER_ADMIN_PERMISSIONS', 'INCIDENT_REPORTS']) {
    const [[definition]] = await pool.query('SHOW CREATE TABLE ??', [table]);
    definitions[table] = definition['Create Table'].replace(/ AUTO_INCREMENT=\d+/g, '');
  }
  return definitions;
}

// Verify that fresh schema is adopted once even when two migration runners start together.
test('migration 015 restores private drafts and history indexes with fresh-schema parity', { skip }, async t => {
  const pool = await fixture(t);
  const definition = async () => (await pool.query(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'INCIDENT_REPORT_DRAFTS' ORDER BY ORDINAL_POSITION`))[0];
  const expected = await definition();
  await pool.query('DROP TABLE INCIDENT_REPORT_DRAFTS');
  await pool.query('ALTER TABLE EMERGENCY_ALERTS DROP INDEX idx_alert_history, DROP INDEX idx_alert_report_work');
  await pool.query('ALTER TABLE INCIDENT_REPORTS DROP INDEX idx_report_history');
  await pool.query('ALTER TABLE AUDIT_LOGS DROP INDEX idx_alert_audit_history');
  const { default: migration } = await import('../src/db/migrations/015-responder-history.js');
  await migration.schema(pool); await migration.schema(pool);
  assert.deepEqual(await definition(), expected);
});

test('fresh schema is adopted once even when two migration runners start together', { skip }, async t => {
  const pool = await fixture(t);
  const [responderProfiles] = await pool.query(`
    SELECT s.admin_no, s.license_no, s.specialty, s.department
    FROM STAFF_PROFILES s
    JOIN USER_ROLES ur ON ur.user_id = s.user_id
    JOIN ROLES r ON r.role_id = ur.role_id
    WHERE r.code = 'EMERGENCY_RESPONDER'
  `);
  assert.deepEqual(responderProfiles, [{
    admin_no: null,
    license_no: null,
    specialty: 'Campus Emergency Response',
    department: 'PSU Lingayen Quick-Response Unit',
  }]);
  const applied = await Promise.all([runMigrations(pool), runMigrations(pool)]);
  assert.deepEqual(applied.sort((a, b) => a - b), [0, 19]);
  assert.equal(await responderFlag(pool), 1);
  const readOnlyPool = {
    // Wrap a fixture connection so completed migrations can only make read queries.
    async getConnection() {
      const connection = await pool.getConnection();
      return {
        // Assert that rerunning completed migrations performs no writes.
        async query(sql, params) {
          assert.match(sql.trim(), /^SELECT\b/, 'Already migrated databases must use only read queries');
          return connection.query(sql, params);
        },
        // Return the wrapped fixture connection to the pool.
        release: () => connection.release(),
        // Forward connection destruction to the underlying fixture connection.
        destroy: () => connection.destroy(),
      };
    },
  };
  assert.equal(await runMigrations(readOnlyPool), 0);
});

test('migration 018 upgrades older appointments without changing their reminder flags', { skip }, async t => {
  const pool = await fixture(t);
  await runMigrations(pool);
  await pool.query('DELETE FROM SCHEMA_MIGRATIONS WHERE version >= 18');
  await pool.query('ALTER TABLE APPOINTMENTS DROP COLUMN last_reminder_lead_minutes');
  await pool.query(`INSERT INTO APPOINTMENTS (patient_user_id, doctor_user_id, date_time, appointment_type, reminder_sent)
    VALUES (5, 2, NOW() + INTERVAL 1 HOUR, 'Medical', TRUE), (5, 2, NOW() + INTERVAL 2 HOUR, 'Medical', FALSE)`);
  assert.equal(await runMigrations(pool), 2);
  assert.equal(await runMigrations(pool), 0);
  const [rows] = await pool.query('SELECT reminder_sent, last_reminder_lead_minutes FROM APPOINTMENTS ORDER BY appointment_id');
  assert.deepEqual(rows, [
    { reminder_sent: 1, last_reminder_lead_minutes: null }, { reminder_sent: 0, last_reminder_lead_minutes: null },
  ]);
});

test('migration 019 identifies demo accounts and enforces unique Google identities', { skip }, async t => {
  const pool = await fixture(t);
  await runMigrations(pool);
  await pool.query('DELETE FROM SCHEMA_MIGRATIONS WHERE version = 19');
  await pool.query('ALTER TABLE USERS DROP INDEX uq_users_google_subject, DROP COLUMN google_subject, DROP COLUMN is_demo_account');
  await pool.query(`INSERT INTO USERS (user_id, email, password_hash, first_name, last_name) VALUES
    (41, 'clinic-blair@example.invalid', 'fixture', 'Blair', 'Synthetic Clinic Demo'),
    (42, 'patient@psu.edu.ph', 'fixture', 'Real', 'Patient')`);
  assert.equal(await runMigrations(pool), 1);
  const [rows] = await pool.query('SELECT user_id, is_demo_account FROM USERS WHERE user_id IN (1, 12, 41, 42) ORDER BY user_id');
  assert.deepEqual(rows.map(row => [Number(row.user_id), row.is_demo_account]), [[1, 1], [12, 1], [41, 1], [42, 0]]);
  await pool.query("UPDATE USERS SET google_subject = 'google-id' WHERE user_id = 42");
  await assert.rejects(pool.query("UPDATE USERS SET google_subject = 'google-id' WHERE user_id = 41"), { code: 'ER_DUP_ENTRY' });
  assert.equal(await runMigrations(pool), 0);
});

test('audit cutover adopts history and rolls the chain head back with its entries', { skip }, async t => {
  const pool = await fixture(t);
  const historicalHash = 'a'.repeat(64);
  await pool.query('DROP TABLE AUDIT_CHAIN_STATE');
  await pool.query("INSERT INTO AUDIT_LOGS (action, table_affected, prev_hash, entry_hash) VALUES ('CREATE', 'FIXTURE', REPEAT('0', 64), ?)", [historicalHash]);
  await runMigrations(pool);
  const { logAudit, logAuditBatch } = await import('../src/utils/auditLogger.js');
  const entry = { userId: 1, action: 'UPDATE', table: 'FIXTURE', recordId: 1 };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await logAudit(connection, entry);
    await connection.rollback();
    await connection.beginTransaction();
    await logAuditBatch(connection, [entry, { ...entry, recordId: 2 }]);
    await connection.commit();
  } finally { connection.release(); }
  const [rows] = await pool.query('SELECT audit_id, entry_hash, prev_hash FROM AUDIT_LOGS ORDER BY audit_id');
  assert.equal(rows.length, 3);
  assert.equal(rows[1].prev_hash, historicalHash);
  assert.equal(rows[2].prev_hash, rows[1].entry_hash);
  assert.equal(await runMigrations(pool), 0);
  await pool.query('UPDATE AUDIT_CHAIN_STATE SET last_audit_id = 1');
  await assert.rejects(runMigrations(pool), /Audit chain state disagrees/);
});

// Verify that replay migration removes legacy payloads and retains duplicate outcomes.
test('replay migration removes legacy payloads and retains duplicate outcomes', { skip }, async t => {
  const pool = await fixture(t);
  await pool.query("ALTER TABLE LOCAL_SYNC_LOGS ADD COLUMN payload JSON NOT NULL, ADD COLUMN error_message TEXT NULL");
  await pool.query(`
    INSERT INTO LOCAL_SYNC_LOGS
      (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload,
       local_version, record_id, sync_status, error_message)
    VALUES ('old-mutation', 2, 'desktop', 'EMR_RECORDS', 'old-record', 'CREATE',
            JSON_OBJECT('notes', 'fixture private text'), 1, 42, 'synced', 'legacy error')
  `);
  assert.equal(await runMigrations(pool), 19);
  const [columns] = await pool.query('SHOW COLUMNS FROM LOCAL_SYNC_LOGS');
  assert.ok(columns.every(/* Check the remaining ledger columns for removed payload and error fields. */ column => !['payload', 'error_message'].includes(column.Field)));
  const [[row]] = await pool.query(`
    SELECT client_mutation_id, user_id, record_id, sync_status FROM LOCAL_SYNC_LOGS
  `);
  assert.deepEqual(row, {
    client_mutation_id: 'old-mutation', user_id: 2, record_id: 42, sync_status: 'synced',
  });
  assert.equal(await runMigrations(pool), 0);
});

// Verify that an existing schema keeps revoked responders, admin grants and saved policy.
test('an existing schema keeps revoked responders, admin grants and saved policy', { skip }, async t => {
  const pool = await fixture(t);
  await pool.query('UPDATE USERS SET is_qualified_responder = 0, qualified_responder_since = NULL WHERE user_id = 4');
  await pool.query("INSERT INTO USER_ADMIN_PERMISSIONS (user_id, permission_id) SELECT 1, permission_id FROM ADMIN_PERMISSIONS WHERE code = 'USERS_MANAGE'");
  await pool.query("INSERT INTO USER_ADMIN_PERMISSIONS (user_id, permission_id) SELECT 1, permission_id FROM ADMIN_PERMISSIONS WHERE code = 'ANALYTICS_VIEW'");
  await pool.query("DELETE FROM ADMIN_PERMISSIONS WHERE code IN ('ANALYTICS_OPERATIONS', 'ANALYTICS_CLINICAL', 'ANALYTICS_PHARMACY', 'ANALYTICS_HEADCOUNT', 'ANALYTICS_EXPORT')");
  await pool.query("DELETE FROM ADMIN_PERMISSIONS WHERE code IN ('INCIDENT_RECORDS_VIEW', 'TERMINAL_VIEW')");
  await pool.query('UPDATE SERVER_POLICY SET revision = 4 WHERE policy_id = 1');
  await pool.query('DROP TABLE STAFF_ANALYTICS_PERMISSIONS');
  assert.equal(await runMigrations(pool), 19);
  const [[terminal]] = await pool.query("SELECT code FROM ADMIN_PERMISSIONS WHERE code = 'TERMINAL_VIEW'");
  assert.equal(terminal.code, 'TERMINAL_VIEW');
  const [[staffSettings]] = await pool.query('SELECT COUNT(*) AS total FROM STAFF_ANALYTICS_PERMISSIONS');
  assert.equal(staffSettings.total, 0);
  assert.equal(await responderFlag(pool), 0);
  const [[{ revision }]] = await pool.query('SELECT revision FROM SERVER_POLICY WHERE policy_id = 1');
  const [[{ grants }]] = await pool.query('SELECT COUNT(*) AS grants FROM USER_ADMIN_PERMISSIONS WHERE user_id = 1');
  assert.equal(revision, 4);
  assert.equal(grants, 3);
  const [codes] = await pool.query(`SELECT p.code FROM ADMIN_PERMISSIONS p
    JOIN USER_ADMIN_PERMISSIONS g ON g.permission_id = p.permission_id WHERE g.user_id = 1 ORDER BY p.code`);
  assert.deepEqual(codes.map(/* Extract the administrator grant codes after migration. */ ({ code }) => code), ['ANALYTICS_HEADCOUNT', 'ANALYTICS_VIEW', 'USERS_MANAGE']);
  await pool.query(`DELETE g FROM USER_ADMIN_PERMISSIONS g JOIN ADMIN_PERMISSIONS p USING (permission_id)
    WHERE g.user_id = 1 AND p.code = 'ANALYTICS_HEADCOUNT'`);
  assert.equal(await runMigrations(pool), 0);
  const [[remaining]] = await pool.query('SELECT COUNT(*) AS count FROM USER_ADMIN_PERMISSIONS WHERE user_id = 1');
  assert.equal(remaining.count, 2);
  const [[permission]] = await pool.query("SELECT name FROM ADMIN_PERMISSIONS WHERE code = 'INCIDENT_RECORDS_VIEW'");
  assert.equal(permission.name, 'View incident records');
});

// Verify that legacy tables and columns are rebuilt additively and the responder backfill runs once.
test('legacy tables and columns are rebuilt additively and the responder backfill runs once', { skip }, async t => {
  const pool = await fixture(t);
  const freshFoundation = await foundationSchema(pool);
  for (const sql of [
    'ALTER TABLE DEVICE_TOKENS DROP INDEX uq_device_installation, DROP COLUMN installation_id, DROP COLUMN sos_mode',
    'ALTER TABLE EMERGENCY_ALERTS DROP COLUMN location_label',
    'ALTER TABLE APPOINTMENTS DROP INDEX idx_app_status_datetime',
    'ALTER TABLE INVENTORY_LOGS DROP INDEX idx_inv_activity_date',
    'ALTER TABLE PRESCRIPTIONS DROP INDEX idx_rx_issued_at',
    'DROP TABLE INCIDENT_REPORTS',
    'DROP TABLE USER_ADMIN_PERMISSIONS',
    'DROP TABLE ADMIN_PERMISSIONS',
    'DROP TABLE QUEUE_TICKET_COUNTERS',
    'DROP TABLE SERVER_POLICY',
    'ALTER TABLE INVENTORY_LOGS DROP FOREIGN KEY fk_inv_rx_item',
    'ALTER TABLE INVENTORY_LOGS DROP INDEX idx_inv_rx_item, DROP COLUMN prescription_item_id',
    'ALTER TABLE PRESCRIPTION_ITEMS DROP COLUMN quantity_prescribed',
    'ALTER TABLE PRESCRIPTIONS DROP COLUMN expires_at',
    'ALTER TABLE USERS DROP INDEX idx_users_qualified_responder, DROP COLUMN is_qualified_responder, DROP COLUMN qualified_responder_since, DROP COLUMN qualified_responder_note',
  ]) await pool.query(sql);
  await pool.query("INSERT INTO DEVICE_TOKENS (user_id, fcm_token) VALUES (4, 'legacy-token')");
  await pool.query("INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, chief_complaint, diagnosis) VALUES (5, 2, 'fixture', 'fixture')");
  await pool.query("INSERT INTO PRESCRIPTIONS (emr_id, patient_user_id, doctor_user_id, qr_token) VALUES (1, 5, 2, 'migration-fixture')");
  await pool.query(`INSERT INTO PRESCRIPTION_ITEMS
    (prescription_id, outside_name, dosage, frequency, duration_days, quantity_dispensed)
    VALUES (1, 'fixture', 'fixture', 'fixture', 1, 4)`);
  assert.equal(await runMigrations(pool), 19);
  const [[legacyDevice]] = await pool.query("SELECT installation_id, sos_mode FROM DEVICE_TOKENS WHERE fcm_token = 'legacy-token'");
  assert.deepEqual(legacyDevice, { installation_id: null, sos_mode: 'on_duty' });
  const [dayIndex] = await pool.query("SHOW INDEX FROM APPOINTMENTS WHERE Key_name = 'idx_app_status_datetime'");
  assert.deepEqual(dayIndex.map(/* Extract indexed column names to verify the appointment-day index order. */ row => row.Column_name), ['status', 'date_time', 'deleted_at']);
  const [activityIndex] = await pool.query("SHOW INDEX FROM INVENTORY_LOGS WHERE Key_name = 'idx_inv_activity_date'");
  assert.deepEqual(activityIndex.map(/* Extract indexed columns for the pharmacy activity index check. */ row => row.Column_name), ['transaction_type', 'created_at']);
  const [issuedIndex] = await pool.query("SHOW INDEX FROM PRESCRIPTIONS WHERE Key_name = 'idx_rx_issued_at'");
  assert.deepEqual(issuedIndex.map(/* Extract indexed columns for the prescription issue date index check. */ row => row.Column_name), ['issued_at']);
  const migratedFoundation = await foundationSchema(pool);
  // InnoDB can place an ALTER-added index after implicit foreign-key indexes.
  const sortIndexes = ddl => ddl.split('\n').sort().join('\n');
  assert.deepEqual(Object.fromEntries(Object.entries(migratedFoundation).map(/* Normalize migrated table definitions for comparison. */ ([key, ddl]) => [key, sortIndexes(ddl)])),
    Object.fromEntries(Object.entries(freshFoundation).map(/* Normalize fresh table definitions for comparison. */ ([key, ddl]) => [key, sortIndexes(ddl)])));
  assert.equal(await responderFlag(pool), 1);
  const [[{ quantity_prescribed }]] = await pool.query('SELECT quantity_prescribed FROM PRESCRIPTION_ITEMS');
  const [[{ expiryDays }]] = await pool.query('SELECT DATEDIFF(expires_at, issued_at) AS expiryDays FROM PRESCRIPTIONS');
  assert.equal(Number(quantity_prescribed), 4);
  assert.equal(expiryDays, 30);
  await pool.query('UPDATE USERS SET is_qualified_responder = 0 WHERE user_id = 4');
  assert.equal(await runMigrations(pool), 0);
  assert.equal(await responderFlag(pool), 0);
});

// Verify that an interrupted responder schema change resumes with its original backfill decision.
test('an interrupted responder schema change resumes with its original backfill decision', { skip }, async t => {
  const pool = await fixture(t);
  await pool.query('ALTER TABLE INCIDENT_REPORTS DROP INDEX idx_pending_pdf, DROP COLUMN pdf_s3_key');
  await pool.query('ALTER TABLE USERS DROP INDEX idx_users_qualified_responder, DROP COLUMN is_qualified_responder');
  const interruptingPool = {
    // Wrap a connection to interrupt the responder migration at a specific schema change.
    async getConnection() {
      const connection = await pool.getConnection();
      const query = connection.query.bind(connection);
      connection.query = /* Simulate failure while adding the responder index and forward other queries. */ (sql, params) => {
        if (sql.includes('ADD INDEX') && params?.[1] === 'idx_users_qualified_responder') throw new Error('fixture interruption');
        return query(sql, params);
      };
      return connection;
    },
  };
  await assert.rejects(runMigrations(interruptingPool), /Migration 3 .* failed/);
  await pool.query('SELECT pdf_s3_key FROM INCIDENT_REPORTS LIMIT 0');
  assert.equal(await responderFlag(pool), 0);
  const [[{ applied_at }]] = await pool.query('SELECT applied_at FROM SCHEMA_MIGRATIONS WHERE version = 3');
  assert.equal(applied_at, null);
  assert.equal(await runMigrations(pool), 17);
  assert.equal(await responderFlag(pool), 1);
});

// Verify that an unprovisioned database fails before writing a migration ledger.
test('an unprovisioned database fails before writing a migration ledger', { skip }, async t => {
  const pool = await fixture(t, false);
  await assert.rejects(runMigrations(pool), /Missing or incompatible base tables/);
  const [tables] = await pool.query('SHOW TABLES');
  assert.deepEqual(tables, []);
});

test('migration 014 adds the SOS scheduler without replaying existing alerts', { skip }, async t => {
  const pool = await fixture(t);
  await pool.query(`ALTER TABLE EMERGENCY_ALERTS ADD INDEX idx_ea_legacy_user (user_id),
    DROP INDEX uq_sos_request, DROP INDEX idx_sos_dispatch,
    DROP COLUMN client_sos_id, DROP COLUMN request_hash, DROP COLUMN dispatch_after`);
  await pool.query("INSERT INTO EMERGENCY_ALERTS (user_id, location) VALUES (5, ST_SRID(POINT(120, 16), 4326))");
  assert.equal(await runMigrations(pool), 19);
  const [[alert]] = await pool.query('SELECT client_sos_id, request_hash, dispatch_after FROM EMERGENCY_ALERTS');
  assert.deepEqual(alert, { client_sos_id: null, request_hash: null, dispatch_after: null });
  assert.equal(await runMigrations(pool), 0);
});

test('migration 013 upgrades a v12 prescription schema to fresh-install parity without rewriting legacy content', { skip }, async t => {
  const pool = await fixture(t);
  const definition = async () => (await pool.query(`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('PRESCRIPTIONS', 'PRESCRIPTION_ITEMS')
    ORDER BY TABLE_NAME, COLUMN_NAME`))[0];
  const fresh = await definition();
  // The fresh schema can use the UUID index to support the doctor FK. V12
  // instead had a doctor-only supporting index before that UUID index existed.
  await pool.query('ALTER TABLE PRESCRIPTIONS ADD INDEX idx_rx_doctor_v12 (doctor_user_id)');
  await pool.query(`ALTER TABLE PRESCRIPTIONS DROP INDEX uq_rx_request, DROP COLUMN contract_version,
    DROP COLUMN issuance_request_id, DROP COLUMN request_hash, DROP COLUMN clinical_snapshot`);
  await pool.query(`ALTER TABLE PRESCRIPTION_ITEMS DROP COLUMN catalog_medicine_id, DROP COLUMN item_sequence,
    DROP COLUMN structured_details, MODIFY COLUMN quantity_prescribed INT NOT NULL DEFAULT 1,
    MODIFY COLUMN duration_days INT NOT NULL`);
  await pool.query("INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, chief_complaint, diagnosis) VALUES (5, 2, 'fixture', 'fixture')");
  await pool.query(`INSERT INTO PRESCRIPTIONS (emr_id, patient_user_id, doctor_user_id, expires_at, qr_token, notes, pdf_s3_key)
    VALUES (1, 5, 2, CURDATE() + INTERVAL 7 DAY, 'legacy-013-fixture', 'Legacy recorded note', 'existing-unchanged.pdf')`);
  await pool.query(`INSERT INTO PRESCRIPTION_ITEMS (prescription_id, outside_name, dosage, frequency, route, duration_days, quantity_prescribed)
    VALUES (1, 'Legacy recorded name', '', '', 'Legacy route', 4, 4)`);
  const { default: migration } = await import('../src/db/migrations/013-structured-prescriptions.js');
  await migration.schema(pool);
  assert.deepEqual(await definition(), fresh);
  await migration.schema(pool);
  const [[header]] = await pool.query('SELECT contract_version, clinical_snapshot, notes, pdf_s3_key FROM PRESCRIPTIONS');
  assert.deepEqual(header, { contract_version: 1, clinical_snapshot: null, notes: 'Legacy recorded note', pdf_s3_key: 'existing-unchanged.pdf' });
  const [[item]] = await pool.query('SELECT dosage, frequency, route, duration_days, quantity_prescribed, structured_details FROM PRESCRIPTION_ITEMS');
  assert.deepEqual(item, { dosage: '', frequency: '', route: 'Legacy route', duration_days: 4, quantity_prescribed: '4.000', structured_details: null });
});
