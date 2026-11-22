// Adds the incident records permission to the admin catalog.

export default {
  version: 6,
  name: 'incident records view permission',
  // Leave the table structure as-is for this permission-only migration.
  async schema() {},
  // Insert the incident archive grant into the administrator permission catalog.
  async data(connection) {
    await connection.query(
      `INSERT INTO ADMIN_PERMISSIONS (code, name, description, sort_order)
       VALUES ('INCIDENT_RECORDS_VIEW', 'View incident records', 'Open the emergency incident archive and view its report PDFs.', 55)
       ON DUPLICATE KEY UPDATE code = ADMIN_PERMISSIONS.code`,
    );
  },
};
