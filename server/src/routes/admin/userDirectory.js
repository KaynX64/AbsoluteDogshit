// Lists active and archived accounts, applies account archival rules, and serves health profiles.

import { pool } from '../../db/pool.js';
import { requirePermission, resolveAdminPermissions } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { requireSuperAdminCaller } from '../../admin/accounts/permissions.js';

export function registerUserDirectoryRoutes(router, io) {
  // 1. GET /api/admin/users - Comprehensive User Accounts, Roles & Sub-profiles
  router.get('/users', requirePermission('USERS_MANAGE'), async (req, res) => {
    try {
      const includeArchived = req.query.archived === 'true';
      const [users] = await pool.query(
        `SELECT u.user_id as id,
              u.first_name,
              u.last_name,
              CONCAT(u.first_name, ' ', u.last_name) as name,
              u.email,
              u.phone,
              COALESCE(r.code, 'STUDENT') as role,
              u.is_active,
              CASE
                WHEN u.deleted_at IS NOT NULL THEN 'Archived'
                WHEN u.is_active = TRUE THEN 'Active'
                ELSE 'Suspended'
              END as status,
              u.created_at,
              u.deleted_at as archived_at,
              u.is_qualified_responder,
              DATE_FORMAT(u.qualified_responder_since, '%Y-%m-%d %H:%i') as qualified_responder_since,
              u.qualified_responder_note,
              CASE WHEN r.code IN ('EMERGENCY_RESPONDER', 'NURSE', 'DOCTOR', 'ADMIN')
                   THEN TRUE ELSE FALSE END as sos_via_role,
              sp.student_no, sp.course, sp.year_level,
              fp.faculty_no,
              ntp.employee_no,
              st.admin_no, st.license_no, st.specialty,
              COALESCE(
                st.department,
                fp.department,
                ntp.department,
                'PSU Lingayen'
              ) as department,
              COALESCE(fp.position, ntp.position) AS position,
              (
                SELECT GROUP_CONCAT(ap.code ORDER BY ap.sort_order SEPARATOR ',')
                FROM USER_ADMIN_PERMISSIONS uap
                INNER JOIN ADMIN_PERMISSIONS ap ON uap.permission_id = ap.permission_id
                WHERE uap.user_id = u.user_id
              ) as admin_permissions_raw
       FROM USERS u
       LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
       LEFT JOIN ROLES r ON ur.role_id = r.role_id
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
       LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
       LEFT JOIN NON_TEACHING_PROFILES ntp ON u.user_id = ntp.user_id
       WHERE u.deleted_at IS ${includeArchived ? 'NOT ' : ''}NULL
       ORDER BY u.user_id ASC`
      );

      // Derive the admin archetype per user (additive fields; non-admins get null).
      const enriched = users.map((u) => {
        // Normalize the flag for JSON consumers (MySQL TINYINT arrives as 0/1).
        u.is_qualified_responder = Boolean(u.is_qualified_responder);
        u.sos_via_role = Boolean(u.sos_via_role);
        if (u.role !== 'ADMIN') {
          return { ...u, admin_permissions: null, admin_archetype: null };
        }
        const granted = (u.admin_permissions_raw || '').split(',').map((c) => c.trim()).filter(Boolean);
        delete u.admin_permissions_raw;
        if (granted.length === 0 || granted.includes('SUPER_ADMIN')) {
          return { ...u, admin_permissions: ['SUPER_ADMIN'], admin_archetype: 'super' };
        }
        return { ...u, admin_permissions: granted, admin_archetype: 'limited' };
      });

      res.json(enriched);
    } catch (error) {
      console.error('Failed to retrieve system users:', error);
      res.status(500).json({ error: 'Failed to retrieve system users.' });
    }
  });

  // Archive an account without deleting clinical or audit history.
  router.delete('/users/:id', requirePermission('USERS_MANAGE'), async (req, res) => {
    const targetUserId = Number(req.params.id);
    if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }
    if (targetUserId === Number(req.user.user_id)) {
      return res.status(400).json({ error: 'You cannot archive your own account.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [existingRows] = await connection.query(
        'SELECT user_id FROM USERS WHERE user_id = ? AND deleted_at IS NULL',
        [targetUserId]
      );
      if (existingRows.length === 0) {
        throw Object.assign(new Error('Account not found.'), { status: 404 });
      }

      const [adminLocks] = await connection.query(
        `SELECT u.user_id
       FROM USERS u
       WHERE u.is_active = TRUE AND u.deleted_at IS NULL
         AND EXISTS (
           SELECT 1
           FROM USER_ROLES ur
           INNER JOIN ROLES r ON ur.role_id = r.role_id
           WHERE ur.user_id = u.user_id AND r.code = 'ADMIN'
         )
       ORDER BY u.user_id
       FOR UPDATE`
      );
      const activeAccountIds = adminLocks.map((row) => row.user_id);
      const [activeAdminRows] = activeAccountIds.length > 0
        ? await connection.query(
          `SELECT ur.user_id
         FROM USER_ROLES ur
         INNER JOIN ROLES r ON ur.role_id = r.role_id
         WHERE ur.user_id IN (?) AND r.code = 'ADMIN'
         FOR UPDATE`,
          [activeAccountIds]
        )
        : [[]];
      const activeAdminIds = activeAdminRows.map((row) => row.user_id);
      const [activePermissionRows] = activeAdminIds.length > 0
        ? await connection.query(
          `SELECT uap.user_id, ap.code
         FROM USER_ADMIN_PERMISSIONS uap
         INNER JOIN ADMIN_PERMISSIONS ap ON uap.permission_id = ap.permission_id
         WHERE uap.user_id IN (?)
         FOR UPDATE`,
          [activeAdminIds]
        )
        : [[]];
      const grantsByUser = new Map();
      for (const row of activePermissionRows) {
        const codes = grantsByUser.get(Number(row.user_id)) || [];
        codes.push(row.code);
        grantsByUser.set(Number(row.user_id), codes);
      }

      const [targetRows] = await connection.query(
        'SELECT user_id, is_active FROM USERS WHERE user_id = ? AND deleted_at IS NULL FOR UPDATE',
        [targetUserId]
      );
      if (targetRows.length === 0) {
        throw Object.assign(new Error('Account not found.'), { status: 404 });
      }

      const [roleRows] = await connection.query(
        `SELECT r.code
       FROM USER_ROLES ur
       INNER JOIN ROLES r ON ur.role_id = r.role_id
       WHERE ur.user_id = ?
       FOR UPDATE`,
        [targetUserId]
      );
      const targetRole = roleRows.some((row) => row.code === 'ADMIN')
        ? 'ADMIN'
        : (roleRows[0]?.code || null);

      if (targetRole === 'ADMIN') {
        await requireSuperAdminCaller(req);
        const targetCodes = grantsByUser.get(targetUserId) || [];
        const targetIsSuper = targetCodes.length === 0 || targetCodes.includes('SUPER_ADMIN');
        if (targetRows[0].is_active && targetIsSuper) {
          const activeSuperCount = activeAdminRows.filter((row) => {
            const codes = grantsByUser.get(Number(row.user_id)) || [];
            return codes.length === 0 || codes.includes('SUPER_ADMIN');
          }).length;
          if (activeSuperCount <= 1) {
            throw Object.assign(new Error('The last active Super Admin account cannot be archived.'), { status: 409 });
          }
        }
      }

      await connection.query(
        `UPDATE USERS
       SET is_active = FALSE,
           is_qualified_responder = FALSE,
           qualified_responder_since = NULL,
           qualified_responder_note = NULL,
           deleted_at = NOW(),
           version = version + 1
       WHERE user_id = ? AND deleted_at IS NULL`,
        [targetUserId]
      );
      await connection.query('DELETE FROM DEVICE_TOKENS WHERE user_id = ?', [targetUserId]);
      await logAudit(connection, {
        userId: req.user.user_id,
        action: 'DELETE',
        table: 'USERS',
        recordId: targetUserId,
        oldValue: { is_active: Boolean(targetRows[0].is_active), deleted_at: null },
        newValue: { operation: 'ADMIN_ARCHIVE_USER_ACCOUNT', is_active: false, deleted_at: true },
        ipAddress: req.ip,
      });

      await connection.commit();
      io?.in(`user:${targetUserId}`).disconnectSockets(true);
      return res.json({ message: 'Account archived. Clinical and audit history has been retained.' });
    } catch (error) {
      await connection.rollback();
      if (error.status) return res.status(error.status).json({ error: error.message });
      console.error('Failed to archive user account:', error);
      return res.status(500).json({ error: 'Failed to archive user account.' });
    } finally {
      connection.release();
    }
  });
}

