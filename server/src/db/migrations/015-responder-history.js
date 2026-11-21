import { ensureIndex } from './schema.js';

export const draftTableSql = `CREATE TABLE IF NOT EXISTS INCIDENT_REPORT_DRAFTS (
  alert_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deferred_at DATETIME(3) NULL,
  PRIMARY KEY (alert_id, author_id),
  INDEX idx_report_draft_author (author_id, updated_at, alert_id),
  CONSTRAINT fk_report_draft_alert FOREIGN KEY (alert_id) REFERENCES EMERGENCY_ALERTS(alert_id) ON DELETE CASCADE,
  CONSTRAINT fk_report_draft_author FOREIGN KEY (author_id) REFERENCES USERS(user_id) ON DELETE CASCADE
) ENGINE=InnoDB`;

export default {
  version: 15,
  name: 'Responder history and private incident report drafts',
  async schema(connection) {
    await connection.query(draftTableSql);
    await ensureIndex(connection, 'EMERGENCY_ALERTS', 'idx_alert_history', ['status', 'created_at', 'alert_id']);
    await ensureIndex(connection, 'EMERGENCY_ALERTS', 'idx_alert_report_work', ['status', 'resolved_at', 'alert_id']);
    await ensureIndex(connection, 'INCIDENT_REPORTS', 'idx_report_history', ['created_at', 'report_id']);
    await ensureIndex(connection, 'AUDIT_LOGS', 'idx_alert_audit_history', ['table_affected', 'record_id', 'created_at', 'audit_id']);
  },
};
