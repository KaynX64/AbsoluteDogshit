// Handles account creation and password resets under the admin user-management rules.

import { saveHealthProfile } from '../../admin/accounts/healthProfile.js';
import { pool } from '../../db/pool.js';
import { requirePermission, resolveAdminPermissions } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { evaluatePasswordStrength } from '../../utils/passwordPolicy.js';
import bcrypt from 'bcryptjs';
import { validatePermissionCodes, setAdminPermissionGrants } from '../../admin/accounts/permissions.js';

export function registerAccountCredentialRoutes(router) {
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
      health_profile,
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

    if (role_code === 'STUDENT' && year_level != null && year_level !== '' &&
        (!['number', 'string'].includes(typeof year_level) || !Number.isInteger(Number(year_level)) ||
         Number(year_level) < 1 || Number(year_level) > 6)) {
      return res.status(400).json({ error: 'Year level must be a whole number from 1 to 6.' });
    }

    const isCampusRole = ['STUDENT', 'FACULTY', 'NON_TEACHING'].includes(role_code);
    const creationProfileFields = ['sex', 'date_of_birth', 'emergency_contact_name', 'emergency_contact_phone'];
    if (health_profile !== undefined && (
      !isCampusRole || health_profile === null || typeof health_profile !== 'object' || Array.isArray(health_profile) ||
      Object.entries(health_profile).some(([field, value]) =>
        !creationProfileFields.includes(field) || (value !== null && typeof value !== 'string'))
    )) {
      return res.status(400).json({
        error: 'Account creation accepts only sex, date of birth and emergency contact details for campus health profiles.',
      });
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
        if (!student_no || !String(student_no).trim()) {
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

      if (health_profile !== undefined && Object.values(health_profile).some(value => value?.trim())) {
        await saveHealthProfile(connection, newUserId, health_profile, {
          actorId: req.user.user_id, ipAddress: req.ip, operation: 'ADMIN_CREATE_HEALTH_PROFILE',
        });
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
}
