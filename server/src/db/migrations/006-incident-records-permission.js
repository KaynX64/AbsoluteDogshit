export default {
  version: 6,
  name: 'incident records view permission',
  async schema() {},
  async data(connection) {
    await connection.query(
      `INSERT INTO ADMIN_PERMISSIONS (code, name, description, sort_order)
       VALUES ('INCIDENT_RECORDS_VIEW', 'View incident records', 'Open the emergency incident archive and view its report PDFs.', 55)
       ON DUPLICATE KEY UPDATE code = ADMIN_PERMISSIONS.code`,
    );
  },
};
