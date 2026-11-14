// Adds granular analytics grants and seeds Headcount access for eligible existing admins.

export default {
  version: 7,
  name: 'scoped analytics permissions',
  async schema() {},
  async data(connection) {
    await connection.query(`
      INSERT INTO ADMIN_PERMISSIONS (code, name, description, sort_order) VALUES
      ('ANALYTICS_OPERATIONS', 'View clinic operations', 'Appointments, encounter volumes, department visits and SOS activity.', 51),
      ('ANALYTICS_CLINICAL', 'View clinical analytics', 'Diagnosis counts, respiratory surveillance and health-risk aggregates.', 52),
      ('ANALYTICS_PHARMACY', 'View pharmacy analytics', 'Dispensing, stock priorities and batch expiry.', 53),
      ('ANALYTICS_HEADCOUNT', 'View campus headcount', 'Active account counts by role.', 54),
      ('ANALYTICS_EXPORT', 'Export and print analytics', 'Download or print reports for granted analytics sections.', 56)
      ON DUPLICATE KEY UPDATE code = ADMIN_PERMISSIONS.code
    `);
    await connection.query(`
      INSERT INTO USER_ADMIN_PERMISSIONS (user_id, permission_id)
      SELECT existing.user_id, headcount.permission_id
      FROM USER_ADMIN_PERMISSIONS existing
      JOIN ADMIN_PERMISSIONS base ON base.permission_id = existing.permission_id AND base.code = 'ANALYTICS_VIEW'
      JOIN ADMIN_PERMISSIONS headcount ON headcount.code = 'ANALYTICS_HEADCOUNT'
      WHERE EXISTS (
        SELECT 1 FROM USER_ROLES ur JOIN ROLES r ON r.role_id = ur.role_id
        WHERE ur.user_id = existing.user_id AND r.code = 'ADMIN'
      ) AND NOT EXISTS (
        SELECT 1 FROM USER_ADMIN_PERMISSIONS grants JOIN ADMIN_PERMISSIONS p ON p.permission_id = grants.permission_id
        WHERE grants.user_id = existing.user_id AND p.code = 'SUPER_ADMIN'
      )
      ON DUPLICATE KEY UPDATE granted_by = USER_ADMIN_PERMISSIONS.granted_by
    `);
  },
};
