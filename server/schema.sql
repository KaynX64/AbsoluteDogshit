-- =============================================================================
-- Valetudo HealthLink — Full Database Schema
-- Character Set: utf8mb4 / utf8mb4_unicode_ci
-- Compliance: R.A. 10173 (Data Privacy Act of 2012)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `valetudo_healthlink`
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE `valetudo_healthlink`;

-- DISABLE FK CHECKS DURING RECREATION
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `LOCAL_SYNC_LOGS`;
DROP TABLE IF EXISTS `PHI_ACCESS_LOGS`;
DROP TABLE IF EXISTS `AUDIT_LOGS`;
DROP TABLE IF EXISTS `EMERGENCY_ALERTS`;
DROP TABLE IF EXISTS `MEDICAL_CLEARANCES`;
DROP TABLE IF EXISTS `PRESCRIPTION_ITEMS`;
DROP TABLE IF EXISTS `PRESCRIPTIONS`;
DROP TABLE IF EXISTS `INVENTORY_LOGS`;
DROP TABLE IF EXISTS `MEDICINE_BATCHES`;
DROP TABLE IF EXISTS `DRUG_INTERACTIONS`;
DROP TABLE IF EXISTS `MEDICINES`;
DROP TABLE IF EXISTS `EMR_ATTACHMENTS`;
DROP TABLE IF EXISTS `DENTAL_CHARTS`;
DROP TABLE IF EXISTS `VITAL_SIGNS`;
DROP TABLE IF EXISTS `EMR_RECORDS`;
DROP TABLE IF EXISTS `QUEUE`;
DROP TABLE IF EXISTS `APPOINTMENTS`;
DROP TABLE IF EXISTS `DEVICE_TOKENS`;
DROP TABLE IF EXISTS `CONSENT_RECORDS`;
DROP TABLE IF EXISTS `HEALTH_PROFILES`;
DROP TABLE IF EXISTS `STAFF_PROFILES`;
DROP TABLE IF EXISTS `FACULTY_PROFILES`;
DROP TABLE IF EXISTS `NON_TEACHING_PROFILES`;
DROP TABLE IF EXISTS `STUDENT_PROFILES`;
DROP TABLE IF EXISTS `USER_ROLES`;
DROP TABLE IF EXISTS `ROLES`;
DROP TABLE IF EXISTS `USERS`;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- MODULE 1: IDENTITY, AUTHENTICATION & ROLE PROFILES
-- =============================================================================

