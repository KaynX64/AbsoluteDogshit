import { ensureColumns, ensureIndex } from './schema.js';

export const knownDemoIdentity = `(user_id, BINARY LOWER(email), BINARY first_name, BINARY last_name) IN (
        (1, 'admin@psu.edu.ph', 'Clark', 'Castro'), (2, 'doctor@psu.edu.ph', 'Juan', 'Mata'),
        (3, 'nurse@psu.edu.ph', 'Dimples', 'Arenas'), (4, 'responder@psu.edu.ph', 'Denver', 'Cerezo'),
        (5, 'student@psu.edu.ph', 'Daniella', 'Movida'), (6, 'dentist@psu.edu.ph', 'Carmela', 'Reyes'),
        (7, 'faculty@psu.edu.ph', 'Ramon', 'Bautista'), (8, 'nonteaching@psu.edu.ph', 'Ernesto', 'Domingo'),
        (12, 'rachelle.demo@psu.edu.ph', 'Rachelle', 'Demo')
      ) OR (BINARY last_name = 'Synthetic Clinic Demo' AND BINARY LOWER(email) IN (
        'clinic-avery@example.invalid', 'clinic-blair@example.invalid', 'clinic-casey@example.invalid',
        'clinic-devon@example.invalid', 'clinic-ellis@example.invalid', 'clinic-finley@example.invalid'
      ))`;

export default {
  version: 19,
  name: 'Mobile Google sign-in',
  async schema(connection) {
    await ensureColumns(connection, [
      { table: 'USERS', column: 'google_subject', type: 'VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL' },
      { table: 'USERS', column: 'is_demo_account', type: 'TINYINT(1) NOT NULL DEFAULT 0' },
    ]);
    await ensureIndex(connection, 'USERS', 'uq_users_google_subject', 'google_subject', { unique: true });
  },
  async data(connection) {
    await connection.query(`UPDATE USERS SET is_demo_account = TRUE
      WHERE ${knownDemoIdentity}`);
  },
};
