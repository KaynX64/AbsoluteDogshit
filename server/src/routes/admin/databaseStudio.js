import { pool } from '../../db/pool.js';
import { requirePermission, resolveAdminPermissions } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { logPhiAccess } from '../../utils/phiLogger.js';
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
} from '../../utils/dbStudioGuard.js';

export function registerDatabaseStudioRoutes(router) {
  // =============================================================================
  // DATABASE STUDIO: LIVE DB EXPLORER & EDITOR
  // =============================================================================

  async function getWhitelistedTables() {
    const [rows] = await pool.query(
      `SELECT TABLE_NAME as tableName, TABLE_ROWS as estimatedRows
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND UPPER(TABLE_NAME) NOT IN ('SERVER_POLICY', 'QUEUE_TICKET_COUNTERS', 'SCHEMA_MIGRATIONS')
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
}
