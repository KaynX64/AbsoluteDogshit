export default {
  version: 10,
  name: 'Terminal access permission',
  async schema() {},
  async data(connection) {
    await connection.query(
      `INSERT INTO ADMIN_PERMISSIONS (code, name, description, sort_order)
       VALUES ('TERMINAL_VIEW', 'Use server Terminal', 'View server events and run built-in diagnostics.', 57)
       ON DUPLICATE KEY UPDATE code = ADMIN_PERMISSIONS.code`,
    );
  },
};
