import { pool } from '../../db.js';
import { requirePermission, resolveAdminPermissions } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { fail } from '../../utils/dbStudioGuard.js';
import { encrypt } from '../../utils/cryptoVault.js';
import { requireSuperAdminCaller, getUserRoleCode } from './accountPermissions.js';

export function registerUserUpdateRoutes(router) {
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
}
