export const qualificationTables = [
    `CREATE TABLE IF NOT EXISTS RESPONDER_REVIEWERS (
 user_id BIGINT PRIMARY KEY, designated_by BIGINT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
 designated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES USERS(user_id), FOREIGN KEY (designated_by) REFERENCES USERS(user_id)
) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS RESPONDER_QUALIFICATION_SETTINGS (
 settings_id TINYINT PRIMARY KEY, enforced BOOLEAN NOT NULL DEFAULT FALSE,
 enabled_by BIGINT NULL, enabled_at DATETIME(3) NULL,
 CHECK (settings_id = 1), FOREIGN KEY (enabled_by) REFERENCES USERS(user_id)
) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS RESPONDER_APPLICATIONS (
 application_id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL,
 source ENUM('self','nomination','legacy') NOT NULL DEFAULT 'self',
 application_type ENUM('initial','renewal') NOT NULL DEFAULT 'initial',
 status ENUM('draft','submitted','under_review','needs_information','training_required','approved','rejected','withdrawn') NOT NULL DEFAULT 'draft',
 requested_level ENUM('community','staff') NOT NULL DEFAULT 'community',
 nominated_by BIGINT NULL, nomination_accepted_at DATETIME(3) NULL, responsibilities_accepted_at DATETIME(3) NULL,
 form JSON NOT NULL, assessment JSON NULL, decision_reason TEXT NULL, reviewed_by BIGINT NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 1, fixture_key VARCHAR(100) NULL UNIQUE,
 open_user_id BIGINT GENERATED ALWAYS AS (CASE WHEN status IN ('draft','submitted','under_review','needs_information','training_required') THEN user_id ELSE NULL END) STORED,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_responder_open_application (open_user_id), INDEX idx_responder_application_user (user_id, application_id),
 FOREIGN KEY (user_id) REFERENCES USERS(user_id), FOREIGN KEY (nominated_by) REFERENCES USERS(user_id), FOREIGN KEY (reviewed_by) REFERENCES USERS(user_id)
) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS RESPONDER_APPOINTMENTS (
 appointment_id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, application_id BIGINT NOT NULL UNIQUE,
 level ENUM('community','staff') NOT NULL, status ENUM('active','suspended','expired','revoked') NOT NULL DEFAULT 'active',
 approved_by BIGINT NOT NULL, starts_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL,
 ended_at DATETIME(3) NULL, end_reason TEXT NULL,
 current_user_id BIGINT GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN user_id ELSE NULL END) STORED,
 UNIQUE KEY uq_responder_active_appointment (current_user_id), INDEX idx_responder_appointment_user (user_id, appointment_id),
 FOREIGN KEY (user_id) REFERENCES USERS(user_id), FOREIGN KEY (application_id) REFERENCES RESPONDER_APPLICATIONS(application_id),
 FOREIGN KEY (approved_by) REFERENCES USERS(user_id)
) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS RESPONDER_QUALIFICATION_EVENTS (
 event_id BIGINT AUTO_INCREMENT PRIMARY KEY, application_id BIGINT NOT NULL, actor_id BIGINT NULL,
 action VARCHAR(50) NOT NULL, details JSON NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (application_id) REFERENCES RESPONDER_APPLICATIONS(application_id), FOREIGN KEY (actor_id) REFERENCES USERS(user_id)
) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS RESPONDER_EVIDENCE (
 evidence_id BIGINT AUTO_INCREMENT PRIMARY KEY, application_id BIGINT NOT NULL, uploaded_by BIGINT NOT NULL,
 file_name VARCHAR(200) NOT NULL, mime_type VARCHAR(80) NOT NULL, file_size INT UNSIGNED NOT NULL, s3_key VARCHAR(250) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (application_id) REFERENCES RESPONDER_APPLICATIONS(application_id), FOREIGN KEY (uploaded_by) REFERENCES USERS(user_id)
) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS RESPONDER_QUALIFICATION_NOTICES (
 notice_id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, appointment_id BIGINT NULL,
 notice_key VARCHAR(150) NOT NULL UNIQUE, message VARCHAR(500) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES USERS(user_id), FOREIGN KEY (appointment_id) REFERENCES RESPONDER_APPOINTMENTS(appointment_id)
) ENGINE=InnoDB`,
];
export default {
    version: 16, name: 'Responder qualification applications and appointments',
    async schema(connection) {
        for (const sql of qualificationTables)
            await connection.query(sql);
        await connection.query('INSERT IGNORE INTO RESPONDER_QUALIFICATION_SETTINGS (settings_id) VALUES (1)');
    },
    async data(connection) {
        // Imported flags/roles are candidates, never evidence of approval. Existing access
        // remains staged until the administrator explicitly enables the reviewed roster.
        await connection.query(`INSERT INTO RESPONDER_APPLICATIONS (user_id, source, form)
   SELECT DISTINCT u.user_id, 'legacy', JSON_OBJECT('affiliation', '', 'trainingHistory', '', 'importNote', 'Imported for clinic review; not a qualification')
   FROM USERS u LEFT JOIN USER_ROLES ur ON ur.user_id=u.user_id LEFT JOIN ROLES r ON r.role_id=ur.role_id
   WHERE u.is_active=1 AND u.deleted_at IS NULL
    AND (u.is_qualified_responder=1 OR r.code IN ('NURSE','DOCTOR','DENTIST','EMERGENCY_RESPONDER'))
    AND NOT EXISTS (SELECT 1 FROM RESPONDER_APPLICATIONS a WHERE a.user_id=u.user_id)`);
        await connection.query(`UPDATE ADMIN_PERMISSIONS SET description='Inspect responder qualifications, designate clinic reviewers, suspend or revoke appointments, and enable the reviewed roster.' WHERE code='RESPONDERS_MANAGE'`);
    },
};
