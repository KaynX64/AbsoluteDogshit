// server/src/routes/admin.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles, requirePermission, resolveAdminPermissions, getAdminPermissionCodes } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';
import { logPhiAccess } from '../utils/phiLogger.js';
import {
  isReadOnlyTable,
  isSecurityTable,
  isSecretCol,
  readOnlyMessage,
  securityTableMessage,
  phiPatientSource,
  fail,
  normalizeValue,
  maskRowForDisplay,
  auditSafe,
  assertKnownColumns,
  assertPrimaryKey,
  protectValues,
  planDelete,
  shouldBumpVersion,
} from '../utils/dbStudioGuard.js';
import { isRedisActive } from '../utils/redisClient.js';
import { evaluatePasswordStrength } from '../utils/passwordPolicy.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { parseQualifiedResponderBody } from '../utils/responderAccess.js';
import bcrypt from 'bcryptjs';

// Exported as a FACTORY (like appointmentRoutes / emergencyRouter) so the
// qualified-responder endpoint can emit responder:status_changed over
// Socket.IO to the target user's per-user room.
export default function adminRouter(io) {
const router = express.Router();

router.use(authenticateToken, requireRoles('ADMIN'));

/* ═════════════════════════════════════════════════════════════════════════
   ADMIN ARCHETYPE PERMISSIONS — shared helpers (local to this router)

   Hierarchy model (adjusted manage-user-account feature):
   • Super admins (explicit SUPER_ADMIN grant, or legacy admins with no
     grant rows) own the whole administrator lifecycle. Only they may
     create ADMIN accounts, assign or change the ADMIN role, edit another
     administrator's account/permissions, or override an administrator's
     password.
   • Limited (non-super) admins manage REGULAR user accounts only — they
     can create/edit/suspend students, faculty, staff and clinical roles,
     and reset those accounts' passwords. Administrator accounts are
     read-only for them (they may still edit their own profile fields,
     with their own role/status locked).
   • Role changes away from ADMIN clear stale grants.
   ═══════════════════════════════════════════════════════════════════════ */

/** Validate requested permission codes against the catalog; returns deduped list. */
async function validatePermissionCodes(connection, requested) {
  if (!Array.isArray(requested)) {
    throw new Error('admin_permissions must be an array of permission codes.');
  }
  const codes = [...new Set(requested.map((c) => String(c).trim()).filter(Boolean))];
  if (codes.length === 0) return [];
  const [rows] = await connection.query(
    'SELECT code FROM ADMIN_PERMISSIONS WHERE code IN (?)',
    [codes]
  );
  const known = new Set(rows.map((r) => r.code));
  const unknown = codes.filter((c) => !known.has(c));
  if (unknown.length > 0) {
    throw new Error(`Unknown admin permission code(s): ${unknown.join(', ')}`);
  }
  return codes;
}

/**
 * Replace a user's admin-permission grants inside an open transaction.
 * codes === ['SUPER_ADMIN']  → explicit super admin.
 * codes === []               → clear grants (legacy full access).
 */
async function setAdminPermissionGrants(connection, targetUserId, codes, grantorId) {
  await connection.query('DELETE FROM USER_ADMIN_PERMISSIONS WHERE user_id = ?', [targetUserId]);
  if (!codes || codes.length === 0) return;
  const [permRows] = await connection.query(
    'SELECT permission_id, code FROM ADMIN_PERMISSIONS WHERE code IN (?)',
    [codes]
  );
  for (const row of permRows) {
    await connection.query(
      'INSERT INTO USER_ADMIN_PERMISSIONS (user_id, permission_id, granted_by) VALUES (?, ?, ?)',
      [targetUserId, row.permission_id, grantorId || null]
    );
  }
}

/**
 * Guard helper — resolves the caller's archetype and throws a 403 failure
 * unless the caller is a Super Admin. Used by every admin-lifecycle route
 * so non-super admins cannot create, promote, edit or override
 * administrator accounts (including Super Admin passwords).
 */
async function requireSuperAdminCaller(req) {
  const caller = await resolveAdminPermissions(req.user.user_id);
  if (!caller.isSuper) {
    throw fail('Only a Super Admin can perform this administrator-account action.', 403);
  }
  return caller;
}

/** Current role code of a user (null when the user holds no role row).
 *  Multi-role safe: ADMIN wins over any secondary role so admin-lifecycle
 *  guards can never be sidestepped by a stray extra USER_ROLES row. */
async function getUserRoleCode(connection, userId) {
  const [rows] = await connection.query(
    `SELECT r.code FROM USER_ROLES ur INNER JOIN ROLES r ON ur.role_id = r.role_id
     WHERE ur.user_id = ?`,
    [userId]
  );
  if (rows.some((r) => r.code === 'ADMIN')) return 'ADMIN';
  return rows.length > 0 ? rows[0].code : null;
}

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

// 1a. GET /api/admin/permissions - Admin archetype permission catalog
router.get('/permissions', async (req, res) => {
  try {
    const [perms] = await pool.query(
      'SELECT code, name, description, sort_order FROM ADMIN_PERMISSIONS ORDER BY sort_order ASC'
    );
    const caller = await resolveAdminPermissions(req.user.user_id);
    res.json({
      permissions: perms,
      caller: {
        is_super: caller.isSuper,
        codes: caller.codes,
      },
    });
  } catch (error) {
    console.error('Failed to retrieve permission catalog:', error);
    res.status(500).json({ error: 'Failed to retrieve permission catalog.' });
  }
});

// 1b. GET /api/admin/my-permissions - Caller's effective admin permission state
router.get('/my-permissions', async (req, res) => {
  try {
    const state = await resolveAdminPermissions(req.user.user_id);
    res.json({
      user_id: req.user.user_id,
      archetype: state.isSuper ? 'super' : 'limited',
      is_super: state.isSuper,
      permissions: state.codes,
    });
  } catch (error) {
    console.error('Failed to resolve caller permissions:', error);
    res.status(500).json({ error: 'Failed to resolve caller permissions.' });
  }
});

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

// 2. GET /api/admin/phi-access-logs - PHI Surveillance Log
router.get('/phi-access-logs', requirePermission('AUDIT_VIEW'), async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT p.access_id as id,
              CONCAT(v.first_name, ' ', v.last_name) as viewer_name,
              v.email as viewer_email,
              COALESCE(r.code, 'STAFF') as viewer_role,
              CONCAT(pt.first_name, ' ', pt.last_name) as patient_name,
              sp.student_no,
              p.table_affected,
              p.purpose,
              p.accessed_at,
              p.ip_address
       FROM PHI_ACCESS_LOGS p
       JOIN USERS v ON p.user_id = v.user_id
       LEFT JOIN USER_ROLES ur ON v.user_id = ur.user_id
       LEFT JOIN ROLES r ON ur.role_id = r.role_id
       JOIN USERS pt ON p.patient_user_id = pt.user_id
       LEFT JOIN STUDENT_PROFILES sp ON pt.user_id = sp.user_id
       ORDER BY p.access_id DESC
       LIMIT 100`
    );
    res.json(logs);
  } catch (error) {
    console.error('Failed to retrieve PHI access logs:', error);
    res.status(500).json({ error: 'Failed to retrieve PHI access logs.' });
  }
});

// 3. PATCH /api/admin/users/:id/role - Role assignment
router.patch('/users/:id/role', requirePermission('USERS_MANAGE'), async (req, res) => {
  const targetUserId = req.params.id;
  const { role_code } = req.body;

  if (!role_code) return res.status(400).json({ error: 'role_code is required.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [roleRows] = await connection.query('SELECT role_id FROM ROLES WHERE code = ?', [role_code]);
    if (roleRows.length === 0) throw new Error('Invalid role code specified.');
    const newRoleId = roleRows[0].role_id;

    // Previous role — needed for admin-permission grant transitions
    const [prevRoleRows] = await connection.query(
      `SELECT r.code FROM USER_ROLES ur INNER JOIN ROLES r ON ur.role_id = r.role_id
       WHERE ur.user_id = ?`,
      [targetUserId]
    );
    const previousRole = prevRoleRows.length > 0 ? prevRoleRows[0].code : null;

    // ── Admin-lifecycle guard (adjusted manage-user-account feature) ──
    // Only Super Admins may assign the ADMIN role or change the role of
    // any existing ADMIN account. Without this, a limited admin could
    // bypass the admin-creation block by creating a STUDENT and then
    // promoting them, or demote/silence a Super Admin.
    if (role_code === 'ADMIN' || previousRole === 'ADMIN') {
      await requireSuperAdminCaller(req);
    }

    if (['DOCTOR', 'DENTIST', 'NURSE'].includes(role_code)) {
      const [lic] = await connection.query(
        'SELECT license_no FROM STAFF_PROFILES WHERE user_id = ?',
        [targetUserId]
      );
      if (lic.length === 0 || !String(lic[0].license_no || '').trim()) {
        throw new Error('Add a PRC license number (Edit User) before assigning the DOCTOR or DENTIST role.');
      }
    }

    await connection.query('DELETE FROM USER_ROLES WHERE user_id = ?', [targetUserId]);
    await connection.query('INSERT INTO USER_ROLES (user_id, role_id) VALUES (?, ?)', [targetUserId, newRoleId]);

    // ── Admin-archetype permission transitions ────────────────────────
    // • Moving AWAY from ADMIN clears stale grants.
    // • Promoting TO ADMIN (Super Admin callers only — guarded above)
    //   leaves the target as a legacy full admin (historical behaviour).
    if (previousRole === 'ADMIN' && role_code !== 'ADMIN') {
      await connection.query('DELETE FROM USER_ADMIN_PERMISSIONS WHERE user_id = ?', [targetUserId]);
    } else if (previousRole !== 'ADMIN' && role_code === 'ADMIN') {
      await connection.query('DELETE FROM USER_ADMIN_PERMISSIONS WHERE user_id = ?', [targetUserId]);
    }

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'UPDATE',
      table: 'USER_ROLES',
      recordId: targetUserId,
      oldValue: null,
      newValue: { assigned_role: role_code },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({ message: `User #${targetUserId} updated to role ${role_code}.` });
  } catch (error) {
    await connection.rollback();
    res.status(error.status || 400).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// 3.1 PUT /api/admin/users/:id - Edit Full Profile & Credentials
router.put('/users/:id', requirePermission('USERS_MANAGE'), async (req, res) => {
  const targetUserId = Number(req.params.id);
  const {
    first_name,
    last_name,
    email,
    phone,
    is_active,
    role_code,
    student_no,
    course,
    year_level,
    faculty_no,
    employee_no,
    license_no,
    admin_no,
    specialty,
    department,
    position,
    health_profile,
  } = req.body;

  if (!first_name || !last_name || !email) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Verify email uniqueness across other accounts
    const [existingEmail] = await connection.query(
      'SELECT user_id FROM USERS WHERE email = ? AND user_id != ? AND deleted_at IS NULL',
      [email.trim(), targetUserId]
    );
    if (existingEmail.length > 0) {
      throw new Error('Email address is already in use by another account.');
    }

    // ── Fix: partial-update safety for is_active ──────────────────────
    // Previously `is_active ? 1 : 0` treated an OMITTED field as "suspend",
    // silently deactivating accounts (and letting a limited admin bypass
    // the self-suspend guard). Resolve the next value up front: an omitted
    // field keeps the account's current status.
    const [currentRows] = await connection.query(
      'SELECT is_active FROM USERS WHERE user_id = ? AND deleted_at IS NULL',
      [targetUserId]
    );
    if (currentRows.length === 0) {
      throw fail('User not found.', 404);
    }
    const nextActive = is_active === undefined ? (currentRows[0].is_active ? 1 : 0) : (is_active ? 1 : 0);

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

    // 3. Update Role Assignment if specified
    // (previousRole is needed by the admin-lifecycle guard below even when
    //  the request does not change the role, so it is fetched up front.)
    const previousRole = await getUserRoleCode(connection, targetUserId);

    // ── Admin-lifecycle guards (adjusted manage-user-account feature) ──
    const callerPerms = await resolveAdminPermissions(req.user.user_id);
    if (!callerPerms.isSuper && previousRole === 'ADMIN') {
      if (targetUserId !== Number(req.user.user_id)) {
        // Another administrator's account: read-only for limited admins.
        throw fail('Only a Super Admin can modify another administrator account.', 403);
      }
      // Self-management is limited to profile fields: a limited admin may
      // not change their own role (which would clear/alter grants) nor
      // suspend their own administrator account. nextActive covers both an
      // explicit false/0 and the omitted-field case (which now resolves to
      // the current status instead of silently deactivating).
      if (role_code && role_code !== 'ADMIN') {
        throw fail('You cannot change the role of your own administrator account. Ask a Super Admin.', 403);
      }
      if (nextActive === 0) {
        throw fail('You cannot suspend your own administrator account.', 403);
      }
    }
    // No non-super caller may mint a new administrator via a role change
    // (closes the create-regular-account-then-promote bypass).
    if (!callerPerms.isSuper && role_code === 'ADMIN' && previousRole !== 'ADMIN') {
      throw fail('Only a Super Admin can assign the ADMIN role.', 403);
    }

    if (role_code) {
      const [roleRows] = await connection.query('SELECT role_id FROM ROLES WHERE code = ?', [role_code]);
      if (roleRows.length === 0) {
        // Fix: previously an unknown role_code was silently skipped — the
        // request answered "updated successfully" while the role (and the
        // sub-profile block below) never changed. Reject it like POST /users.
        throw fail(`Invalid role code: ${role_code}`, 400);
      }
      await connection.query('DELETE FROM USER_ROLES WHERE user_id = ?', [targetUserId]);
      await connection.query('INSERT INTO USER_ROLES (user_id, role_id) VALUES (?, ?)', [
        targetUserId,
        roleRows[0].role_id,
      ]);

      // ── Fix: clean stale sub-profile rows on role CHANGE ───────────
      // Switching STUDENT → FACULTY used to leave the old STUDENT_PROFILES
      // row behind, so the users list and edit modal showed data from BOTH
      // profiles. Keep only the table the NEW role owns.
      if (role_code !== previousRole) {
        const subTableOf = {
          STUDENT: 'STUDENT_PROFILES',
          FACULTY: 'FACULTY_PROFILES',
          NON_TEACHING: 'NON_TEACHING_PROFILES',
          DOCTOR: 'STAFF_PROFILES',
          DENTIST: 'STAFF_PROFILES',
          NURSE: 'STAFF_PROFILES',
          EMERGENCY_RESPONDER: 'STAFF_PROFILES',
          ADMIN: 'STAFF_PROFILES',
        };
        const keep = subTableOf[role_code];
        for (const t of ['STUDENT_PROFILES', 'STAFF_PROFILES', 'FACULTY_PROFILES', 'NON_TEACHING_PROFILES']) {
          if (t !== keep) {
            await connection.query(`DELETE FROM ${t} WHERE user_id = ?`, [targetUserId]);
          }
        }
      }

      // ── Admin-archetype permission transitions (mirrors PATCH :id/role) ──
      // Callers are Super Admins by this point (guards above); promotions
      // to ADMIN keep the historical legacy-full-admin behaviour, and
      // leaving the ADMIN role clears stale grants.
      if (previousRole === 'ADMIN' && role_code !== 'ADMIN') {
        await connection.query('DELETE FROM USER_ADMIN_PERMISSIONS WHERE user_id = ?', [targetUserId]);
      } else if (previousRole !== 'ADMIN' && role_code === 'ADMIN') {
        await connection.query('DELETE FROM USER_ADMIN_PERMISSIONS WHERE user_id = ?', [targetUserId]);
      }
      // ADMIN → ADMIN: existing grants are managed via the dedicated
      // PUT /users/:id/permissions endpoint and are left untouched here.
    }

    // 4. Update Role-Specific Sub-profile Table
    if (role_code === 'STUDENT' && student_no) {
      await connection.query(
        `INSERT INTO STUDENT_PROFILES (user_id, student_no, course, year_level)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE student_no = VALUES(student_no), course = VALUES(course), year_level = VALUES(year_level)`,
        [targetUserId, student_no.trim(), course ? course.trim() : 'General', Number(year_level) || 1]
      );
    } else if (['DOCTOR', 'DENTIST', 'NURSE', 'EMERGENCY_RESPONDER', 'ADMIN'].includes(role_code)) {
            if (['DOCTOR', 'DENTIST', 'NURSE'].includes(role_code) && !(license_no && String(license_no).trim())) {
        throw new Error('A PRC license number is required for DOCTOR, DENTIST and NURSE accounts.');
      }
      // admin_no is only meaningful for the ADMIN role. For clinical staff
      // it stays NULL so the column stays semantically clean.
      const adminNoValue =
        role_code === 'ADMIN' && admin_no ? admin_no.trim() : null;

      await connection.query(
        `INSERT INTO STAFF_PROFILES (user_id, admin_no, license_no, specialty, department)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           admin_no   = VALUES(admin_no),
           license_no = VALUES(license_no),
           specialty  = VALUES(specialty),
           department = VALUES(department)`,
        [
          targetUserId,
          adminNoValue,
          license_no ? license_no.trim() : null,
          specialty ? specialty.trim() : null,
          department ? department.trim() : 'University Infirmary',
        ]
      );
    } else if (role_code === 'FACULTY') {
      if (!faculty_no || !String(faculty_no).trim()) {
        throw new Error('Faculty number is required for FACULTY accounts.');
      }
      await connection.query(
        `INSERT INTO FACULTY_PROFILES (user_id, faculty_no, department, position)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           faculty_no = VALUES(faculty_no),
           department = VALUES(department),
           position   = VALUES(position)`,
        [
          targetUserId,
          String(faculty_no).trim(),
          department ? department.trim() : 'Academic Affairs',
          position ? position.trim() : 'Faculty Member',
        ]
      );
    } else if (role_code === 'NON_TEACHING') {
      await connection.query(
        `INSERT INTO NON_TEACHING_PROFILES (user_id, employee_no, department, position)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           employee_no = VALUES(employee_no),
           department = VALUES(department),
           position = VALUES(position)`,
        [
          targetUserId,
          employee_no ? employee_no.trim() : null,
          department ? department.trim() : 'General Services',
          position ? position.trim() : 'Support Staff',
        ]
      );
    }

    // 4b. Advanced editor — HEALTH_PROFILES override (same transaction).
    // `health_profile` is only sent by the Admin Console's Advanced mode;
    // omitting it (Basic mode / older clients) leaves the health record
    // completely untouched.
    if (health_profile !== undefined) {
      if (health_profile === null || typeof health_profile !== 'object' || Array.isArray(health_profile)) {
        throw fail('health_profile must be an object of health record fields.', 400);
      }

      const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      const hpIn = { ...health_profile };
      // bmi is a GENERATED ALWAYS column derived from height & weight —
      // it can never be written directly (writes would throw SQL errors).
      delete hpIn.bmi;

      const has = (k) => Object.prototype.hasOwnProperty.call(hpIn, k);
      const cleanOptionalText = (value, maxLen, label) => {
        if (value === null || value === undefined) return null;
        const s = String(value).trim();
        if (!s) return null;
        if (s.length > maxLen) throw fail(`${label} must be ${maxLen} characters or fewer.`, 400);
        return s;
      };

      let nextBlood = null;
      if (has('blood_type') && hpIn.blood_type) {
        if (!BLOOD_TYPES.includes(hpIn.blood_type)) {
          throw fail(`Invalid blood type. Allowed values: ${BLOOD_TYPES.join(', ')}.`, 400);
        }
        nextBlood = hpIn.blood_type;
      }

      let nextSex = null;
      if (has('sex') && hpIn.sex) {
        if (!['MALE', 'FEMALE'].includes(hpIn.sex)) {
          throw fail('sex must be MALE or FEMALE.', 400);
        }
        nextSex = hpIn.sex;
      }

      let nextDob = null;
      if (has('date_of_birth') && hpIn.date_of_birth) {
        const dob = String(hpIn.date_of_birth).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) {
          throw fail('date_of_birth must be a valid date in YYYY-MM-DD format.', 400);
        }
        const dobTime = Date.parse(`${dob}T00:00:00Z`);
        if (Number.isNaN(dobTime)) throw fail('date_of_birth must be a valid calendar date.', 400);
        if (dobTime > Date.now()) throw fail('date_of_birth cannot be in the future.', 400);
        if (dobTime < Date.parse('1900-01-01T00:00:00Z')) {
          throw fail('date_of_birth must be after 1900-01-01.', 400);
        }
        nextDob = dob;
      }

      const cleanMetric = (value, min, max, label) => {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        if (!Number.isFinite(num) || num < min || num > max) {
          throw fail(`${label} must be a number between ${min} and ${max}.`, 400);
        }
        return Math.round(num * 100) / 100;
      };
      const nextHeight = has('height') ? cleanMetric(hpIn.height, 30, 300, 'height (cm)') : undefined;
      const nextWeight = has('weight') ? cleanMetric(hpIn.weight, 1, 500, 'weight (kg)') : undefined;
      const nextEmName = has('emergency_contact_name')
        ? cleanOptionalText(hpIn.emergency_contact_name, 150, 'Emergency contact name')
        : undefined;
      const nextEmPhone = has('emergency_contact_phone')
        ? cleanOptionalText(hpIn.emergency_contact_phone, 20, 'Emergency contact phone')
        : undefined;

      // Free-text clinical fields are AES-256-GCM encrypted at rest
      // (mirrors PUT /api/profile/me).
      const encryptText = (value, label) => {
        const t = cleanOptionalText(value, 2000, label);
        return t === null ? null : encrypt(t);
      };
      const nextAllergies = has('allergies') ? encryptText(hpIn.allergies, 'Allergies') : undefined;
      const nextConditions = has('chronic_conditions') ? encryptText(hpIn.chronic_conditions, 'Chronic conditions') : undefined;

      // Lock the row and resolve "keep current" for omitted fields
      // (undefined → existing value, null → explicit clear).
      const [hpLockRows] = await connection.query(
        'SELECT * FROM HEALTH_PROFILES WHERE user_id = ? AND deleted_at IS NULL FOR UPDATE',
        [targetUserId]
      );
      const oldHp = hpLockRows[0] || null;
      const resolve = (provided, oldVal) => (provided === undefined ? (oldVal ?? null) : provided);
      const values = {
        blood_type: resolve(has('blood_type') ? nextBlood : undefined, oldHp?.blood_type),
        sex: resolve(has('sex') ? nextSex : undefined, oldHp?.sex),
        date_of_birth: resolve(has('date_of_birth') ? nextDob : undefined, oldHp?.date_of_birth),
        height: resolve(has('height') ? nextHeight : undefined, oldHp?.height),
        weight: resolve(has('weight') ? nextWeight : undefined, oldHp?.weight),
        emergency_contact_name: resolve(has('emergency_contact_name') ? nextEmName : undefined, oldHp?.emergency_contact_name),
        emergency_contact_phone: resolve(has('emergency_contact_phone') ? nextEmPhone : undefined, oldHp?.emergency_contact_phone),
        allergies: resolve(has('allergies') ? nextAllergies : undefined, oldHp?.allergies),
        chronic_conditions: resolve(has('chronic_conditions') ? nextConditions : undefined, oldHp?.chronic_conditions),
      };

      await connection.query(
        `INSERT INTO HEALTH_PROFILES
           (user_id, blood_type, allergies, chronic_conditions, emergency_contact_name,
            emergency_contact_phone, sex, date_of_birth, height, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           blood_type = VALUES(blood_type),
           allergies = VALUES(allergies),
           chronic_conditions = VALUES(chronic_conditions),
           emergency_contact_name = VALUES(emergency_contact_name),
           emergency_contact_phone = VALUES(emergency_contact_phone),
           sex = VALUES(sex),
           date_of_birth = VALUES(date_of_birth),
           height = VALUES(height),
           weight = VALUES(weight),
           version = version + 1`,
        [
          targetUserId,
          values.blood_type,
          values.allergies,
          values.chronic_conditions,
          values.emergency_contact_name,
          values.emergency_contact_phone,
          values.sex,
          values.date_of_birth,
          values.height,
          values.weight,
        ]
      );

      await logAudit(connection, {
        userId: req.user.user_id,
        action: oldHp ? 'UPDATE' : 'CREATE',
        table: 'HEALTH_PROFILES',
        recordId: oldHp?.profile_id || null,
        oldValue: null,
        newValue: {
          operation: 'ADMIN_ADVANCED_PROFILE_OVERRIDE',
          patient_user_id: targetUserId,
          blood_type: values.blood_type,
          sex: values.sex,
          date_of_birth: values.date_of_birth,
          height: values.height,
          weight: values.weight,
          encrypted: true,
        },
        ipAddress: req.ip,
      });
    }

    // 5. Append to Cryptographic R.A. 10173 Audit Ledger
    await logAudit(connection, {
      userId: req.user.user_id,
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
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({ message: `Account for ${first_name} ${last_name} updated successfully.` });
  } catch (error) {
    await connection.rollback();
    console.error('[Admin Profile Update Error]:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to update user profile.' });
  } finally {
    connection.release();
  }
});

// 3.2 POST /api/admin/users/:id/reset-password - Admin Password Reset
router.post('/users/:id/reset-password', requirePermission('USERS_MANAGE'), async (req, res) => {
  const targetUserId = Number(req.params.id);
  const { newPassword } = req.body;

  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  // ── Server-side password policy (aligned with PUT /api/auth/change-password) ──
  const pwStrength = evaluatePasswordStrength(String(newPassword), {});
  if (!pwStrength.isValid) {
    return res.status(400).json({ error: pwStrength.issues.join(' ') });
  }

  const connection = await pool.getConnection();
  try {
    // Target lookup (also gives a clean 404 for missing accounts) — done
    // before the transaction so the guards below can return directly.
    const [targetRows] = await connection.query(
      `SELECT u.user_id, r.code as role_code
       FROM USERS u
       LEFT JOIN USER_ROLES ur ON ur.user_id = u.user_id
       LEFT JOIN ROLES r ON ur.role_id = r.role_id
       WHERE u.user_id = ? AND u.deleted_at IS NULL`,
      [targetUserId]
    );
    if (targetRows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // ── Admin-lifecycle guard (adjusted manage-user-account feature) ──
    // Administrator passwords — Super Admins included — can only be
    // overridden by another Super Admin. (Limited peers are covered too:
    // letting a limited admin reset a peer's password would let them borrow
    // that peer's permissions.) Limited admins may still reset the
    // passwords of REGULAR user accounts.
    const callerPerms = await resolveAdminPermissions(req.user.user_id);
    // Multi-role safe: ANY held ADMIN role makes the target an administrator
    // (previously only the first joined role row was inspected).
    const targetIsAdmin = targetRows.some((row) => row.role_code === 'ADMIN');
    if (targetIsAdmin && !callerPerms.isSuper) {
      return res.status(403).json({
        error: 'Only a Super Admin can override an administrator password.',
      });
    }

    await connection.beginTransaction();

    const newHash = await bcrypt.hash(newPassword, 10);
    await connection.query('UPDATE USERS SET password_hash = ? WHERE user_id = ?', [newHash, targetUserId]);

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'UPDATE',
      table: 'USERS',
      recordId: targetUserId,
      oldValue: null,
      newValue: { event: 'ADMIN_FORCE_PASSWORD_RESET', target_user_id: targetUserId },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({ message: `Password for User #${targetUserId} has been reset successfully.` });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error('[Admin Password Reset Error]:', error);
    res.status(500).json({ error: 'Failed to reset user password.' });
  } finally {
    connection.release();
  }
});

// 3.3 POST /api/admin/users - Create a brand new user account
router.post('/users', requirePermission('USERS_MANAGE'), async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    password,
    role_code,
    is_active = true,
    student_no,
    course,
    year_level,
    faculty_no,
    employee_no,
    license_no,
    admin_no,
    specialty,
    department,
    position,
    admin_permissions,
  } = req.body;

  // ── Validation ────────────────────────────────────────────────
  if (!first_name || !last_name || !email || !password || !role_code) {
    return res.status(400).json({
      error: 'first_name, last_name, email, password, and role_code are required.',
    });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  // ── Server-side password policy (aligned with PUT /api/auth/change-password) ──
  // Admin-created accounts previously only needed 8 characters, while a
  // user changing their OWN password had to pass the full policy. PHI
  // accounts should not end up weaker because an admin created them.
  const strength = evaluatePasswordStrength(String(password), {
    email: String(email).trim(),
    firstName: String(first_name).trim(),
    lastName: String(last_name).trim(),
  });
  if (!strength.isValid) {
    return res.status(400).json({ error: strength.issues.join(' ') });
  }

  // ── Admin-lifecycle guard (adjusted manage-user-account feature) ──
  // Creating administrator accounts — super or limited — is a Super Admin
  // privilege. Limited admins may still create every REGULAR role account.
  if (role_code === 'ADMIN') {
    const callerPerms = await resolveAdminPermissions(req.user.user_id);
    if (!callerPerms.isSuper) {
      return res.status(403).json({
        error: 'Only a Super Admin can create administrator accounts.',
      });
    }
    // Same empty-set footgun as PUT /users/:id/permissions: [] would be
    // stored as no-grant rows == legacy full super admin.
    if (Array.isArray(admin_permissions) && admin_permissions.length === 0) {
      return res.status(400).json({
        error:
          'admin_permissions cannot be empty — an empty grant set is indistinguishable from a legacy full-access admin. Grant SUPER_ADMIN or at least one limited permission.',
      });
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Email uniqueness check
    const [existingEmail] = await connection.query(
      'SELECT user_id FROM USERS WHERE email = ? AND deleted_at IS NULL',
      [email.trim()]
    );
    if (existingEmail.length > 0) {
      throw new Error('Email address is already in use by another account.');
    }

    // Role must exist in the RBAC table
    const [roleRows] = await connection.query('SELECT role_id FROM ROLES WHERE code = ?', [role_code]);
    if (roleRows.length === 0) {
      throw new Error(`Invalid role code: ${role_code}`);
    }
    const roleId = roleRows[0].role_id;

    // Hash the password with bcrypt
    const passwordHash = await bcrypt.hash(String(password), 10);

    // Insert core USERS identity row
    const [insertResult] = await connection.query(
      `INSERT INTO USERS (email, password_hash, first_name, last_name, phone, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        email.trim(),
        passwordHash,
        first_name.trim(),
        last_name.trim(),
        phone ? String(phone).trim() : null,
        is_active ? 1 : 0,
      ]
    );
    const newUserId = insertResult.insertId;

    // Assign the RBAC role
    await connection.query(
      'INSERT INTO USER_ROLES (user_id, role_id) VALUES (?, ?)',
      [newUserId, roleId]
    );

    // Role-specific sub-profile row
    if (role_code === 'STUDENT') {
      if (!student_no) {
        throw new Error('Student number is required for STUDENT accounts.');
      }
      await connection.query(
        `INSERT INTO STUDENT_PROFILES (user_id, student_no, course, year_level)
         VALUES (?, ?, ?, ?)`,
        [
          newUserId,
          String(student_no).trim(),
          course ? String(course).trim() : 'General',
          Number(year_level) || 1,
        ]
      );
    } else if (['DOCTOR', 'DENTIST', 'NURSE', 'EMERGENCY_RESPONDER', 'ADMIN'].includes(role_code)) {
            if (['DOCTOR', 'DENTIST', 'NURSE'].includes(role_code) && !(license_no && String(license_no).trim())) {
        throw new Error('A PRC license number is required for DOCTOR, DENTIST and NURSE accounts.');
      }
      // admin_no is only meaningful for ADMIN. Clinical staff leave it NULL.
      const adminNoValue =
        role_code === 'ADMIN' && admin_no ? String(admin_no).trim() : null;

      await connection.query(
        `INSERT INTO STAFF_PROFILES (user_id, admin_no, license_no, specialty, department)
         VALUES (?, ?, ?, ?, ?)`,
        [
          newUserId,
          adminNoValue,
          license_no ? String(license_no).trim() : null,
          specialty ? String(specialty).trim() : null,
          department ? String(department).trim() : 'University Infirmary',
        ]
      );
    } else if (role_code === 'FACULTY') {
      if (!faculty_no || !String(faculty_no).trim()) {
        throw new Error('Faculty number is required for FACULTY accounts.');
      }
      await connection.query(
        `INSERT INTO FACULTY_PROFILES (user_id, faculty_no, department, position)
         VALUES (?, ?, ?, ?)`,
        [
          newUserId,
          String(faculty_no).trim(),
          department ? String(department).trim() : 'Academic Affairs',
          position ? String(position).trim() : 'Faculty Member',
        ]
      );
    } else if (role_code === 'NON_TEACHING') {
      await connection.query(
        `INSERT INTO NON_TEACHING_PROFILES (user_id, employee_no, department, position)
         VALUES (?, ?, ?, ?)`,
        [
          newUserId,
          employee_no ? String(employee_no).trim() : null,
          department ? String(department).trim() : 'General Services',
          position ? String(position).trim() : 'Support Staff',
        ]
      );
    }

    // ── Admin archetype grants (only reachable for SUPER callers — the
    //    guard above already rejected limited callers) ────────────────
    // A super admin creating an ADMIN account:
    //   • no/empty admin_permissions → legacy full access (today's behaviour)
    //   • ['SUPER_ADMIN'] → explicit super admin
    //   • other codes → limited to exactly those codes
    if (role_code === 'ADMIN' && admin_permissions !== undefined) {
      const codes = await validatePermissionCodes(connection, admin_permissions);
      await setAdminPermissionGrants(connection, newUserId, codes, req.user.user_id);
    }

    // R.A. 10173 cryptographic audit trail
    // NOTE: never log the plaintext password
    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'CREATE',
      table: 'USERS',
      recordId: newUserId,
      oldValue: null,
      newValue: {
        operation: 'ADMIN_CREATE_USER_ACCOUNT',
        email: email.trim(),
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        role_code,
        is_active: Boolean(is_active),
        ...(role_code === 'ADMIN' ? { admin_permissions: admin_permissions || null } : {}),
      },
      ipAddress: req.ip,
    });

    await connection.commit();

    res.status(201).json({
      message: `Account for ${first_name} ${last_name} created successfully.`,
      userId: newUserId,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[Admin Create User Error]:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to create user account.' });
  } finally {
    connection.release();
  }
});

// 3.4 PUT /api/admin/users/:id/qualified-responder — Qualified Responder flag
// ─────────────────────────────────────────────────────────────────────────
// Role-independent SOS label. Guarded by RESPONDERS_MANAGE (Super Admins
// always pass). Only a Super Admin may change the flag on an ADMIN account.
// PUT /users/:id and POST /users deliberately never read these columns — a
// limited admin holding only USERS_MANAGE therefore cannot flip the flag.
// Role changes never touch it either (role handlers only rewrite USER_ROLES).
router.put('/users/:id/qualified-responder', requirePermission('RESPONDERS_MANAGE'), async (req, res) => {
  const targetUserId = Number(req.params.id);
  const parsed = parseQualifiedResponderBody(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const { is_qualified_responder, note } = parsed.value;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Lock the target row so flag, since-date and note are written atomically.
    const [rows] = await connection.query(
      `SELECT is_qualified_responder, qualified_responder_since, qualified_responder_note
       FROM USERS WHERE user_id = ? FOR UPDATE`,
      [targetUserId]
    );
    if (rows.length === 0) {
      throw fail('User not found.', 404);
    }

    // Admin-target guard: the flag on an ADMIN account is a Super Admin
    // decision (same lifecycle rule as every other administrator field).
    const targetRole = await getUserRoleCode(connection, targetUserId);
    if (targetRole === 'ADMIN') {
      await requireSuperAdminCaller(req);
    }

    const current = rows[0];
    const nextFlag = is_qualified_responder ? 1 : 0;
    // Since-date: set when the flag turns ON (kept when re-saving an already
    // flagged account), cleared when it turns OFF.
    const nextSince = nextFlag === 1
      ? (current.qualified_responder_since || new Date())
      : null;
    // Note: editable while ON; cleared when the flag turns OFF.
    const nextNote = nextFlag === 1 ? (note ?? '') : null;

    const unchanged =
      Boolean(current.is_qualified_responder) === is_qualified_responder &&
      String(current.qualified_responder_note || '') === String(nextNote ?? '');

    if (!unchanged) {
      await connection.query(
        `UPDATE USERS
         SET is_qualified_responder = ?, qualified_responder_since = ?, qualified_responder_note = ?
         WHERE user_id = ?`,
        [nextFlag, nextSince, nextNote, targetUserId]
      );

      // R.A. 10173 ledger entry — no PHI, no medical details.
      await logAudit(connection, {
        userId: req.user.user_id,
        action: 'UPDATE',
        table: 'USERS',
        recordId: targetUserId,
        oldValue: null,
        newValue: {
          operation: 'QUALIFIED_RESPONDER_FLAG_CHANGE',
          is_qualified_responder: is_qualified_responder,
          since: nextSince instanceof Date ? nextSince.toISOString() : nextSince,
          note: nextNote,
        },
        ipAddress: req.ip,
      });
    }

    await connection.commit();

    // Notify the target's connected devices so a phone mid-session starts or
    // stops its SOS listener without a re-login (per-user room delivery).
    if (io) {
      io.to(`user:${targetUserId}`).emit('responder:status_changed', {
        isQualifiedResponder: is_qualified_responder,
      });
    }

    res.json({
      message: unchanged
        ? 'No changes needed.'
        : `Qualified Responder ${is_qualified_responder ? 'granted' : 'revoked'} successfully.`,
      is_qualified_responder,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[Qualified Responder Flag Error]:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to update the flag.' });
  } finally {
    connection.release();
  }
});

// 3.5 PUT /api/admin/users/:id/permissions - Replace an admin's permission set
router.put('/users/:id/permissions', requirePermission('USERS_MANAGE'), async (req, res) => {
  const targetUserId = Number(req.params.id);
  const { admin_permissions } = req.body;

  if (admin_permissions === undefined || !Array.isArray(admin_permissions)) {
    return res.status(400).json({ error: 'admin_permissions must be an array of permission codes.' });
  }

  // ── Fix: empty-set footgun ──────────────────────────────────────────
  // An explicit [] used to be stored as "no grant rows", which the RBAC
  // resolver treats as LEGACY FULL SUPER ADMIN. An operator intending to
  // strip all permissions silently granted the account everything instead.
  // Reject the empty set: to neutralise an admin, demote the role or grant
  // the least-privileged code instead.
  if (admin_permissions.length === 0) {
    return res.status(400).json({
      error:
        'admin_permissions cannot be empty — an empty grant set is indistinguishable from a legacy full-access admin. Demote the account role instead, or grant the least-privileged permission.',
    });
  }

  // Guard: an admin may never modify their own permissions (prevents both
  // self-lockout and self-escalation).
  if (targetUserId === Number(req.user.user_id)) {
    return res.status(403).json({ error: 'You cannot modify your own admin permissions.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Target must hold the ADMIN role (multi-role safe: ANY ADMIN role
    // row qualifies — previously only the first joined row was inspected).
    const [targetRoleRows] = await connection.query(
      `SELECT r.code FROM USER_ROLES ur INNER JOIN ROLES r ON ur.role_id = r.role_id
       WHERE ur.user_id = ?`,
      [targetUserId]
    );
    if (!targetRoleRows.some((r) => r.code === 'ADMIN')) {
      throw new Error('Permissions can only be assigned to ADMIN role accounts.');
    }

    const caller = await resolveAdminPermissions(req.user.user_id);
    let codes = await validatePermissionCodes(connection, admin_permissions);

    // ── Admin-lifecycle guard (adjusted manage-user-account feature) ──
    // Administrator permission sets — super AND limited targets — are
    // managed exclusively by Super Admins. (Previously a limited admin
    // could edit a limited peer's grants; that peer-management path is
    // closed so administrator accounts are fully hands-off for non-supers.)
    if (!caller.isSuper) {
      throw fail('Only a Super Admin can modify administrator permissions.', 403);
    }

    const previousCodes = await getAdminPermissionCodes(targetUserId);
    await setAdminPermissionGrants(connection, targetUserId, codes, req.user.user_id);

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'UPDATE',
      table: 'USER_ADMIN_PERMISSIONS',
      recordId: targetUserId,
      oldValue: { admin_permissions: previousCodes },
      newValue: {
        operation: 'ADMIN_PERMISSION_SET_REPLACE',
        admin_permissions: codes,
        archetype: codes.includes('SUPER_ADMIN') ? 'super' : codes.length === 0 ? 'legacy-full' : 'limited',
      },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({
      message: `Permissions updated for user #${targetUserId}.`,
      admin_permissions: codes.length === 0 ? ['SUPER_ADMIN'] : codes,
      admin_archetype: codes.includes('SUPER_ADMIN') ? 'super' : codes.length === 0 ? 'super' : 'limited',
    });
  } catch (error) {
    await connection.rollback();
    res.status(error.status || 400).json({ error: error.message || 'Failed to update permissions.' });
  } finally {
    connection.release();
  }
});

// 4. GET /api/admin/audit-logs - Append-only Hash Chain
router.get('/audit-logs', requirePermission('AUDIT_VIEW'), async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT a.audit_id as id,
              COALESCE(u.email, 'SYSTEM') as user,
              a.action,
              a.table_affected as target,
              a.entry_hash as hash,
              a.prev_hash,
              a.created_at,
              a.ip_address
       FROM AUDIT_LOGS a
       LEFT JOIN USERS u ON a.user_id = u.user_id
       ORDER BY a.audit_id DESC
       LIMIT 100`
    );
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve audit trail.' });
  }
});

// 5. GET /api/admin/telemetry - Health Status
router.get('/telemetry', requirePermission('TELEMETRY_VIEW'), async (req, res) => {
  try {
    const [dbTest] = await pool.query('SELECT 1 as isAlive');
    const [userCount] = await pool.query('SELECT COUNT(*) as total FROM USERS WHERE is_active = TRUE AND deleted_at IS NULL');
    const [auditCount] = await pool.query('SELECT COUNT(*) as total FROM AUDIT_LOGS');

    res.json({
      database: {
        status: dbTest.length > 0 ? 'Operational' : 'Degraded',
        driver: 'MySQL 8.0 with Spatial SRID 4326',
        totalUsers: userCount[0].total,
        totalAuditBlocks: auditCount[0].total,
      },
      cache: {
        engine: 'Redis 7.0 (In-Memory Queue Cache)',
        status: isRedisActive() ? 'Operational' : 'Fallback (Direct DB)',
      },
      server: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        nodeVersion: process.version,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Telemetry unavailable.' });
  }
});

// =============================================================================
// DATABASE STUDIO: LIVE DB EXPLORER & EDITOR
// =============================================================================

async function getWhitelistedTables() {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME as tableName, TABLE_ROWS as estimatedRows
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME ASC`
  );
  return rows;
}

