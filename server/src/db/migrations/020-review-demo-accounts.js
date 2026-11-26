import { knownDemoIdentity } from './019-mobile-google-sign-in.js';

export default {
  version: 20,
  name: 'Quarantine unverified seed identities',
  async schema() {},
  async data(connection) {
    // Disable ambiguous prior classifications and invalidate any shared credential.
    await connection.query(`UPDATE USERS SET is_active = FALSE, is_demo_account = FALSE,
      password_hash = CONCAT('disabled-', HEX(RANDOM_BYTES(32)))
      WHERE (is_demo_account = TRUE OR BINARY password_hash = '$2b$10$Y5.xe6H/ZbWi0K/RYcQE2uGPh9hdAn/vKWCit/EMDrpqigeOQ45n.')
        AND NOT (${knownDemoIdentity})`);
  },
};
