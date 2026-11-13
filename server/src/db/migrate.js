import { createHash } from 'node:crypto';
import foundation from './migrations/001-foundation.js';
import clinicalDocuments from './migrations/002-clinical-documents.js';
import responders from './migrations/003-qualified-responders.js';
import appointmentDayIndex from './migrations/004-appointment-day-index.js';
import pharmacyActivityIndexes from './migrations/005-pharmacy-activity-indexes.js';
import incidentRecordsPermission from './migrations/006-incident-records-permission.js';
import analyticsScopes from './migrations/007-analytics-scopes.js';
import staffAnalyticsPermissions from './migrations/008-staff-analytics-permissions.js';

const migrations = [foundation, clinicalDocuments, responders, appointmentDayIndex, pharmacyActivityIndexes, incidentRecordsPermission, analyticsScopes, staffAnalyticsPermissions];
const requiredTables = [
  'USERS', 'ROLES', 'USER_ROLES', 'STAFF_PROFILES', 'HEALTH_PROFILES', 'EMERGENCY_ALERTS',
  'PRESCRIPTIONS', 'PRESCRIPTION_ITEMS', 'INVENTORY_LOGS', 'MEDICAL_CLEARANCES', 'AUDIT_LOGS', 'APPOINTMENTS',
];

async function initializeLedger(connection) {
  const [tables] = await connection.query(
    'SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)',
    [[...requiredTables, 'SCHEMA_MIGRATIONS']],
  );
  const engines = new Map(tables.map(row => [row.TABLE_NAME, row.ENGINE]));
  const invalid = requiredTables.filter(table => engines.get(table) !== 'InnoDB');
  if (invalid.length) {
    throw new Error('Missing or incompatible base tables: ' + invalid.join(', ') +
      '. Provision an empty database from schema.sql or repair the existing database before migrating.');
  }
  if (engines.has('SCHEMA_MIGRATIONS')) {
    if (engines.get('SCHEMA_MIGRATIONS') !== 'InnoDB') throw new Error('SCHEMA_MIGRATIONS must use InnoDB.');
    return;
  }
  await connection.query(`
    CREATE TABLE SCHEMA_MIGRATIONS (
      version INT UNSIGNED NOT NULL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      context JSON NOT NULL,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_at DATETIME NULL DEFAULT NULL
    ) ENGINE=InnoDB
  `);
}

async function applyMigration(connection, migration, entry) {
  let context;
  if (entry) {
    context = typeof entry.context === 'string' ? JSON.parse(entry.context) : entry.context;
  } else {
    context = await migration.prepare?.(connection) ?? {};
    await connection.query(
      'INSERT INTO SCHEMA_MIGRATIONS (version, name, context) VALUES (?, ?, ?)',
      [migration.version, migration.name, JSON.stringify(context)],
    );
  }

  // DDL can commit implicitly. Keep it outside the transaction that finalizes
  // the migration. Persist the backfill decision before changing the schema.
  await migration.schema(connection);
  await connection.beginTransaction();
  try {
    await migration.data?.(connection, context);
    await connection.query(
      'UPDATE SCHEMA_MIGRATIONS SET applied_at = CURRENT_TIMESTAMP WHERE version = ? AND applied_at IS NULL',
      [migration.version],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function runMigrations(pool) {
  const connection = await pool.getConnection();
  let lockName;
  let locked = false;
  let reusable = true;
  let completed = false;
  try {
    const [[{ databaseName }]] = await connection.query('SELECT DATABASE() AS databaseName');
    if (!databaseName) throw new Error('Select a database before running migrations.');
    lockName = 'valetudo-migrate:' + createHash('sha1').update(databaseName.toLowerCase()).digest('hex');
    reusable = false;
    const [[{ acquired }]] = await connection.query('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
    locked = acquired === 1;
    reusable = true;
    if (!locked) throw new Error('Could not acquire the database migration lock.');

    await initializeLedger(connection);
    const [entries] = await connection.query(
      'SELECT version, name, context, applied_at FROM SCHEMA_MIGRATIONS ORDER BY version',
    );
    entries.forEach((entry, index) => {
      const expected = migrations[index];
      if (!expected || entry.version !== expected.version || entry.name !== expected.name ||
          (!entry.applied_at && index < entries.length - 1)) {
        throw new Error('Unexpected migration history at version ' + entry.version + '.');
      }
    });
    let applied = 0;
    for (const [index, migration] of migrations.entries()) {
      const entry = entries[index];
      if (entry?.applied_at) continue;
      try {
        await applyMigration(connection, migration, entry);
        applied += 1;
        console.log('[migrate] Applied ' + migration.version + ' ' + migration.name);
      } catch (cause) {
        throw new Error('Migration ' + migration.version + ' (' + migration.name + ') failed.', { cause });
      }
    }
    completed = true;
    return applied;
  } finally {
    if (locked) {
      try {
        const [[{ released }]] = await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
        reusable = released === 1;
      } catch {
        reusable = false;
      }
    }
    if (reusable && completed) connection.release();
    else connection.destroy();
  }
}