-- 1. USERS
CREATE TABLE `USERS` (
  `user_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(20) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. ROLES
CREATE TABLE `ROLES` (
  `role_id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- 3. USER_ROLES (M:N junction)
CREATE TABLE `USER_ROLES` (
  `user_id` BIGINT NOT NULL,
  `role_id` INT NOT NULL,
  PRIMARY KEY (`user_id`, `role_id`),
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ur_role` FOREIGN KEY (`role_id`) REFERENCES `ROLES` (`role_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. STUDENT_PROFILES
CREATE TABLE `STUDENT_PROFILES` (
  `user_id` BIGINT PRIMARY KEY,
  `student_no` VARCHAR(50) NOT NULL UNIQUE,
  `course` VARCHAR(100) NOT NULL,
  `year_level` INT NOT NULL,
  CONSTRAINT `fk_sp_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. FACULTY_PROFILES
CREATE TABLE `FACULTY_PROFILES` (
  `user_id` BIGINT PRIMARY KEY,
  `department` VARCHAR(100) NOT NULL,
  `position` VARCHAR(100) NOT NULL,
  CONSTRAINT `fk_fp_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. NON_TEACHING_PROFILES
-- Non-teaching / support staff (maintenance, security, admin, custodial,
-- library aides, canteen personnel, etc.). Patient-side users on the mobile
-- app — identical to FACULTY in shape, but kept in a separate table so the
-- two populations stay semantically distinct.
CREATE TABLE `NON_TEACHING_PROFILES` (
  `user_id` BIGINT PRIMARY KEY,
  `employee_no` VARCHAR(50) NULL UNIQUE COMMENT 'Optional institutional staff ID',
  `department` VARCHAR(100) NOT NULL,
  `position` VARCHAR(100) NOT NULL,
  CONSTRAINT `fk_ntp_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. STAFF_PROFILES (CLINICAL staff only — doctors, nurses, dentists, admins)
CREATE TABLE `STAFF_PROFILES` (
  `user_id` BIGINT PRIMARY KEY,
  `license_no` VARCHAR(100) NULL,
  `specialty` VARCHAR(100) NULL,
  `department` VARCHAR(100) NOT NULL DEFAULT 'University Infirmary',
  CONSTRAINT `fk_staff_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. DEVICE_TOKENS (FCM push notification registration)
CREATE TABLE `DEVICE_TOKENS` (
  `token_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `fcm_token` VARCHAR(512) NOT NULL UNIQUE,
  `device_type` VARCHAR(50) NOT NULL DEFAULT 'android',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_device_user` (`user_id`),
  CONSTRAINT `fk_device_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================================================
-- MODULE 2: CLINICAL & ENCOUNTERS
-- =============================================================================

-- 9. HEALTH_PROFILES
CREATE TABLE `HEALTH_PROFILES` (
  `profile_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL UNIQUE,
  `blood_type` VARCHAR(10) NULL,
  `allergies` TEXT NULL,
  `chronic_conditions` TEXT NULL,
  `immunization_history` JSON NULL,
  `emergency_contact_name` VARCHAR(150) NULL,
  `emergency_contact_phone` VARCHAR(20) NULL,
  `height` DECIMAL(5,2) NULL COMMENT 'Height in cm',
  `weight` DECIMAL(5,2) NULL COMMENT 'Weight in kg',
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_hp_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 10. CONSENT_RECORDS (R.A. 10173 statutory consent tracking)
CREATE TABLE `CONSENT_RECORDS` (
  `consent_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `consent_type` VARCHAR(100) NOT NULL DEFAULT 'PHI_PROCESSING_RA_10173',
  `is_granted` BOOLEAN NOT NULL DEFAULT TRUE,
  `terms_version` VARCHAR(20) NOT NULL DEFAULT '2026.1',
  `consented_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` TIMESTAMP NULL DEFAULT NULL,
  `ip_address` VARCHAR(45) NULL,
  INDEX `idx_consent_user` (`user_id`, `is_granted`),
  CONSTRAINT `fk_consent_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 11. APPOINTMENTS
CREATE TABLE `APPOINTMENTS` (
  `appointment_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `patient_user_id` BIGINT NOT NULL,
  `doctor_user_id` BIGINT NOT NULL,
  `date_time` DATETIME NOT NULL,
  `appointment_type` VARCHAR(50) NOT NULL COMMENT 'Medical, Dental, Physical Exam, Consultation',
  `status` ENUM('scheduled', 'checked_in', 'serving', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'scheduled',
  `reminder_sent` BOOLEAN NOT NULL DEFAULT FALSE,
  `booked_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_reason` TEXT NULL,
  `notes` TEXT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_app_doctor_datetime` (`doctor_user_id`, `date_time`),
  INDEX `idx_app_patient_datetime` (`patient_user_id`, `date_time`),
  INDEX `idx_app_reminder` (`status`, `reminder_sent`, `date_time`),
  CONSTRAINT `fk_app_patient` FOREIGN KEY (`patient_user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_app_doctor` FOREIGN KEY (`doctor_user_id`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 12. QUEUE (live daily triage & walk-in)
CREATE TABLE `QUEUE` (
  `queue_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `patient_user_id` BIGINT NOT NULL,
  `appointment_id` BIGINT NULL DEFAULT NULL,
  `queue_date` DATE NOT NULL,
  `counter_id` INT NOT NULL DEFAULT 1,
  `queue_number` INT NOT NULL,
  `status` ENUM('waiting', 'in-consultation', 'done', 'cancelled') NOT NULL DEFAULT 'waiting',
  `checked_in_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `served_at` TIMESTAMP NULL DEFAULT NULL,
  `estimated_wait` INT NULL COMMENT 'Estimated wait time in minutes',
  `version` INT NOT NULL DEFAULT 1,
  UNIQUE KEY `uq_daily_queue_counter` (`queue_date`, `counter_id`, `queue_number`),
  CONSTRAINT `fk_queue_patient` FOREIGN KEY (`patient_user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_queue_app` FOREIGN KEY (`appointment_id`) REFERENCES `APPOINTMENTS` (`appointment_id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 13. EMR_RECORDS
CREATE TABLE `EMR_RECORDS` (
  `emr_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `patient_user_id` BIGINT NOT NULL,
  `doctor_user_id` BIGINT NOT NULL,
  `appointment_id` BIGINT NULL DEFAULT NULL,
  `encounter_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `chief_complaint` TEXT NOT NULL,
  `diagnosis` TEXT NOT NULL,
  `treatment_plan` TEXT NULL,
  `notes` TEXT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_emr_patient_date` (`patient_user_id`, `encounter_date`),
  CONSTRAINT `fk_emr_patient` FOREIGN KEY (`patient_user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_emr_doctor` FOREIGN KEY (`doctor_user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_emr_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `APPOINTMENTS` (`appointment_id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 14. EMR_ATTACHMENTS (diagnostic files stored in MinIO S3)
CREATE TABLE `EMR_ATTACHMENTS` (
  `attachment_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `emr_id` BIGINT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `s3_key` VARCHAR(500) NOT NULL,
  `file_size` BIGINT NOT NULL DEFAULT 0,
  `mime_type` VARCHAR(100) NULL,
  `uploaded_by` BIGINT NOT NULL,
  `uploaded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_attach_emr` (`emr_id`),
  CONSTRAINT `fk_attach_emr` FOREIGN KEY (`emr_id`) REFERENCES `EMR_RECORDS` (`emr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attach_user` FOREIGN KEY (`uploaded_by`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 15. DENTAL_CHARTS (dentist-only odontogram, vault-encrypted)
CREATE TABLE `DENTAL_CHARTS` (
  `chart_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `emr_id` BIGINT NOT NULL,
  `patient_user_id` BIGINT NOT NULL,
  `dentist_user_id` BIGINT NOT NULL,
  `chart_data` MEDIUMTEXT NOT NULL COMMENT 'Vault-encrypted odontogram JSON. Dentist-only.',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_dental_emr` (`emr_id`),
  INDEX `idx_dental_patient` (`patient_user_id`),
  CONSTRAINT `fk_dental_emr` FOREIGN KEY (`emr_id`) REFERENCES `EMR_RECORDS` (`emr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dental_patient` FOREIGN KEY (`patient_user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_dental_dentist` FOREIGN KEY (`dentist_user_id`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 16. VITAL_SIGNS
CREATE TABLE `VITAL_SIGNS` (
  `vital_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `emr_id` BIGINT NOT NULL,
  `metric` VARCHAR(50) NOT NULL COMMENT 'systolic_bp, diastolic_bp, pulse, temperature, spo2, resp_rate, height, weight',
  `value` DECIMAL(6,2) NOT NULL,
  `unit` VARCHAR(20) NOT NULL,
  `recorded_by` BIGINT NOT NULL,
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_vitals_emr` FOREIGN KEY (`emr_id`) REFERENCES `EMR_RECORDS` (`emr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vitals_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- =============================================================================
-- MODULE 3: PHARMACY, DOCUMENT ISSUANCE & INVENTORY
-- =============================================================================

-- 17. MEDICINES
CREATE TABLE `MEDICINES` (
  `medicine_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `generic_name` VARCHAR(150) NOT NULL,
  `form` VARCHAR(50) NOT NULL COMMENT 'Tablet, Syrup, Capsule, Ampule, Inhaler',
  `strength` VARCHAR(50) NOT NULL COMMENT '500mg, 10mg/5ml, etc.',
  `unit` VARCHAR(20) NOT NULL COMMENT 'pcs, box, bottle',
  `reorder_level` INT NOT NULL DEFAULT 15,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 18. MEDICINE_BATCHES
CREATE TABLE `MEDICINE_BATCHES` (
  `batch_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `medicine_id` BIGINT NOT NULL,
  `batch_no` VARCHAR(100) NOT NULL,
  `manufacture_date` DATE NOT NULL,
  `expiry_date` DATE NOT NULL,
  `supplier` VARCHAR(150) NULL,
  `quantity_on_hand` INT NOT NULL DEFAULT 0,
  `received_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT `chk_expiry_after_mfg` CHECK (`expiry_date` > `manufacture_date`),
  INDEX `idx_batch_expiry` (`medicine_id`, `expiry_date`),
  CONSTRAINT `fk_batch_medicine` FOREIGN KEY (`medicine_id`) REFERENCES `MEDICINES` (`medicine_id`)
) ENGINE=InnoDB;

-- 19. DRUG_INTERACTIONS
CREATE TABLE `DRUG_INTERACTIONS` (
  `interaction_id`    BIGINT AUTO_INCREMENT PRIMARY KEY,
  `medicine_id_a`     BIGINT NOT NULL COMMENT 'First drug in the interaction pair (lower ID)',
  `medicine_id_b`     BIGINT NOT NULL COMMENT 'Second drug in the interaction pair (higher ID)',
  `severity`          ENUM('mild', 'moderate', 'severe', 'contraindicated') NOT NULL
                      COMMENT 'mild = informational, moderate = caution, severe = warn+override, contraindicated = block',
  `interaction_type`  VARCHAR(100) NOT NULL COMMENT 'e.g. pharmacokinetic, pharmacodynamic, additive',
  `description`       TEXT NOT NULL COMMENT 'Human-readable explanation of the interaction',
  `recommendation`    TEXT NULL COMMENT 'Clinical recommendation or alternative',
  `source`            VARCHAR(255) NULL COMMENT 'Reference source (e.g. FDA, BNF, local formulary)',
  `is_active`         BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_interaction_pair` (`medicine_id_a`, `medicine_id_b`),
  INDEX `idx_interaction_a` (`medicine_id_a`),
  INDEX `idx_interaction_b` (`medicine_id_b`),
  INDEX `idx_interaction_severity` (`severity`),
  CONSTRAINT `fk_di_med_a` FOREIGN KEY (`medicine_id_a`) REFERENCES `MEDICINES` (`medicine_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_di_med_b` FOREIGN KEY (`medicine_id_b`) REFERENCES `MEDICINES` (`medicine_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_no_self_interaction` CHECK (`medicine_id_a` != `medicine_id_b`),
  CONSTRAINT `chk_ordered_pair` CHECK (`medicine_id_a` < `medicine_id_b`)
) ENGINE=InnoDB;

-- 20. INVENTORY_LOGS
CREATE TABLE `INVENTORY_LOGS` (
  `log_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `batch_id` BIGINT NOT NULL,
  `quantity_change` INT NOT NULL COMMENT 'Positive for stock-in, negative for dispense',
  `transaction_type` ENUM('receive', 'dispense', 'return', 'dispose', 'adjust', 'recall') NOT NULL,
  `reason` TEXT NULL,
  `performed_by` BIGINT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_inv_batch` FOREIGN KEY (`batch_id`) REFERENCES `MEDICINE_BATCHES` (`batch_id`),
  CONSTRAINT `fk_inv_user` FOREIGN KEY (`performed_by`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 21. PRESCRIPTIONS
CREATE TABLE `PRESCRIPTIONS` (
  `prescription_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `emr_id` BIGINT NOT NULL,
  `patient_user_id` BIGINT NOT NULL,
  `doctor_user_id` BIGINT NOT NULL,
  `issued_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('active', 'dispensed', 'expired', 'cancelled') NOT NULL DEFAULT 'active',
  `notes` TEXT NULL,
  `qr_token` VARCHAR(255) NOT NULL UNIQUE COMMENT 'Signed reference: UUID + HMAC',
  `signature_metadata` JSON NULL COMMENT 'Signer ID, role, timestamp, document SHA-256',
  `pdf_s3_key` VARCHAR(500) NULL COMMENT 'MinIO S3 key for signed PDF',
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_rx_patient` (`patient_user_id`, `issued_at`),
  INDEX `idx_rx_status` (`status`),
  CONSTRAINT `fk_rx_emr` FOREIGN KEY (`emr_id`) REFERENCES `EMR_RECORDS` (`emr_id`),
  CONSTRAINT `fk_rx_patient` FOREIGN KEY (`patient_user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_rx_doctor` FOREIGN KEY (`doctor_user_id`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 22. PRESCRIPTION_ITEMS
CREATE TABLE `PRESCRIPTION_ITEMS` (
  `item_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `prescription_id` BIGINT NOT NULL,
  `medicine_id` BIGINT NOT NULL,
  `dosage` VARCHAR(100) NOT NULL,
  `frequency` VARCHAR(100) NOT NULL,
  `route` VARCHAR(50) NOT NULL DEFAULT 'Oral',
  `duration_days` INT NOT NULL,
  `quantity_dispensed` INT NOT NULL DEFAULT 0,
  `instructions` TEXT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT `fk_rx_item_parent` FOREIGN KEY (`prescription_id`) REFERENCES `PRESCRIPTIONS` (`prescription_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rx_item_medicine` FOREIGN KEY (`medicine_id`) REFERENCES `MEDICINES` (`medicine_id`)
) ENGINE=InnoDB;

-- 23. MEDICAL_CLEARANCES
CREATE TABLE `MEDICAL_CLEARANCES` (
  `clearance_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `purpose` VARCHAR(100) NOT NULL COMMENT 'OJT, Sports, Academic, Employment',
  `status` ENUM('pending', 'approved', 'rejected', 'expired', 'revoked') NOT NULL DEFAULT 'approved',
  `issued_by` BIGINT NOT NULL,
  `issued_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATE NOT NULL,
  `qr_token` VARCHAR(255) NOT NULL UNIQUE,
  `signature_metadata` JSON NOT NULL COMMENT 'Stores signer ID, role, timestamp, document hash, revocation data',
  `pdf_s3_key` VARCHAR(500) NULL COMMENT 'MinIO S3 key for signed PDF',
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_clearance_user` (`user_id`, `issued_at`),
  INDEX `idx_clearance_status` (`status`),
  CONSTRAINT `fk_mc_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_mc_issuer` FOREIGN KEY (`issued_by`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- =============================================================================
-- MODULE 4: EMERGENCY RESPONSE & GEOLOCATION
-- =============================================================================

-- 24. EMERGENCY_ALERTS
CREATE TABLE `EMERGENCY_ALERTS` (
  `alert_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `location` POINT NOT NULL SRID 4326,
  `latitude` DECIMAL(10,8) GENERATED ALWAYS AS (ST_Latitude(`location`)) STORED,
  `longitude` DECIMAL(11,8) GENERATED ALWAYS AS (ST_Longitude(`location`)) STORED,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('triggered', 'acknowledged', 'dispatched', 'resolved', 'false_alarm') NOT NULL DEFAULT 'triggered',
  `assigned_responder_id` BIGINT NULL DEFAULT NULL,
  `acknowledged_at` TIMESTAMP NULL DEFAULT NULL,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  `response_time_seconds` INT NULL DEFAULT NULL,
  `notes` TEXT NULL,
  SPATIAL INDEX `sp_idx_alert_location` (`location`),
  CONSTRAINT `fk_ea_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_ea_responder` FOREIGN KEY (`assigned_responder_id`) REFERENCES `USERS` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================================
-- MODULE 5: SECURITY, COMPLIANCE (RA 10173) & OFFLINE SYNC
-- =============================================================================

-- 25. AUDIT_LOGS
CREATE TABLE `AUDIT_LOGS` (
  `audit_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NULL DEFAULT NULL,
  `action` ENUM('LOGIN', 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'SIGN', 'REVOKE') NOT NULL,
  `table_affected` VARCHAR(50) NOT NULL,
  `record_id` BIGINT NULL DEFAULT NULL,
  `old_value` JSON NULL,
  `new_value` JSON NULL,
  `ip_address` VARCHAR(45) NULL,
  `device_id` VARCHAR(100) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `prev_hash` VARCHAR(64) NOT NULL,
  `entry_hash` VARCHAR(64) NOT NULL COMMENT 'SHA-256(prev_hash + row data)',
  CONSTRAINT `fk_al_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 26. PHI_ACCESS_LOGS
CREATE TABLE `PHI_ACCESS_LOGS` (
  `access_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL COMMENT 'Practitioner viewing record',
  `patient_user_id` BIGINT NULL COMMENT 'Patient whose record was viewed; NULL for bulk/system reads',
  `table_affected` VARCHAR(50) NOT NULL,
  `record_id` BIGINT NOT NULL,
  `purpose` VARCHAR(150) NOT NULL,
  `accessed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` VARCHAR(45) NULL,
  CONSTRAINT `fk_phi_viewer` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_phi_patient` FOREIGN KEY (`patient_user_id`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 27. LOCAL_SYNC_LOGS
CREATE TABLE `LOCAL_SYNC_LOGS` (
  `sync_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `client_mutation_id` VARCHAR(36) NOT NULL UNIQUE COMMENT 'UUID idempotency token',
  `user_id` BIGINT NOT NULL,
  `device_id` VARCHAR(100) NOT NULL,
  `table_name` VARCHAR(50) NOT NULL,
  `record_id` BIGINT NULL DEFAULT NULL,
  `record_uuid` VARCHAR(36) NOT NULL,
  `action` ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
  `payload` JSON NOT NULL,
  `local_version` INT NOT NULL,
  `sync_status` ENUM('pending', 'synced', 'conflict', 'error') NOT NULL DEFAULT 'pending',
  `error_message` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `synced_at` TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT `fk_sync_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- =============================================================================
-- SEED DATA: ROLES & ONE ACCOUNT PER ROLE
-- =============================================================================
-- The audit hash chain self-initializes on the first login.
--
-- Empty-by-design tables (populate through the desktop UI):
--   • MEDICINES / MEDICINE_BATCHES          → Nurse → Inventory
--   • DRUG_INTERACTIONS                     → Admin → Database Studio
--   • EMR_RECORDS / PRESCRIPTIONS / etc.    → Clinical workflows
--
-- PATIENT-SIDE ROLES on the mobile app (all route to PatientPortalScreen):
--   • STUDENT                    → STUDENT_PROFILES
--   • FACULTY                    → FACULTY_PROFILES
--   • NON_TEACHING               → NON_TEACHING_PROFILES
--
-- CLINICAL-STAFF ROLES on the desktop app:
--   • DOCTOR / DENTIST / NURSE / ADMIN        → STAFF_PROFILES
--   • EMERGENCY_RESPONDER                     → STAFF_PROFILES
-- =============================================================================

-- ROLES
INSERT INTO `ROLES` (`role_id`, `code`, `name`) VALUES
(1, 'STUDENT',             'Student Patient'),
(2, 'FACULTY',             'Faculty / Employee Patient'),
(3, 'NURSE',               'Infirmary Nurse / Triage Officer'),
(4, 'DOCTOR',              'Campus Physician'),
(5, 'DENTIST',             'Campus Dentist'),
(6, 'EMERGENCY_RESPONDER', 'Campus Quick-Response Personnel'),
(7, 'ADMIN',               'PSU IT System Administrator'),
(8, 'NON_TEACHING',        'Non-Teaching / Support Staff');

-- Default password for all seeded accounts: 'Password123!'
SET @default_pw = '$2b$10$Y5.xe6H/ZbWi0K/RYcQE2uGPh9hdAn/vKWCit/EMDrpqigeOQ45n.';

-- USERS — one account per role for smoke-testing
INSERT INTO `USERS` (`user_id`, `email`, `password_hash`, `first_name`, `last_name`, `phone`, `is_active`) VALUES
(1, 'admin@psu.edu.ph',         @default_pw, 'Clark',    'Castro',   '09171234567', TRUE),
(2, 'doctor@psu.edu.ph',        @default_pw, 'Juan',     'Mata',     '09181234568', TRUE),
(3, 'nurse@psu.edu.ph',         @default_pw, 'Dimples',  'Arenas',   '09191234569', TRUE),
(4, 'responder@psu.edu.ph',     @default_pw, 'Denver',   'Cerezo',   '09201234570', TRUE),
(5, 'student@psu.edu.ph',       @default_pw, 'Daniella', 'Movida',   '09211234571', TRUE),
(6, 'dentist@psu.edu.ph',       @default_pw, 'Carmela',  'Reyes',    '09221234572', TRUE),
(7, 'faculty@psu.edu.ph',       @default_pw, 'Ramon',    'Bautista', '09231234573', TRUE),
(8, 'nonteaching@psu.edu.ph',   @default_pw, 'Ernesto',  'Domingo',  '09241234574', TRUE);

-- USER_ROLES
INSERT INTO `USER_ROLES` (`user_id`, `role_id`) VALUES
(1, 7), -- Admin
(2, 4), -- Doctor
(3, 3), -- Nurse
(4, 6), -- Emergency Responder
(5, 1), -- Student
(6, 5), -- Dentist
(7, 2), -- Faculty
(8, 8); -- Non-Teaching / Support Staff

-- STUDENT_PROFILES
INSERT INTO `STUDENT_PROFILES` (`user_id`, `student_no`, `course`, `year_level`) VALUES
(5, '22-LN-0123', 'BS Information Technology', 3);

-- FACULTY_PROFILES
INSERT INTO `FACULTY_PROFILES` (`user_id`, `department`, `position`) VALUES
(7, 'College of Computing Studies', 'Assistant Professor');

-- NON_TEACHING_PROFILES
INSERT INTO `NON_TEACHING_PROFILES` (`user_id`, `employee_no`, `department`, `position`) VALUES
(8, 'PSU-NT-2024-0187', 'Campus Maintenance & Facilities', 'Utility Worker');

-- STAFF_PROFILES (clinical only)
INSERT INTO `STAFF_PROFILES` (`user_id`, `license_no`, `specialty`, `department`) VALUES
(2, 'PRC-MD-098765',  'General Medicine',           'PSU Lingayen Clinic'),
(3, 'PRC-RN-054321',  'Emergency & Triage Nursing', 'PSU Lingayen Clinic'),
(6, 'PRC-DDS-045678', 'Dentistry & Oral Health',     'PSU Lingayen Clinic');

-- HEALTH_PROFILES — minimal for the demo patient-side accounts
INSERT INTO `HEALTH_PROFILES`
(`user_id`, `blood_type`, `allergies`, `chronic_conditions`,
 `emergency_contact_name`, `emergency_contact_phone`,
 `height`, `weight`, `immunization_history`)
VALUES
(5, 'O+', 'Penicillin', 'Mild Asthma',  'Maria Movida',   '09299876543',
 162.50, 54.00, JSON_ARRAY()),
(7, 'A+', 'None',       'Hypertension', 'Liza Bautista',  '09299876544',
 172.00, 78.00, JSON_ARRAY()),
(8, 'B+', 'None',       'None',         'Josefa Domingo', '09299876545',
 168.00, 71.00, JSON_ARRAY());

-- CONSENT_RECORDS — R.A. 10173 (required for patient-side mobile access)
INSERT INTO `CONSENT_RECORDS` (`user_id`, `consent_type`, `is_granted`, `ip_address`) VALUES
(5, 'PHI_PROCESSING_RA_10173', TRUE, '127.0.0.1'),
(7, 'PHI_PROCESSING_RA_10173', TRUE, '127.0.0.1'),
(8, 'PHI_PROCESSING_RA_10173', TRUE, '127.0.0.1');

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================