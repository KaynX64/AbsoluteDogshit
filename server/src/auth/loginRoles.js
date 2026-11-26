export async function loginRoles(connection, userId, lock = false) {
  const [roles] = await connection.query(
    `SELECT r.code
     FROM ROLES r
     INNER JOIN USER_ROLES ur ON r.role_id = ur.role_id
     WHERE ur.user_id = ?${lock ? ' FOR SHARE' : ''}`,
    [userId]
  );

  return roles.map((r) => r.code);
}