export function registerUserHealthProfileRoute(router) {
  // 1c. GET /api/admin/users/:id/health-profile — Advanced profile editor
  // data source. Returns the decrypted HEALTH_PROFILES row (allergies and
  // chronic_conditions are AES-256-GCM encrypted at rest), the clinical
  // signature enrolment status for staff roles, and read-only account
  // metadata for the Advanced mode info panel.
  router.get('/users/:id/health-profile', requirePermission('USERS_MANAGE'), async (req, res) => {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }

    try {
      const [targetRows] = await pool.query(
        `SELECT u.user_id, u.created_at, u.updated_at, u.version, r.code as role_code
       FROM USERS u
       LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
       LEFT JOIN ROLES r ON ur.role_id = r.role_id
       WHERE u.user_id = ? AND u.deleted_at IS NULL`,
        [targetUserId]
      );
      if (targetRows.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }

      // Multi-role safe: ADMIN wins over any secondary role so the
      // admin-lifecycle guard below cannot be sidestepped.
      const role_code = targetRows.some((r) => r.role_code === 'ADMIN')
        ? 'ADMIN'
        : (targetRows[0].role_code || 'STUDENT');

      // Admin-lifecycle parity with PUT /users/:id — another administrator's
      // data is off-limits to limited admins (self stays viewable so the
      // Advanced editor keeps working for their own account).
      const callerPerms = await resolveAdminPermissions(req.user.user_id);
      if (role_code === 'ADMIN' && !callerPerms.isSuper && targetUserId !== Number(req.user.user_id)) {
        return res.status(403).json({ error: 'Only a Super Admin can view another administrator account.' });
      }

      const [hpRows] = await pool.query(
        `SELECT blood_type, allergies, chronic_conditions,
              emergency_contact_name, emergency_contact_phone,
              sex, DATE_FORMAT(date_of_birth, '%Y-%m-%d') as date_of_birth,
              height, weight, bmi, version as hp_version,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') as hp_updated_at
       FROM HEALTH_PROFILES
       WHERE user_id = ? AND deleted_at IS NULL`,
        [targetUserId]
      );

      let health_profile = null;
      if (hpRows.length > 0) {
        const hp = hpRows[0];
        health_profile = {
          ...hp,
          allergies: decrypt(hp.allergies) || '',
          chronic_conditions: decrypt(hp.chronic_conditions) || '',
        };
      }

      // Clinical signature enrolment (STAFF_PROFILES). Read-only: signatures
      // are enrolled cryptographically via SignatureEnrollment and are never
      // hand-edited from the console.
      let staff_signature = null;
      if (['DOCTOR', 'DENTIST', 'NURSE', 'EMERGENCY_RESPONDER', 'ADMIN'].includes(role_code)) {
        const [sigRows] = await pool.query(
          `SELECT signature_sha256, DATE_FORMAT(signature_updated_at, '%Y-%m-%d %H:%i') as signature_updated_at
         FROM STAFF_PROFILES WHERE user_id = ?`,
          [targetUserId]
        );
        if (sigRows.length > 0) {
          staff_signature = {
            enrolled: Boolean(sigRows[0].signature_sha256),
            updated_at: sigRows[0].signature_updated_at,
          };
        }
      }

      res.json({
        user_id: targetUserId,
        health_profile,
        staff_signature,
        account: {
          created_at: targetRows[0].created_at,
          updated_at: targetRows[0].updated_at,
          version: targetRows[0].version,
        },
      });
    } catch (error) {
      console.error('[Admin Health Profile Fetch Error]:', error);
      res.status(500).json({ error: 'Failed to load health profile.' });
    }
  });
}
