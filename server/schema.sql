-- server/schema.sql

CREATE DATABASE IF NOT EXISTS `valetudo_healthlink`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `valetudo_healthlink`;

-- Disable FK checks during recreation
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
DROP TABLE IF EXISTS `MEDICINES`;
DROP TABLE IF EXISTS `VITAL_SIGNS`;
DROP TABLE IF EXISTS `EMR_ATTACHMENTS`;
DROP TABLE IF EXISTS `EMR_RECORDS`;
DROP TABLE IF EXISTS `QUEUE`;
DROP TABLE IF EXISTS `APPOINTMENTS`;
DROP TABLE IF EXISTS `HEALTH_PROFILES`;
DROP TABLE IF EXISTS `STAFF_PROFILES`;
DROP TABLE IF EXISTS `FACULTY_PROFILES`;
DROP TABLE IF EXISTS `STUDENT_PROFILES`;
DROP TABLE IF EXISTS `CONSENT_RECORDS`;
DROP TABLE IF EXISTS `DEVICE_TOKENS`;
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

-- 3. USER_ROLES
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

-- 6. STAFF_PROFILES
CREATE TABLE `STAFF_PROFILES` (
  `user_id` BIGINT PRIMARY KEY,
  `license_no` VARCHAR(100) NULL,
  `specialty` VARCHAR(100) NULL,
  `department` VARCHAR(100) NOT NULL DEFAULT 'University Infirmary',
  CONSTRAINT `fk_staff_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. CONSENT_RECORDS (R.A. 10173 Compliance)
CREATE TABLE `CONSENT_RECORDS` (
  `consent_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `consent_type` VARCHAR(100) NOT NULL DEFAULT 'PHI_PROCESSING_RA_10173',
  `is_granted` BOOLEAN NOT NULL DEFAULT TRUE,
  `ip_address` VARCHAR(45) NULL,
  `terms_version` VARCHAR(50) NOT NULL DEFAULT '2026.1',
  `consented_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT `fk_consent_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. DEVICE_TOKENS (FCM Push)
CREATE TABLE `DEVICE_TOKENS` (
  `token_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `fcm_token` VARCHAR(512) NOT NULL UNIQUE,
  `device_type` VARCHAR(50) NOT NULL DEFAULT 'android',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
  `height` DECIMAL(5,2) NULL,
  `weight` DECIMAL(5,2) NULL,
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_hp_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 10. APPOINTMENTS
CREATE TABLE `APPOINTMENTS` (
  `appointment_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `patient_user_id` BIGINT NOT NULL,
  `doctor_user_id` BIGINT NOT NULL,
  `date_time` DATETIME NOT NULL,
  `appointment_type` VARCHAR(50) NOT NULL,
  `status` ENUM('scheduled', 'checked_in', 'serving', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'scheduled',
  `reminder_sent` BOOLEAN NOT NULL DEFAULT FALSE,
  `booked_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_reason` TEXT NULL,
  `notes` TEXT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_app_doctor_datetime` (`doctor_user_id`, `date_time`),
  INDEX `idx_app_patient_datetime` (`patient_user_id`, `date_time`),
  CONSTRAINT `fk_app_patient` FOREIGN KEY (`patient_user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_app_doctor` FOREIGN KEY (`doctor_user_id`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 11. QUEUE
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
  `estimated_wait` INT NULL,
  UNIQUE KEY `uq_daily_queue_counter` (`queue_date`, `counter_id`, `queue_number`),
  CONSTRAINT `fk_queue_patient` FOREIGN KEY (`patient_user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_queue_app` FOREIGN KEY (`appointment_id`) REFERENCES `APPOINTMENTS` (`appointment_id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 12. EMR_RECORDS
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
  CONSTRAINT `fk_emr_app` FOREIGN KEY (`appointment_id`) REFERENCES `APPOINTMENTS` (`appointment_id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 13. EMR_ATTACHMENTS
CREATE TABLE `EMR_ATTACHMENTS` (
  `attachment_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `emr_id` BIGINT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `s3_key` VARCHAR(500) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `uploaded_by` BIGINT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_att_emr` FOREIGN KEY (`emr_id`) REFERENCES `EMR_RECORDS` (`emr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 14. VITAL_SIGNS
CREATE TABLE `VITAL_SIGNS` (
  `vital_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `emr_id` BIGINT NOT NULL,
  `metric` VARCHAR(50) NOT NULL,
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

-- 15. MEDICINES
CREATE TABLE `MEDICINES` (
  `medicine_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `generic_name` VARCHAR(150) NOT NULL,
  `form` VARCHAR(50) NOT NULL,
  `strength` VARCHAR(50) NOT NULL,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'pcs',
  `reorder_level` INT NOT NULL DEFAULT 15,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `version` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 16. MEDICINE_BATCHES
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

-- 17. INVENTORY_LOGS
CREATE TABLE `INVENTORY_LOGS` (
  `log_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `batch_id` BIGINT NOT NULL,
  `quantity_change` INT NOT NULL,
  `transaction_type` ENUM('receive', 'dispense', 'return', 'dispose', 'adjust', 'recall') NOT NULL,
  `reason` TEXT NULL,
  `performed_by` BIGINT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_inv_batch` FOREIGN KEY (`batch_id`) REFERENCES `MEDICINE_BATCHES` (`batch_id`),
  CONSTRAINT `fk_inv_user` FOREIGN KEY (`performed_by`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 18. PRESCRIPTIONS
CREATE TABLE `PRESCRIPTIONS` (
  `prescription_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `emr_id` BIGINT NOT NULL,
  `patient_user_id` BIGINT NOT NULL,
  `doctor_user_id` BIGINT NOT NULL,
  `issued_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('active', 'dispensed', 'expired', 'cancelled') NOT NULL DEFAULT 'active',
  `notes` TEXT NULL,
  `qr_token` VARCHAR(255) NOT NULL UNIQUE,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT `fk_rx_emr` FOREIGN KEY (`emr_id`) REFERENCES `EMR_RECORDS` (`emr_id`),
  CONSTRAINT `fk_rx_patient` FOREIGN KEY (`patient_user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_rx_doctor` FOREIGN KEY (`doctor_user_id`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 19. PRESCRIPTION_ITEMS
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
  CONSTRAINT `fk_rx_item_parent` FOREIGN KEY (`prescription_id`) REFERENCES `PRESCRIPTIONS` (`prescription_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rx_item_medicine` FOREIGN KEY (`medicine_id`) REFERENCES `MEDICINES` (`medicine_id`)
) ENGINE=InnoDB;

-- 20. MEDICAL_CLEARANCES
CREATE TABLE `MEDICAL_CLEARANCES` (
  `clearance_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `purpose` VARCHAR(100) NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'approved',
  `issued_by` BIGINT NOT NULL,
  `issued_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATE NOT NULL,
  `qr_token` VARCHAR(255) NOT NULL UNIQUE,
  `signature_metadata` JSON NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT `fk_mc_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_mc_issuer` FOREIGN KEY (`issued_by`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- =============================================================================
-- MODULE 4: EMERGENCY RESPONSE & GEOLOCATION
-- =============================================================================

-- 21. EMERGENCY_ALERTS
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

-- 22. AUDIT_LOGS
CREATE TABLE `AUDIT_LOGS` (
  `audit_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NULL DEFAULT NULL,
  `action` ENUM('LOGIN', 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT') NOT NULL,
  `table_affected` VARCHAR(50) NOT NULL,
  `record_id` BIGINT NULL DEFAULT NULL,
  `old_value` JSON NULL,
  `new_value` JSON NULL,
  `ip_address` VARCHAR(45) NULL,
  `device_id` VARCHAR(100) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `prev_hash` VARCHAR(64) NOT NULL,
  `entry_hash` VARCHAR(64) NOT NULL,
  CONSTRAINT `fk_al_user` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 23. PHI_ACCESS_LOGS
CREATE TABLE `PHI_ACCESS_LOGS` (
  `access_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `patient_user_id` BIGINT NOT NULL,
  `table_affected` VARCHAR(50) NOT NULL,
  `record_id` BIGINT NOT NULL,
  `purpose` VARCHAR(150) NOT NULL,
  `accessed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` VARCHAR(45) NULL,
  CONSTRAINT `fk_phi_viewer` FOREIGN KEY (`user_id`) REFERENCES `USERS` (`user_id`),
  CONSTRAINT `fk_phi_patient` FOREIGN KEY (`patient_user_id`) REFERENCES `USERS` (`user_id`)
) ENGINE=InnoDB;

-- 24. LOCAL_SYNC_LOGS
CREATE TABLE `LOCAL_SYNC_LOGS` (
  `sync_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `client_mutation_id` VARCHAR(36) NOT NULL UNIQUE,
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
-- SEED DATA: ROLES & INITIAL ACCOUNTS
-- =============================================================================

INSERT INTO `ROLES` (`role_id`, `code`, `name`) VALUES
(1, 'STUDENT', 'Student Patient'),
(2, 'FACULTY', 'Faculty / Employee Patient'),
(3, 'NURSE', 'Infirmary Nurse / Triage Officer'),
(4, 'DOCTOR', 'Campus Physician'),
(5, 'DENTIST', 'Campus Dentist'),
(6, 'EMERGENCY_RESPONDER', 'Campus Quick-Response Personnel'),
(7, 'ADMIN', 'PSU IT System Administrator');

SET @default_pw = '$2b$10$Y5.xe6H/ZbWi0K/RYcQE2uGPh9hdAn/vKWCit/EMDrpqigeOQ45n.';

-- Staff & Primary Accounts (1 to 6)
INSERT INTO `USERS` (`user_id`, `email`, `password_hash`, `first_name`, `last_name`, `phone`) VALUES
(1, 'admin@psu.edu.ph',     @default_pw, 'Clark',    'Castro',  '09171234567'),
(2, 'doctor@psu.edu.ph',    @default_pw, 'Juan',     'Mata',    '09181234568'),
(3, 'nurse@psu.edu.ph',     @default_pw, 'Dimples',  'Arenas',  '09191234569'),
(4, 'responder@psu.edu.ph', @default_pw, 'Denver',   'Cerezo',  '09201234570'),
(5, 'student@psu.edu.ph',   @default_pw, 'Daniella', 'Movida',  '09211234571'),
(6, 'dentist@psu.edu.ph',   @default_pw, 'Carmela',  'Reyes',   '09221234572');

-- Additional Student Patients (7 to 12)
INSERT INTO `USERS` (`user_id`, `email`, `password_hash`, `first_name`, `last_name`, `phone`) VALUES
(7,  'maria.santos@psu.edu.ph',     @default_pw, 'Maria Carmela', 'Santos',     '09214441001'),
(8,  'christian.reyes@psu.edu.ph',  @default_pw, 'Christian',     'Reyes',      '09214441002'),
(9,  'bea.delacruz@psu.edu.ph',     @default_pw, 'Bea Bianca',    'Dela Cruz',  '09214441003'),
(10, 'joshua.aquino@psu.edu.ph',    @default_pw, 'Joshua',        'Aquino',     '09214441004'),
(11, 'althea.garcia@psu.edu.ph',    @default_pw, 'Althea Mae',    'Garcia',     '09214441005'),
(12, 'kevin.villanueva@psu.edu.ph', @default_pw, 'Kevin',         'Villanueva', '09214441006');

-- Assign User Roles
INSERT INTO `USER_ROLES` (`user_id`, `role_id`) VALUES
(1, 7),
(2, 4),
(3, 3),
(4, 6),
(5, 1),
(6, 5),
(7, 1),
(8, 1),
(9, 1),
(10, 1),
(11, 1),
(12, 1);

-- Student Profiles
INSERT INTO `STUDENT_PROFILES` (`user_id`, `student_no`, `course`, `year_level`) VALUES
(5,  '22-LN-0123', 'BS Information Technology', 3),
(7,  '22-LN-0201', 'BS Information Technology', 3),
(8,  '22-LN-0202', 'BS Computer Science',        3),
(9,  '23-LN-0310', 'BS Nursing',                 2),
(10, '21-LN-0115', 'BS Business Administration', 4),
(11, '23-LN-0342', 'BS Hospitality Management',  2),
(12, '22-LN-0255', 'BS Education',               3);

-- Staff Profiles
INSERT INTO `STAFF_PROFILES` (`user_id`, `license_no`, `specialty`, `department`) VALUES
(2, 'PRC-MD-098765', 'General Medicine',        'PSU Lingayen Clinic'),
(3, 'PRC-RN-054321', 'Emergency Nursing',       'PSU Lingayen Clinic'),
(6, 'PRC-DDS-045678', 'Dentistry & Oral Health', 'PSU Lingayen Clinic');

-- Baseline Health Profiles
INSERT INTO `HEALTH_PROFILES` (`user_id`, `blood_type`, `allergies`, `chronic_conditions`, `emergency_contact_name`, `emergency_contact_phone`, `height`, `weight`, `immunization_history`) VALUES
(5,  'O+', 'Penicillin', 'Mild Asthma', 'Maria Movida',      '09299876543', 162.50, 54.00, '["COVID-19 Primary", "COVID-19 Booster"]'),
(7,  'O+', 'None',       'None',        'Carmela Santos',    '09171110001', 160.00, 52.00, '["COVID-19 Booster"]'),
(8,  'A+', 'Penicillin', 'Mild Asthma', 'Eduardo Reyes',     '09171110002', 172.00, 65.00, '["COVID-19 Booster", "Hepatitis B"]'),
(9,  'B+', 'None',       'None',        'Corazon Dela Cruz', '09171110003', 158.00, 49.00, '["COVID-19 Booster"]'),
(10, 'AB+','Aspirin',    'None',        'Roberto Aquino',    '09171110004', 175.00, 70.00, '["COVID-19 Booster"]'),
(11, 'O-', 'None',       'None',        'Luz Garcia',        '09171110005', 162.00, 54.00, '["COVID-19 Booster"]'),
(12, 'B-', 'None',       'None',        'Danilo Villanueva', '09171110006', 168.00, 61.00, '["COVID-19 Booster"]');

-- Mandatory Privacy Consent (R.A. 10173)
INSERT INTO `CONSENT_RECORDS` (`user_id`, `consent_type`, `is_granted`, `ip_address`) VALUES
(5,  'PHI_PROCESSING_RA_10173', TRUE, '127.0.0.1'),
(7,  'PHI_PROCESSING_RA_10173', TRUE, '127.0.0.1'),
(8,  'PHI_PROCESSING_RA_10173', TRUE, '127.0.0.1'),
(9,  'PHI_PROCESSING_RA_10173', TRUE, '127.0.0.1'),
(10, 'PHI_PROCESSING_RA_10173', TRUE, '127.0.0.1'),
(11, 'PHI_PROCESSING_RA_10173', TRUE, '127.0.0.1'),
(12, 'PHI_PROCESSING_RA_10173', TRUE, '127.0.0.1');

-- Audit Log Genesis Block
INSERT INTO `AUDIT_LOGS` (`user_id`, `action`, `table_affected`, `record_id`, `prev_hash`, `entry_hash`, `ip_address`) VALUES
(1, 'CREATE', 'SYSTEM_INITIALIZATION', 1, 
 '0000000000000000000000000000000000000000000000000000000000000000', 
 SHA2('GENESIS_BLOCK_VALETUDO_HEALTHLINK', 256), 
 '127.0.0.1');

-- Formulary & Stock
INSERT INTO `MEDICINES` (`medicine_id`, `name`, `generic_name`, `form`, `strength`, `unit`, `reorder_level`) VALUES
(1, 'Biogesic', 'Paracetamol', 'Tablet', '500mg', 'pcs', 50),
(2, 'Neozep Forte', 'Phenylephrine HCl + Chlorphenamine + Paracetamol', 'Tablet', '25mg/2mg/500mg', 'pcs', 30),
(3, 'Ventolin Inhaler', 'Salbutamol', 'Inhaler', '100mcg/dose', 'bottle', 5);

INSERT INTO `MEDICINE_BATCHES` (`batch_id`, `medicine_id`, `batch_no`, `manufacture_date`, `expiry_date`, `supplier`, `quantity_on_hand`) VALUES
(1, 1, 'BATCH-PAR-2026A', '2026-01-10', '2028-01-10', 'Unilab Philippines', 200),
(2, 2, 'BATCH-NZP-2026B', '2026-02-15', '2027-08-15', 'Unilab Philippines', 150),
(3, 3, 'BATCH-SLB-2025X', '2025-06-01', '2027-06-01', 'GlaxoSmithKline', 15);