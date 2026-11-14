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

async function fixture(t, provision = true) {
  const database = 'vhl_migrate_test_' + randomUUID().replaceAll('-', '');
  const options = { host: '127.0.0.1', port, user: 'root', password: process.env.VALETUDO_MIGRATION_TEST_PASSWORD || '' };
  const admin = await mysql.createConnection({ ...options, multipleStatements: true });
  const pool = mysql.createPool({ ...options, database, connectionLimit: 3 });
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

async function responderFlag(pool) {
  const [[row]] = await pool.query('SELECT is_qualified_responder FROM USERS WHERE user_id = 4');
  return row.is_qualified_responder;
}

async function foundationSchema(pool) {
  const definitions = {};
  for (const table of ['SERVER_POLICY', 'QUEUE_TICKET_COUNTERS', 'ADMIN_PERMISSIONS', 'USER_ADMIN_PERMISSIONS', 'INCIDENT_REPORTS']) {
    const [[definition]] = await pool.query('SHOW CREATE TABLE ??', [table]);
    definitions[table] = definition['Create Table'].replace(/ AUTO_INCREMENT=\d+/g, '');
  }
  return definitions;
}

test('fresh schema is adopted once even when two migration runners start together', { skip }, async t => {
  const pool = await fixture(t);
  const applied = await Promise.all([runMigrations(pool), runMigrations(pool)]);
  assert.deepEqual(applied.sort(), [0, 9]);
  assert.equal(await responderFlag(pool), 1);
  const readOnlyPool = {
    async getConnection() {
      const connection = await pool.getConnection();
      return {
        async query(sql, params) {
          assert.match(sql.trim(), /^SELECT\b/, 'Already migrated databases must use only read queries');
          return connection.query(sql, params);
        },
        release: () => connection.release(),
        destroy: () => connection.destroy(),
      };
    },
  };
  assert.equal(await runMigrations(readOnlyPool), 0);
});

test('an existing schema keeps revoked responders, admin grants and saved policy', { skip }, async t => {
  const pool = await fixture(t);
  await pool.query('UPDATE USERS SET is_qualified_responder = 0, qualified_responder_since = NULL WHERE user_id = 4');
  await pool.query("INSERT INTO USER_ADMIN_PERMISSIONS (user_id, permission_id) SELECT 1, permission_id FROM ADMIN_PERMISSIONS WHERE code = 'USERS_MANAGE'");
  await pool.query("INSERT INTO USER_ADMIN_PERMISSIONS (user_id, permission_id) SELECT 1, permission_id FROM ADMIN_PERMISSIONS WHERE code = 'ANALYTICS_VIEW'");
  await pool.query("DELETE FROM ADMIN_PERMISSIONS WHERE code IN ('ANALYTICS_OPERATIONS', 'ANALYTICS_CLINICAL', 'ANALYTICS_PHARMACY', 'ANALYTICS_HEADCOUNT', 'ANALYTICS_EXPORT')");
  await pool.query("DELETE FROM ADMIN_PERMISSIONS WHERE code = 'INCIDENT_RECORDS_VIEW'");
  await pool.query('UPDATE SERVER_POLICY SET revision = 4 WHERE policy_id = 1');
  await pool.query('DROP TABLE STAFF_ANALYTICS_PERMISSIONS');
  assert.equal(await runMigrations(pool), 9);
  const [[staffSettings]] = await pool.query('SELECT COUNT(*) AS total FROM STAFF_ANALYTICS_PERMISSIONS');
  assert.equal(staffSettings.total, 0);
  assert.equal(await responderFlag(pool), 0);
  const [[{ revision }]] = await pool.query('SELECT revision FROM SERVER_POLICY WHERE policy_id = 1');
  const [[{ grants }]] = await pool.query('SELECT COUNT(*) AS grants FROM USER_ADMIN_PERMISSIONS WHERE user_id = 1');
  assert.equal(revision, 4);
  assert.equal(grants, 3);
  const [codes] = await pool.query(`SELECT p.code FROM ADMIN_PERMISSIONS p
    JOIN USER_ADMIN_PERMISSIONS g ON g.permission_id = p.permission_id WHERE g.user_id = 1 ORDER BY p.code`);
  assert.deepEqual(codes.map(({ code }) => code), ['ANALYTICS_HEADCOUNT', 'ANALYTICS_VIEW', 'USERS_MANAGE']);
  await pool.query(`DELETE g FROM USER_ADMIN_PERMISSIONS g JOIN ADMIN_PERMISSIONS p USING (permission_id)
    WHERE g.user_id = 1 AND p.code = 'ANALYTICS_HEADCOUNT'`);
  assert.equal(await runMigrations(pool), 0);
  const [[remaining]] = await pool.query('SELECT COUNT(*) AS count FROM USER_ADMIN_PERMISSIONS WHERE user_id = 1');
  assert.equal(remaining.count, 2);
  const [[permission]] = await pool.query("SELECT name FROM ADMIN_PERMISSIONS WHERE code = 'INCIDENT_RECORDS_VIEW'");
  assert.equal(permission.name, 'View incident records');
});

test('legacy tables and columns are rebuilt additively and the responder backfill runs once', { skip }, async t => {
  const pool = await fixture(t);
  const freshFoundation = await foundationSchema(pool);
  for (const sql of [
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
  await pool.query("INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, chief_complaint, diagnosis) VALUES (5, 2, 'fixture', 'fixture')");
  await pool.query("INSERT INTO PRESCRIPTIONS (emr_id, patient_user_id, doctor_user_id, qr_token) VALUES (1, 5, 2, 'migration-fixture')");
  await pool.query(`INSERT INTO PRESCRIPTION_ITEMS
    (prescription_id, outside_name, dosage, frequency, duration_days, quantity_dispensed)
    VALUES (1, 'fixture', 'fixture', 'fixture', 1, 4)`);
  assert.equal(await runMigrations(pool), 9);
  const [dayIndex] = await pool.query("SHOW INDEX FROM APPOINTMENTS WHERE Key_name = 'idx_app_status_datetime'");
  assert.deepEqual(dayIndex.map(row => row.Column_name), ['status', 'date_time', 'deleted_at']);
  const [activityIndex] = await pool.query("SHOW INDEX FROM INVENTORY_LOGS WHERE Key_name = 'idx_inv_activity_date'");
  assert.deepEqual(activityIndex.map(row => row.Column_name), ['transaction_type', 'created_at']);
  const [issuedIndex] = await pool.query("SHOW INDEX FROM PRESCRIPTIONS WHERE Key_name = 'idx_rx_issued_at'");
  assert.deepEqual(issuedIndex.map(row => row.Column_name), ['issued_at']);
  const migratedFoundation = await foundationSchema(pool);
  // InnoDB can place an ALTER-added index after implicit foreign-key indexes.
  const sortIndexes = ddl => ddl.split('\n').sort().join('\n');
  assert.deepEqual(Object.fromEntries(Object.entries(migratedFoundation).map(([key, ddl]) => [key, sortIndexes(ddl)])),
    Object.fromEntries(Object.entries(freshFoundation).map(([key, ddl]) => [key, sortIndexes(ddl)])));
  assert.equal(await responderFlag(pool), 1);
  const [[{ quantity_prescribed }]] = await pool.query('SELECT quantity_prescribed FROM PRESCRIPTION_ITEMS');
  const [[{ expiryDays }]] = await pool.query('SELECT DATEDIFF(expires_at, issued_at) AS expiryDays FROM PRESCRIPTIONS');
  assert.equal(quantity_prescribed, 4);
  assert.equal(expiryDays, 30);
  await pool.query('UPDATE USERS SET is_qualified_responder = 0 WHERE user_id = 4');
  assert.equal(await runMigrations(pool), 0);
  assert.equal(await responderFlag(pool), 0);
});

test('an interrupted responder schema change resumes with its original backfill decision', { skip }, async t => {
  const pool = await fixture(t);
  await pool.query('ALTER TABLE INCIDENT_REPORTS DROP INDEX idx_pending_pdf, DROP COLUMN pdf_s3_key');
  await pool.query('ALTER TABLE USERS DROP INDEX idx_users_qualified_responder, DROP COLUMN is_qualified_responder');
  const interruptingPool = {
    async getConnection() {
      const connection = await pool.getConnection();
      const query = connection.query.bind(connection);
      connection.query = (sql, params) => {
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
  assert.equal(await runMigrations(pool), 7);
  assert.equal(await responderFlag(pool), 1);
});

test('an unprovisioned database fails before writing a migration ledger', { skip }, async t => {
  const pool = await fixture(t, false);
  await assert.rejects(runMigrations(pool), /Missing or incompatible base tables/);
  const [tables] = await pool.query('SHOW TABLES');
  assert.deepEqual(tables, []);
});
