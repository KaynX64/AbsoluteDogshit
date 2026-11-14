// Locks accounts and applies role changes while preserving admin protections and role profile consistency.

import { resolveAdminPermissions } from '../../middleware/rbac.js';
import { fail } from '../../utils/httpError.js';
import { getUserRoleCode } from './permissions.js';

const profileTable = {
  STUDENT: 'STUDENT_PROFILES',
  FACULTY: 'FACULTY_PROFILES',
  NON_TEACHING: 'NON_TEACHING_PROFILES',
  DOCTOR: 'STAFF_PROFILES',
  DENTIST: 'STAFF_PROFILES',
  NURSE: 'STAFF_PROFILES',
  EMERGENCY_RESPONDER: 'STAFF_PROFILES',
  ADMIN: 'STAFF_PROFILES',
};
const profileTables = [...new Set(Object.values(profileTable))];

export async function lockAccount(connection, userId) {
  const [[account]] = await connection.query(
    'SELECT is_active FROM USERS WHERE user_id = ? AND deleted_at IS NULL FOR UPDATE',
    [userId],
  );
  if (!account) throw fail('User not found.', 404);
  return account;
}

export async function readAccountRoleAccess(connection, userId, callerId) {
  const previousRole = await getUserRoleCode(connection, userId);
  const { isSuper } = await resolveAdminPermissions(callerId, connection);
  return { previousRole, isSuper };
}

export async function changeAccountRole(connection, { userId, role, access, license }) {
  const { previousRole, isSuper } = access;
  if (!isSuper && (role === 'ADMIN' || previousRole === 'ADMIN')) {
    throw fail('Only a Super Admin can perform this administrator-account action.', 403);
  }

  if (typeof role !== 'string' || !Object.hasOwn(profileTable, role)) throw fail('Invalid role code.');
  const [[selected]] = await connection.query('SELECT role_id FROM ROLES WHERE code = ?', [role]);
  if (!selected) throw fail(`Invalid role code: ${role}`);

  if (['DOCTOR', 'DENTIST', 'NURSE'].includes(role)) {
    if (license === undefined) {
      const [[staff]] = await connection.query('SELECT license_no FROM STAFF_PROFILES WHERE user_id = ?', [userId]);
      license = staff?.license_no;
    }
    if (typeof license !== 'string' || !license.trim()) {
      throw fail('A PRC license number is required for DOCTOR, DENTIST and NURSE accounts.');
    }
  }

  await connection.query('DELETE FROM USER_ROLES WHERE user_id = ?', [userId]);
  await connection.query('INSERT INTO USER_ROLES (user_id, role_id) VALUES (?, ?)', [userId, selected.role_id]);
  if (role !== previousRole) {
    for (const table of profileTables) {
      if (table !== profileTable[role]) await connection.query('DELETE FROM ?? WHERE user_id = ?', [table, userId]);
    }
  }
  if ((previousRole === 'ADMIN') !== (role === 'ADMIN')) {
    await connection.query('DELETE FROM USER_ADMIN_PERMISSIONS WHERE user_id = ?', [userId]);
  }
  return license;
}
