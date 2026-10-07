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