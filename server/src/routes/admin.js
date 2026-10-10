// server/src/routes/admin.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';
import { logPhiAccess } from '../utils/phiLogger.js';
import {
  isReadOnlyTable,
  readOnlyMessage,
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
import bcrypt from 'bcryptjs';

const router = express.Router();

router.use(authenticateToken, requireRoles('ADMIN'));

// 1. GET /api/admin/users - Comprehensive User Accounts, Roles & Sub-profiles
router.get('/users', async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.user_id as id,
              u.first_name,
              u.last_name,
              CONCAT(u.first_name, ' ', u.last_name) as name,
              u.email,
              u.phone,
              COALESCE(r.code, 'STUDENT') as role,
              u.is_active,
              CASE WHEN u.is_active = TRUE THEN 'Active' ELSE 'Suspended' END as status,
              u.created_at,
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
              COALESCE(fp.position, ntp.position) AS position
       FROM USERS u
       LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
       LEFT JOIN ROLES r ON ur.role_id = r.role_id
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
       LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
       LEFT JOIN NON_TEACHING_PROFILES ntp ON u.user_id = ntp.user_id
       WHERE u.deleted_at IS NULL
       ORDER BY u.user_id ASC`
    );
    res.json(users);
  } catch (error) {
    console.error('Failed to retrieve system users:', error);
    res.status(500).json({ error: 'Failed to retrieve system users.' });
  }
});

// 2. GET /api/admin/phi-access-logs - PHI Surveillance Log
router.get('/phi-access-logs', async (req, res) => {
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
router.patch('/users/:id/role', async (req, res) => {
  const targetUserId = req.params.id;
  const { role_code } = req.body;

  if (!role_code) return res.status(400).json({ error: 'role_code is required.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [roleRows] = await connection.query('SELECT role_id FROM ROLES WHERE code = ?', [role_code]);
    if (roleRows.length === 0) throw new Error('Invalid role code specified.');
    const newRoleId = roleRows[0].role_id;

    await connection.query('DELETE FROM USER_ROLES WHERE user_id = ?', [targetUserId]);
    await connection.query('INSERT INTO USER_ROLES (user_id, role_id) VALUES (?, ?)', [targetUserId, newRoleId]);

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
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// 3.1 PUT /api/admin/users/:id - Edit Full Profile & Credentials
router.put('/users/:id', async (req, res) => {
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
        is_active ? 1 : 0,
        targetUserId,
      ]
    );

    // 3. Update Role Assignment if specified
    if (role_code) {
      const [roleRows] = await connection.query('SELECT role_id FROM ROLES WHERE code = ?', [role_code]);
      if (roleRows.length > 0) {
        await connection.query('DELETE FROM USER_ROLES WHERE user_id = ?', [targetUserId]);
        await connection.query('INSERT INTO USER_ROLES (user_id, role_id) VALUES (?, ?)', [
          targetUserId,
          roleRows[0].role_id,
        ]);
      }
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
    res.status(400).json({ error: error.message || 'Failed to update user profile.' });
  } finally {
    connection.release();
  }
});

// 3.2 POST /api/admin/users/:id/reset-password - Admin Password Reset
router.post('/users/:id/reset-password', async (req, res) => {
  const targetUserId = Number(req.params.id);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  const connection = await pool.getConnection();
  try {
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
    await connection.rollback();
    console.error('[Admin Password Reset Error]:', error);
    res.status(500).json({ error: 'Failed to reset user password.' });
  } finally {
    connection.release();
  }
});

// 3.3 POST /api/admin/users - Create a brand new user account
router.post('/users', async (req, res) => {
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
    res.status(400).json({ error: error.message || 'Failed to create user account.' });
  } finally {
    connection.release();
  }
});

// 4. GET /api/admin/audit-logs - Append-only Hash Chain
router.get('/audit-logs', async (req, res) => {
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
router.get('/telemetry', async (req, res) => {
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
router.get('/db/tables', async (req, res) => {
  try {
    const tables = await getWhitelistedTables();
    res.json(tables);
  } catch (error) {
    console.error('[DB Studio] Tables fetch error:', error);
    res.status(500).json({ error: 'Failed to retrieve database tables.' });
  }
});

// 2. GET /api/admin/db/tables/:table
router.get('/db/tables/:table', async (req, res) => {
  const tableName = req.params.table;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

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

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM ??`, [tableName]);
    const totalRows = countResult[0]?.total || 0;

    const [rawRows] = await pool.query(`SELECT * FROM ?? LIMIT ? OFFSET ?`, [tableName, limit, offset]);
    const rows = rawRows.map((r) => maskRowForDisplay(tableName, r));

    const pkCols = columns.filter((c) => c.columnKey === 'PRI').map((c) => c.columnName);
    void logDbStudioRead(req, tableName, rawRows, pkCols);

    res.json({
      tableName,
      columns,
      totalRows,
      page,
      limit,
      totalPages: Math.ceil(totalRows / limit) || 1,
      rows,
      isReadOnly: isReadOnlyTable(tableName),
    });
  } catch (error) {
    console.error('[DB Studio] Table query error:', error);
    res.status(500).json({ error: 'Failed to retrieve table data.' });
  }
});

// 3. POST /api/admin/db/tables/:table/rows
router.post('/db/tables/:table/rows', async (req, res) => {
  const tableName = req.params.table;
  const rowData = req.body;

  if (isReadOnlyTable(tableName)) {
    return res.status(403).json({ error: readOnlyMessage(tableName) });
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
router.put('/db/tables/:table/rows', async (req, res) => {
  const tableName = req.params.table;
  const { primaryKey, updates } = req.body;

  if (isReadOnlyTable(tableName)) {
    return res.status(403).json({ error: readOnlyMessage(tableName) });
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
router.delete('/db/tables/:table/rows', async (req, res) => {
  const tableName = req.params.table;
  const { primaryKey } = req.body;

  if (isReadOnlyTable(tableName)) {
    return res.status(403).json({ error: readOnlyMessage(tableName) });
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

export default router;