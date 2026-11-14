// Coordinates account, role, permission, and health profile updates in one audited transaction.

import { inTransaction } from '../../db/transaction.js';
import { fail } from '../../utils/httpError.js';
import { logAudit } from '../../utils/auditLogger.js';
import { changeAccountRole, lockAccount, readAccountRoleAccess } from './roleChanges.js';
import { saveHealthProfile } from './healthProfile.js';
import { saveRoleProfile } from './roleProfile.js';

export function updateAccount(targetUserId, fields, { actorId, ipAddress }) {
  const { first_name, last_name, email, phone, is_active, role_code, health_profile } = fields;
  return inTransaction(async connection => {
    const account = await lockAccount(connection, targetUserId);
    const nextActive = is_active === undefined ? Number(Boolean(account.is_active)) : Number(Boolean(is_active));
    const access = await readAccountRoleAccess(connection, targetUserId, actorId);
    const limitedOwnAdmin = !access.isSuper && access.previousRole === 'ADMIN';
    if (limitedOwnAdmin) {
      if (targetUserId !== Number(actorId)) throw fail('Only a Super Admin can modify another administrator account.', 403);
      if (role_code && role_code !== 'ADMIN') {
        throw fail('You cannot change the role of your own administrator account. Ask a Super Admin.', 403);
      }
      if (!nextActive) throw fail('You cannot suspend your own administrator account.', 403);
    }
    if (!access.isSuper && role_code === 'ADMIN' && access.previousRole !== 'ADMIN') {
      throw fail('Only a Super Admin can assign the ADMIN role.', 403);
    }

    const [existingEmail] = await connection.query(
      'SELECT user_id FROM USERS WHERE email = ? AND user_id != ? AND deleted_at IS NULL',
      [email.trim(), targetUserId],
    );
    if (existingEmail.length) throw fail('Email address is already in use by another account.');

    // 2. Update core USERS identity record
    await connection.query(
      `UPDATE USERS
     SET first_name = ?, last_name = ?, email = ?, phone = ?, is_active = ?, version = version + 1
     WHERE user_id = ?`,
      [
        first_name.trim(),
        last_name.trim(),
        email.trim(),
        phone ? phone.trim() : null,
        nextActive,
        targetUserId,
      ]
    );

    let license = fields.license_no;
    if (role_code && !limitedOwnAdmin) {
      license = await changeAccountRole(connection, { userId: targetUserId, role: role_code, access, license });
    }
    await saveRoleProfile(connection, targetUserId, { ...fields, license_no: license });
    await saveHealthProfile(connection, targetUserId, health_profile, { actorId, ipAddress });

    await logAudit(connection, {
      userId: actorId,
      action: 'UPDATE',
      table: 'USERS',
      recordId: targetUserId,
      oldValue: null,
      newValue: {
        operation: 'ADMIN_PROFILE_AND_CREDENTIAL_OVERRIDE',
        first_name,
        last_name,
        email,
        phone,
        role_code,
        is_active,
      },
      ipAddress,
    });
  });
}
