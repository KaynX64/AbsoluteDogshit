// server/src/db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Helper to ensure critical DB credentials are never silently empty
function getDbPassword() {
  const pw = process.env.DB_PASSWORD || process.env.MYSQL_ROOT_PASSWORD;
  if (!pw) {
    throw new Error(
      '[db] Missing required environment variable: DB_PASSWORD (or MYSQL_ROOT_PASSWORD). ' +
      'Set it in server/.env before starting the server.'
    );
  }
  return pw;
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'root',
  password: getDbPassword(),
  database: process.env.DB_NAME || 'valetudo_healthlink',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
});

/**
 * Automatic lightweight schema migration on boot.
 * Ensures all newly required columns and ENUM values exist in the active MySQL instance.
 */
export async function runAutoMigrations() {
  try {
    const columnsToCheck = [
      { table: 'PRESCRIPTIONS', column: 'signature_metadata', type: 'JSON NULL' },
      { table: 'PRESCRIPTIONS', column: 'pdf_s3_key', type: 'VARCHAR(500) NULL' },
      { table: 'PRESCRIPTIONS', column: 'version', type: 'INT NOT NULL DEFAULT 1' },
      { table: 'PRESCRIPTIONS', column: 'deleted_at', type: 'TIMESTAMP NULL DEFAULT NULL' },
      // Outside-drug prescriptions: free-text medication name for items not
      // stocked in the infirmary formulary (medicine_id is NULL for these).
      { table: 'PRESCRIPTION_ITEMS', column: 'outside_name', type: "VARCHAR(200) NULL COMMENT 'Free-text drug name for outside (non-formulary) items'" },
      { table: 'MEDICAL_CLEARANCES', column: 'pdf_s3_key', type: 'VARCHAR(500) NULL' },
      { table: 'MEDICAL_CLEARANCES', column: 'version', type: 'INT NOT NULL DEFAULT 1' },
      { table: 'MEDICAL_CLEARANCES', column: 'deleted_at', type: 'TIMESTAMP NULL DEFAULT NULL' },
      { table: 'STAFF_PROFILES', column: 'signature_s3_key', type: 'VARCHAR(500) NULL' },
      { table: 'STAFF_PROFILES', column: 'signature_sha256', type: 'CHAR(64) NULL' },
      { table: 'STAFF_PROFILES', column: 'signature_updated_at', type: 'TIMESTAMP NULL DEFAULT NULL' },
    ];

    for (const item of columnsToCheck) {
      const [exists] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [item.table, item.column]
      );

      if (exists.length === 0) {
        await pool.query(`ALTER TABLE \`${item.table}\` ADD COLUMN \`${item.column}\` ${item.type}`);
        console.log(`📦 [Auto-Migration] Added missing column ${item.table}.${item.column}`);
      }
    }

    // ── Allow PRESCRIPTION_ITEMS.medicine_id to be NULL (outside drugs) ─────
    // Outside prescriptions reference no formulary medicine, so the column
    // must be nullable. The FK constraint still holds — MySQL permits NULL
    // child values. Only altered when it is currently NOT NULL, to avoid a
    // needless table rebuild on every boot.
    try {
      const [medIdCol] = await pool.query(
        `SELECT IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PRESCRIPTION_ITEMS' AND COLUMN_NAME = 'medicine_id'`
      );
      if (medIdCol.length > 0 && medIdCol[0].IS_NULLABLE === 'NO') {
        await pool.query('ALTER TABLE PRESCRIPTION_ITEMS MODIFY COLUMN medicine_id BIGINT NULL');
        console.log('📦 [Auto-Migration] PRESCRIPTION_ITEMS.medicine_id is now nullable (outside-drug support)');
      }
    } catch (nullableErr) {
      console.warn('⚠️ [Auto-Migration] PRESCRIPTION_ITEMS.medicine_id nullability check warning:', nullableErr.message);
    }

    // ── Update AUDIT_LOGS.action ENUM to support 'SIGN' and 'REVOKE' ─────────
    try {
      await pool.query(
        `ALTER TABLE AUDIT_LOGS MODIFY COLUMN action ENUM('LOGIN', 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'SIGN', 'REVOKE') NOT NULL`
      );
      console.log(`📦 [Auto-Migration] Updated AUDIT_LOGS.action ENUM to support SIGN and REVOKE`);
    } catch (enumErr) {
      console.warn('⚠️ [Auto-Migration] AUDIT_LOGS ENUM update warning:', enumErr.message);
    }

    // ── Update MEDICAL_CLEARANCES.status ENUM to support 'revoked' ───────────
    try {
      await pool.query(
        `ALTER TABLE MEDICAL_CLEARANCES MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'expired', 'revoked') NOT NULL DEFAULT 'approved'`
      );
    } catch (_) {}

    // ── Admin archetypes: permission catalog + per-user grant tables ─────────
    // ADMIN_PERMISSIONS      → catalog of discrete admin capabilities.
    // USER_ADMIN_PERMISSIONS → grants per ADMIN user. An ADMIN user with no
    // grant rows keeps FULL access (legacy default), so every administrator
    // created before this feature existed is completely unaffected.
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ADMIN_PERMISSIONS (
          permission_id INT AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(60) NOT NULL UNIQUE,
          name VARCHAR(120) NOT NULL,
          description VARCHAR(300) NULL,
          sort_order INT NOT NULL DEFAULT 100
        ) ENGINE=InnoDB
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS USER_ADMIN_PERMISSIONS (
          user_id BIGINT NOT NULL,
          permission_id INT NOT NULL,
          granted_by BIGINT NULL,
          granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, permission_id),
          CONSTRAINT fk_uap_user FOREIGN KEY (user_id) REFERENCES USERS (user_id) ON DELETE CASCADE,
          CONSTRAINT fk_uap_perm FOREIGN KEY (permission_id) REFERENCES ADMIN_PERMISSIONS (permission_id) ON DELETE CASCADE,
          CONSTRAINT fk_uap_grantor FOREIGN KEY (granted_by) REFERENCES USERS (user_id) ON DELETE SET NULL
        ) ENGINE=InnoDB
      `);
      // Idempotent catalog seed (INSERT IGNORE on the UNIQUE code)
      await pool.query(`
        INSERT IGNORE INTO ADMIN_PERMISSIONS (code, name, description, sort_order) VALUES
        ('SUPER_ADMIN',       'Super Admin',               'Unrestricted access to every admin console capability', 0),
        ('USERS_MANAGE',      'Manage user accounts',      'Create, edit, reset passwords and assign roles',        10),
        ('AUDIT_VIEW',        'View audit & PHI logs',     'Read-only access to the audit ledger and PHI access log', 20),
        ('TELEMETRY_VIEW',    'View system health',        'Service telemetry, uptime and health metrics',          30),
        ('RETENTION_MANAGE',  'Data retention governance', 'Retention status and statutory R.A. 10173 sweeps',       40),
        ('ANALYTICS_VIEW',    'View analytics',            'Epidemiological analytics and campus health reports',   50),
        ('DATABASE_MANAGE',   'Database Studio',           'Inspect and maintain raw system records',               60)
      `);
      console.log('📦 [Auto-Migration] Admin archetype permission tables verified');
    } catch (permErr) {
      console.warn('⚠️ [Auto-Migration] Admin permission tables warning:', permErr.message);
    }

  } catch (err) {
    console.warn('⚠️ [Auto-Migration Warning]:', err.message);
  }
}
