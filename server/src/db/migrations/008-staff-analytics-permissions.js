// Creates the table for account-level analytics overrides for clinical staff.

export default {
  version: 8,
  name: 'staff analytics permissions',
  async schema(connection) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS STAFF_ANALYTICS_PERMISSIONS (
        user_id BIGINT NOT NULL PRIMARY KEY,
        scopes JSON NOT NULL,
        CONSTRAINT fk_staff_analytics_user FOREIGN KEY (user_id) REFERENCES USERS (user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  },
};
