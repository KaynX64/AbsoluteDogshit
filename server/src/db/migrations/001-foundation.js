// Creates the baseline policy, queue counter, admin grant, and incident report structures for older databases.

import { ensureColumns } from './schema.js';

export default {
  version: 1,
  name: 'operational and admin tables',
  async schema(connection) {
    await ensureColumns(connection, [
      { table: 'USERS', column: 'theme_mode', type: "ENUM('light','dark') NOT NULL DEFAULT 'light'" },
      { table: 'USERS', column: 'theme_preset', type: "ENUM('brand','blossom','sunrise') NOT NULL DEFAULT 'brand'" },
    ]);
    await connection.query(`CREATE TABLE IF NOT EXISTS \`SERVER_POLICY\` (
      \`policy_id\` TINYINT UNSIGNED NOT NULL PRIMARY KEY CHECK (\`policy_id\` = 1),
      \`revision\` INT UNSIGNED NOT NULL DEFAULT 0,
      \`overrides\` JSON NOT NULL
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS \`QUEUE_TICKET_COUNTERS\` (
      \`queue_date\` DATE NOT NULL,
      \`counter_id\` INT NOT NULL,
      \`last_number\` INT NOT NULL,
      PRIMARY KEY (\`queue_date\`, \`counter_id\`)
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS \`ADMIN_PERMISSIONS\` (
      \`permission_id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`code\` VARCHAR(60) NOT NULL UNIQUE,
      \`name\` VARCHAR(120) NOT NULL,
      \`description\` VARCHAR(300) NULL,
      \`sort_order\` INT NOT NULL DEFAULT 100
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS \`USER_ADMIN_PERMISSIONS\` (
      \`user_id\` BIGINT NOT NULL,
      \`permission_id\` INT NOT NULL,
      \`granted_by\` BIGINT NULL,
      \`granted_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`user_id\`, \`permission_id\`),
      CONSTRAINT \`fk_uap_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`USERS\` (\`user_id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_uap_perm\` FOREIGN KEY (\`permission_id\`) REFERENCES \`ADMIN_PERMISSIONS\` (\`permission_id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_uap_grantor\` FOREIGN KEY (\`granted_by\`) REFERENCES \`USERS\` (\`user_id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS \`INCIDENT_REPORTS\` (
      \`report_id\` BIGINT AUTO_INCREMENT PRIMARY KEY,
      \`alert_id\` BIGINT NOT NULL UNIQUE,
      \`patient_user_id\` BIGINT NOT NULL,
      \`resolved_at\` DATETIME NOT NULL,
      \`incident_details\` TEXT NOT NULL,
      \`treatment_notes\` TEXT NULL,
      \`documented_by\` BIGINT NOT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`pdf_s3_key\` VARCHAR(500) NULL COMMENT 'MinIO S3 key for incident report PDF',
      CONSTRAINT \`fk_ir_alert\` FOREIGN KEY (\`alert_id\`) REFERENCES \`EMERGENCY_ALERTS\` (\`alert_id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_ir_patient\` FOREIGN KEY (\`patient_user_id\`) REFERENCES \`USERS\` (\`user_id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_ir_author\` FOREIGN KEY (\`documented_by\`) REFERENCES \`USERS\` (\`user_id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    await connection.query('SELECT policy_id, revision, overrides FROM SERVER_POLICY LIMIT 0');
    await connection.query('SELECT queue_date, counter_id, last_number FROM QUEUE_TICKET_COUNTERS LIMIT 0');
    await connection.query('SELECT permission_id, code, name, description, sort_order FROM ADMIN_PERMISSIONS LIMIT 0');
    await connection.query('SELECT user_id, permission_id, granted_by, granted_at FROM USER_ADMIN_PERMISSIONS LIMIT 0');
    await connection.query(`SELECT report_id, alert_id, patient_user_id, resolved_at, incident_details,
      treatment_notes, documented_by, created_at FROM INCIDENT_REPORTS LIMIT 0`);
  },
  async data(connection) {
    await connection.query('INSERT IGNORE INTO SERVER_POLICY (policy_id, overrides) VALUES (1, JSON_OBJECT())');
    await connection.query(`INSERT IGNORE INTO ADMIN_PERMISSIONS (code, name, description, sort_order) VALUES
        ('SUPER_ADMIN',       'Super Admin',               'Unrestricted access to every admin console capability', 0),
        ('USERS_MANAGE',      'Manage user accounts',      'Create, edit, reset passwords and assign roles',        10),
        ('AUDIT_VIEW',        'View audit & PHI logs',     'Read-only access to the audit ledger and PHI access log', 20),
        ('TELEMETRY_VIEW',    'View system health',        'Service telemetry, uptime and health metrics',          30),
        ('RETENTION_MANAGE',  'Data retention governance', 'Retention status and statutory R.A. 10173 sweeps',       40),
        ('RESPONDERS_MANAGE', 'Manage qualified responders', 'Label any account a Qualified Responder: SOS alarms on any role, tiered alert payloads (reduced medical detail for non-clinical responders). Grant together with USERS_MANAGE — the toggle lives in the Users tab.', 45),
        ('ANALYTICS_VIEW',    'View analytics',            'Epidemiological analytics and campus health reports',   50),
        ('DATABASE_MANAGE',   'Database Studio',           'Inspect and maintain raw system records',               60)`);
  },
};
