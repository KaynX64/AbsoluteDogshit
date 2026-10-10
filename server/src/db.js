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
      { table: 'MEDICAL_CLEARANCES', column: 'pdf_s3_key', type: 'VARCHAR(500) NULL' },
      { table: 'MEDICAL_CLEARANCES', column: 'version', type: 'INT NOT NULL DEFAULT 1' },
      { table: 'MEDICAL_CLEARANCES', column: 'deleted_at', type: 'TIMESTAMP NULL DEFAULT NULL' },
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

  } catch (err) {
    console.warn('⚠️ [Auto-Migration Warning]:', err.message);
  }
}