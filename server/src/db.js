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
    // ── Qualified Responder flag: one-time legacy backfill marker ─────────
    // Existing EMERGENCY_RESPONDER accounts are flagged on the FIRST boot
    // that introduces the column. The marker must be resolved BEFORE the
    // column-creation loop below adds the column — running the backfill on
    // every boot would silently re-flag anyone an admin later revoked.
    let qrBackfillNeeded = false;
    try {
      const [qrCol] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'USERS' AND COLUMN_NAME = 'is_qualified_responder'`
      );
      qrBackfillNeeded = qrCol.length === 0;
    } catch (_) {}

    const columnsToCheck = [
      { table: 'PRESCRIPTIONS', column: 'signature_metadata', type: 'JSON NULL' },
      { table: 'PRESCRIPTIONS', column: 'pdf_s3_key', type: 'VARCHAR(500) NULL' },
      { table: 'PRESCRIPTIONS', column: 'expires_at', type: 'DATE NULL' },
      { table: 'PRESCRIPTIONS', column: 'version', type: 'INT NOT NULL DEFAULT 1' },
      { table: 'PRESCRIPTIONS', column: 'deleted_at', type: 'TIMESTAMP NULL DEFAULT NULL' },
      // Outside-drug prescriptions: free-text medication name for items not
      // stocked in the infirmary formulary (medicine_id is NULL for these).
      { table: 'PRESCRIPTION_ITEMS', column: 'outside_name', type: "VARCHAR(200) NULL COMMENT 'Free-text drug name for outside (non-formulary) items'" },
      { table: 'PRESCRIPTION_ITEMS', column: 'quantity_prescribed', type: "INT NOT NULL DEFAULT 1 COMMENT 'Quantity prescribed by clinician'" },
      { table: 'INVENTORY_LOGS', column: 'prescription_item_id', type: 'BIGINT NULL' },
      { table: 'MEDICAL_CLEARANCES', column: 'pdf_s3_key', type: 'VARCHAR(500) NULL' },
      { table: 'MEDICAL_CLEARANCES', column: 'version', type: 'INT NOT NULL DEFAULT 1' },
      { table: 'MEDICAL_CLEARANCES', column: 'deleted_at', type: 'TIMESTAMP NULL DEFAULT NULL' },
      { table: 'STAFF_PROFILES', column: 'signature_s3_key', type: 'VARCHAR(500) NULL' },
      { table: 'STAFF_PROFILES', column: 'signature_sha256', type: 'CHAR(64) NULL' },
      { table: 'STAFF_PROFILES', column: 'signature_updated_at', type: 'TIMESTAMP NULL DEFAULT NULL' },
      { table: 'HEALTH_PROFILES', column: 'sex', type: "ENUM('MALE', 'FEMALE') NULL" },
      { table: 'HEALTH_PROFILES', column: 'date_of_birth', type: 'DATE NULL' },
      {
        table: 'HEALTH_PROFILES',
        column: 'bmi',
        type: `DECIMAL(6,2) GENERATED ALWAYS AS (
          CASE
            WHEN height > 0 AND weight > 0
            THEN ROUND(weight / POW(height / 100, 2), 2)
            ELSE NULL
          END
        ) STORED`,
      },
      // Qualified Responder flag (role-independent, additive to the legacy
      // role-based SOS audience). Column list mirrors schema.sql.
      { table: 'USERS', column: 'is_qualified_responder', type: "TINYINT(1) NOT NULL DEFAULT 0" },
      { table: 'USERS', column: 'qualified_responder_since', type: 'TIMESTAMP NULL DEFAULT NULL' },
      { table: 'USERS', column: 'qualified_responder_note', type: "VARCHAR(150) NULL" },
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

    const [inventoryLogIndex] = await pool.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'INVENTORY_LOGS' AND INDEX_NAME = 'idx_inv_rx_item'`
    );
    if (inventoryLogIndex.length === 0) {
      await pool.query('ALTER TABLE INVENTORY_LOGS ADD INDEX idx_inv_rx_item (prescription_item_id)');
    }

    // ── Qualified Responder: flag lookup index (audience query hot path) ──
    try {
      const [qrIndex] = await pool.query(
        `SELECT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'USERS' AND INDEX_NAME = 'idx_users_qualified_responder'`
      );
      if (qrIndex.length === 0) {
        await pool.query('ALTER TABLE USERS ADD INDEX idx_users_qualified_responder (is_qualified_responder)');
        console.log('📦 [Auto-Migration] Added USERS.idx_users_qualified_responder');
      }
    } catch (qrIdxErr) {
      console.warn('⚠️ [Auto-Migration] USERS qualified-responder index warning:', qrIdxErr.message);
    }

    // ── Qualified Responder: one-time legacy backfill ────────────────────
    // Runs only on the boot that introduced the column (marker resolved at
    // the top of this function). Flags every live EMERGENCY_RESPONDER
    // account so no recipient loses alerts after this release.
    if (qrBackfillNeeded) {
      try {
        const [backfill] = await pool.query(
          `UPDATE USERS u
           SET u.is_qualified_responder = 1,
               u.qualified_responder_since = CURRENT_TIMESTAMP,
               u.qualified_responder_note = 'Migrated from EMERGENCY_RESPONDER role'
           WHERE u.is_qualified_responder = 0
             AND EXISTS (
               SELECT 1 FROM USER_ROLES ur
               INNER JOIN ROLES r ON ur.role_id = r.role_id
               WHERE ur.user_id = u.user_id AND r.code = 'EMERGENCY_RESPONDER'
             )`
        );
        if (backfill.affectedRows > 0) {
          console.log(`📦 [Auto-Migration] Qualified Responder one-time backfill: flagged ${backfill.affectedRows} legacy EMERGENCY_RESPONDER account(s)`);
        }
      } catch (qrErr) {
        console.warn('⚠️ [Auto-Migration] Qualified Responder backfill warning:', qrErr.message);
      }
    }

    const [inventoryLogForeignKey] = await pool.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'INVENTORY_LOGS'
         AND CONSTRAINT_NAME = 'fk_inv_rx_item'`
    );
    if (inventoryLogForeignKey.length === 0) {
      await pool.query(
        `ALTER TABLE INVENTORY_LOGS
         ADD CONSTRAINT fk_inv_rx_item
         FOREIGN KEY (prescription_item_id) REFERENCES PRESCRIPTION_ITEMS (item_id)
         ON DELETE SET NULL`
      );
      console.log('📦 [Auto-Migration] Linked inventory logs to prescription items');
    }

    // ── Backfill PRESCRIPTIONS.expires_at for legacy rows without an expiry ──
    try {
      await pool.query(
        'UPDATE PRESCRIPTIONS SET expires_at = DATE(DATE_ADD(issued_at, INTERVAL 30 DAY)) WHERE expires_at IS NULL'
      );
    } catch (_) {}

    // ── Backfill PRESCRIPTION_ITEMS.quantity_prescribed from quantity_dispensed ──
    try {
      await pool.query(
        'UPDATE PRESCRIPTION_ITEMS SET quantity_prescribed = quantity_dispensed WHERE (quantity_prescribed IS NULL OR quantity_prescribed = 1) AND quantity_dispensed > 1'
      );
    } catch (_) {}

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
        ('RESPONDERS_MANAGE', 'Manage qualified responders', 'Label any account a Qualified Responder: SOS alarms on any role, tiered alert payloads (reduced medical detail for non-clinical responders). Grant together with USERS_MANAGE — the toggle lives in the Users tab.', 45),
        ('ANALYTICS_VIEW',    'View analytics',            'Epidemiological analytics and campus health reports',   50),
        ('DATABASE_MANAGE',   'Database Studio',           'Inspect and maintain raw system records',               60)
      `);
      console.log('📦 [Auto-Migration] Admin archetype permission tables verified');
    } catch (permErr) {
      console.warn('⚠️ [Auto-Migration] Admin permission tables warning:', permErr.message);
    }

    // ── Incident reports: post-resolution documentation ──────────────────
    // One report per SOS alert (UNIQUE alert_id), filed from the desktop
    // console popup after ANY responder closes the incident as resolved.
    // Identity fields are pre-fetched live at popup time — only the
    // narrative, treatment notes and confirmed resolution time are stored.
    // Mirrors schema.sql (25. INCIDENT_REPORTS).
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS INCIDENT_REPORTS (
          report_id BIGINT AUTO_INCREMENT PRIMARY KEY,
          alert_id BIGINT NOT NULL UNIQUE,
          patient_user_id BIGINT NOT NULL,
          resolved_at DATETIME NOT NULL,
          incident_details TEXT NOT NULL,
          treatment_notes TEXT NULL,
          documented_by BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_ir_alert FOREIGN KEY (alert_id) REFERENCES EMERGENCY_ALERTS (alert_id) ON DELETE CASCADE,
          CONSTRAINT fk_ir_patient FOREIGN KEY (patient_user_id) REFERENCES USERS (user_id) ON DELETE CASCADE,
          CONSTRAINT fk_ir_author FOREIGN KEY (documented_by) REFERENCES USERS (user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
      console.log('📦 [Auto-Migration] INCIDENT_REPORTS table verified');
    } catch (irErr) {
      console.warn('⚠️ [Auto-Migration] INCIDENT_REPORTS table warning:', irErr.message);
    }

  } catch (err) {
    console.warn('⚠️ [Auto-Migration Warning]:', err.message);
  }

  // Terminal marker — lets operators (and the verification harness) know
  // the whole pass finished, since /api/ping answers before migrations run.
  console.log('📦 [Auto-Migration] Pass complete');
}