async function getTableColumns(connection, tableName) {
  const [cols] = await connection.query(
    `SELECT COLUMN_NAME AS name, COLUMN_KEY AS columnKey
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  if (cols.length === 0) throw fail('Table does not exist.', 404);
  return {
    names: new Set(cols.map((c) => c.name)),
    pk: cols.filter((c) => c.columnKey === 'PRI').map((c) => c.name),
  };
}

async function resolvePhiTargets(table, rows, pkCols) {
  const src = phiPatientSource(table);
  if (!src || rows.length === 0) return [];
  const recordIdOf = (row) => (pkCols.length ? row[pkCols[0]] : 0) ?? 0;

  const byPatient = new Map();
  if (!src.via) {
    for (const row of rows) {
      const patientId = row[src.col];
      if (patientId !== null && patientId !== undefined && !byPatient.has(patientId)) {
        byPatient.set(patientId, recordIdOf(row));
      }
    }
  } else {
    const parentKeys = [...new Set(rows.map((r) => r[src.col]).filter((v) => v !== null && v !== undefined))];
    if (parentKeys.length === 0) return [];
    const [parents] = await pool.query(
      `SELECT ?? AS k, ?? AS patient FROM ?? WHERE ?? IN (?)`,
      [src.via.key, src.via.patient, src.via.table, src.via.key, parentKeys]
    );
    const patientOfParent = new Map(parents.map((p) => [p.k, p.patient]));
    for (const row of rows) {
      const patientId = patientOfParent.get(row[src.col]);
      if (patientId !== null && patientId !== undefined && !byPatient.has(patientId)) {
        byPatient.set(patientId, recordIdOf(row));
      }
    }
  }
  return [...byPatient].map(([patientUserId, recordId]) => ({ patientUserId, recordId }));
}

async function logDbStudioRead(req, table, rows, pkCols) {
  try {
    const targets = await resolvePhiTargets(table, rows, pkCols);
    for (const t of targets) {
      await logPhiAccess({
        viewerUserId: req.user.user_id,
        patientUserId: t.patientUserId,
        table,
        recordId: t.recordId,
        purpose: 'Admin DB Studio table browse',
        ipAddress: req.ip,
      });
    }
  } catch (err) {
    console.error('[DB Studio PHI Read Log Error]:', err.message);
  }
}

// 1. GET /api/admin/db/tables
router.get('/db/tables', requirePermission('DATABASE_MANAGE'), async (req, res) => {
  try {
    const tables = await getWhitelistedTables();
    res.json(tables);
  } catch (error) {
    console.error('[DB Studio] Tables fetch error:', error);
    res.status(500).json({ error: 'Failed to retrieve database tables.' });
  }
});

// 2. GET /api/admin/db/tables/:table
router.get('/db/tables/:table', requirePermission('DATABASE_MANAGE'), async (req, res) => {
  const tableName = req.params.table;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  try {
    const tables = await getWhitelistedTables();
    const isValid = tables.some((t) => t.tableName === tableName);
    if (!isValid) return res.status(404).json({ error: 'Table not found in database schema.' });

    const [columns] = await pool.query(
      `SELECT COLUMN_NAME as columnName, DATA_TYPE as dataType, IS_NULLABLE as isNullable,
              COLUMN_KEY as columnKey, EXTRA as extra
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION ASC`,
      [tableName]
    );

    // Identify searchable columns (exclude binary, spatial/geometry, and secret hashed columns)
    const nonSearchableDataTypes = [
      'geometry', 'point', 'linestring', 'polygon',
      'multipoint', 'multilinestring', 'multipolygon', 'geometrycollection',
      'blob', 'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary',
    ];

    const searchableCols = columns
      .filter((c) => {
        const dt = (c.dataType || '').toLowerCase();
        return !nonSearchableDataTypes.includes(dt) && !isSecretCol(tableName, c.columnName);
      })
      .map((c) => c.columnName);

    let countQuery = `SELECT COUNT(*) as total FROM ??`;
    let countParams = [tableName];
    let dataQuery = `SELECT * FROM ??`;
    let dataParams = [tableName];

    if (search && searchableCols.length > 0) {
      const searchPattern = `%${search}%`;
      const whereClause = searchableCols.map(() => `CAST(?? AS CHAR) LIKE ?`).join(' OR ');
      const searchParams = searchableCols.flatMap((col) => [col, searchPattern]);

      countQuery += ` WHERE (${whereClause})`;
      countParams.push(...searchParams);

      dataQuery += ` WHERE (${whereClause})`;
      dataParams.push(...searchParams);
    }

    dataQuery += ` LIMIT ? OFFSET ?`;
    dataParams.push(limit, offset);

    const [countResult] = await pool.query(countQuery, countParams);
    const totalRows = countResult[0]?.total || 0;

    const [rawRows] = await pool.query(dataQuery, dataParams);
    const rows = rawRows.map((r) => maskRowForDisplay(tableName, r));

    const pkCols = columns.filter((c) => c.columnKey === 'PRI').map((c) => c.columnName);
    void logDbStudioRead(req, tableName, rawRows, pkCols);

    // Per-caller read-only state: statutory ledgers are read-only for
    // everyone; account-security tables are read-only for limited admins.
    const callerPerms = await resolveAdminPermissions(req.user.user_id);
    const auditLocked = isReadOnlyTable(tableName);
    const securityLocked = !auditLocked && isSecurityTable(tableName) && !callerPerms.isSuper;

    res.json({
      tableName,
      columns,
      totalRows,
      page,
      limit,
      totalPages: Math.ceil(totalRows / limit) || 1,
      rows,
      isReadOnly: auditLocked || securityLocked,
      readOnlyReason: auditLocked ? 'audit' : securityLocked ? 'security' : null,
      searchQuery: search,
    });
  } catch (error) {
    console.error('[DB Studio] Table query error:', error);
    res.status(500).json({ error: 'Failed to retrieve table data.' });
  }
});

// 3. POST /api/admin/db/tables/:table/rows
router.post('/db/tables/:table/rows', requirePermission('DATABASE_MANAGE'), async (req, res) => {
  const tableName = req.params.table;
  const rowData = req.body;

  if (isReadOnlyTable(tableName)) {
    return res.status(403).json({ error: readOnlyMessage(tableName) });
  }

  // ── Security-table guard (adjusted manage-user-account feature) ──
  // Account-security tables (USERS, ROLES, USER_ROLES, ADMIN_PERMISSIONS,
  // USER_ADMIN_PERMISSIONS) are writable from DB Studio only by Super
  // Admins — otherwise a limited admin with DATABASE_MANAGE could mint
  // admin accounts or override admin passwords outside User Management.
  if (isSecurityTable(tableName)) {
    const callerPerms = await resolveAdminPermissions(req.user.user_id);
    if (!callerPerms.isSuper) {
      return res.status(403).json({ error: securityTableMessage(tableName) });
    }
  }

  if (!rowData || typeof rowData !== 'object' || Array.isArray(rowData) || Object.keys(rowData).length === 0) {
    return res.status(400).json({ error: 'A non-empty row object is required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { names } = await getTableColumns(connection, tableName);
    assertKnownColumns(Object.keys(rowData), names);

    const safeData = protectValues(tableName, rowData);

    const [insertResult] = await connection.query(`INSERT INTO ?? SET ?`, [tableName, safeData]);

    const loggedData = {};
    for (const [col, val] of Object.entries(safeData)) {
      loggedData[col] = auditSafe(tableName, col, val);
    }

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'CREATE',
      table: tableName,
      recordId: insertResult.insertId || 0,
      oldValue: null,
      newValue: { operation: 'ADMIN_DB_STUDIO_INSERT', insertedData: loggedData },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.status(201).json({ message: 'Record inserted successfully.', insertId: insertResult.insertId });
  } catch (error) {
    await connection.rollback();
    console.error('[DB Studio Insert Error]:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to insert row.' });
  } finally {
    connection.release();
  }
});

// 4. PUT /api/admin/db/tables/:table/rows
router.put('/db/tables/:table/rows', requirePermission('DATABASE_MANAGE'), async (req, res) => {
  const tableName = req.params.table;
  const { primaryKey, updates } = req.body;

  if (isReadOnlyTable(tableName)) {
    return res.status(403).json({ error: readOnlyMessage(tableName) });
  }

  // ── Security-table guard (adjusted manage-user-account feature) ──
  // Account-security tables (USERS, ROLES, USER_ROLES, ADMIN_PERMISSIONS,
  // USER_ADMIN_PERMISSIONS) are writable from DB Studio only by Super
  // Admins — otherwise a limited admin with DATABASE_MANAGE could mint
  // admin accounts or override admin passwords outside User Management.
  if (isSecurityTable(tableName)) {
    const callerPerms = await resolveAdminPermissions(req.user.user_id);
    if (!callerPerms.isSuper) {
      return res.status(403).json({ error: securityTableMessage(tableName) });
    }
  }

  if (!primaryKey || typeof primaryKey !== 'object' || Array.isArray(primaryKey) || Object.keys(primaryKey).length === 0) {
    return res.status(400).json({ error: 'Primary key specification is required to update a row.' });
  }

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'An updates object is required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { names, pk } = await getTableColumns(connection, tableName);
    assertPrimaryKey(primaryKey, pk);
    assertKnownColumns(Object.keys(updates), names);
    if (Object.keys(updates).some((c) => pk.includes(c))) {
      throw fail('Primary key columns cannot be changed.');
    }

    const pkClauses = pk.map(() => '?? = ?').join(' AND ');
    const pkParams = pk.flatMap((c) => [c, primaryKey[c]]);

    const [existing] = await connection.query(
      `SELECT * FROM ?? WHERE ${pkClauses} FOR UPDATE`,
      [tableName, ...pkParams]
    );
    if (existing.length === 0) throw fail('Record not found.', 404);
    const oldRow = existing[0];

    const changedInput = {};
    for (const [col, val] of Object.entries(updates)) {
      if (normalizeValue(val) !== normalizeValue(oldRow[col])) changedInput[col] = val;
    }

    const writeData = protectValues(tableName, changedInput);
    if (Object.keys(writeData).length === 0) {
      await connection.rollback();
      return res.json({ message: 'No changes detected.', affectedRows: 0 });
    }

    const bumpVersion = shouldBumpVersion(names, writeData);
    const [result] = bumpVersion
      ? await connection.query(`UPDATE ?? SET ?, ?? = ?? + 1 WHERE ${pkClauses}`, [
          tableName, writeData, 'version', 'version', ...pkParams,
        ])
      : await connection.query(`UPDATE ?? SET ? WHERE ${pkClauses}`, [tableName, writeData, ...pkParams]);

    const oldLogged = {};
    const newLogged = {};
    for (const col of Object.keys(writeData)) {
      oldLogged[col] = auditSafe(tableName, col, oldRow[col]);
      newLogged[col] = auditSafe(tableName, col, writeData[col]);
    }
    if (bumpVersion) {
      oldLogged.version = normalizeValue(oldRow.version);
      newLogged.version = String((Number(oldRow.version) || 0) + 1);
    }

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'UPDATE',
      table: tableName,
      recordId: Object.values(primaryKey)[0] || 0,
      oldValue: { primaryKey, fields: oldLogged },
      newValue: { operation: 'ADMIN_DB_STUDIO_UPDATE', primaryKey, fields: newLogged },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({ message: `Row in ${tableName} updated successfully.`, affectedRows: result.affectedRows });
  } catch (error) {
    await connection.rollback();
    console.error('[DB Studio Update Error]:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to update row.' });
  } finally {
    connection.release();
  }
});

// 5. DELETE /api/admin/db/tables/:table/rows
router.delete('/db/tables/:table/rows', requirePermission('DATABASE_MANAGE'), async (req, res) => {
  const tableName = req.params.table;
  const { primaryKey } = req.body;

  if (isReadOnlyTable(tableName)) {
    return res.status(403).json({ error: readOnlyMessage(tableName) });
  }

  // ── Security-table guard (adjusted manage-user-account feature) ──
  // Account-security tables (USERS, ROLES, USER_ROLES, ADMIN_PERMISSIONS,
  // USER_ADMIN_PERMISSIONS) are writable from DB Studio only by Super
  // Admins — otherwise a limited admin with DATABASE_MANAGE could mint
  // admin accounts or override admin passwords outside User Management.
  if (isSecurityTable(tableName)) {
    const callerPerms = await resolveAdminPermissions(req.user.user_id);
    if (!callerPerms.isSuper) {
      return res.status(403).json({ error: securityTableMessage(tableName) });
    }
  }

  if (!primaryKey || typeof primaryKey !== 'object' || Array.isArray(primaryKey) || Object.keys(primaryKey).length === 0) {
    return res.status(400).json({ error: 'Primary key specification is required to delete a row.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { names, pk } = await getTableColumns(connection, tableName);
    assertPrimaryKey(primaryKey, pk);

    const pkClauses = pk.map(() => '?? = ?').join(' AND ');
    const pkParams = pk.flatMap((c) => [c, primaryKey[c]]);
    const mode = planDelete(names);

    const [existing] = await connection.query(
      `SELECT * FROM ?? WHERE ${pkClauses} FOR UPDATE`,
      [tableName, ...pkParams]
    );
    if (existing.length === 0) throw fail('Record not found.', 404);

    if (mode === 'soft' && existing[0].deleted_at !== null && existing[0].deleted_at !== undefined) {
      throw fail('Record is already deleted.', 409);
    }

    const snapshot = {};
    for (const [col, val] of Object.entries(existing[0])) {
      snapshot[col] = auditSafe(tableName, col, val);
    }

    let result;
    if (mode === 'soft') {
      const setVersion = names.has('version') ? ', version = version + 1' : '';
      [result] = await connection.query(
        `UPDATE ?? SET deleted_at = NOW()${setVersion} WHERE ${pkClauses}`,
        [tableName, ...pkParams]
      );
    } else {
      [result] = await connection.query(`DELETE FROM ?? WHERE ${pkClauses}`, [tableName, ...pkParams]);
    }

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'DELETE',
      table: tableName,
      recordId: Object.values(primaryKey)[0] || 0,
      oldValue: { primaryKey, row: snapshot },
      newValue: { operation: mode === 'soft' ? 'ADMIN_DB_STUDIO_SOFT_DELETE' : 'ADMIN_DB_STUDIO_DELETE' },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({
      message: mode === 'soft'
        ? `Record in ${tableName} archived (soft-deleted).`
        : `Record deleted from ${tableName}.`,
      softDeleted: mode === 'soft',
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[DB Studio Delete Error]:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to delete row.' });
  } finally {
    connection.release();
  }
});

return router;
}
