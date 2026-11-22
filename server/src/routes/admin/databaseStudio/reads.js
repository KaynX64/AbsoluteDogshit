// Lists and pages allowed database tables, masks protected values, and logs applicable PHI reads.

import { pool } from '../../../db/pool.js';
import { resolveAdminPermissions } from '../../../middleware/rbac.js';
import { logPhiAccess } from '../../../utils/phiLogger.js';
import { isReadOnlyTable, isSecurityTable, isSecretCol, phiPatientSource, maskRowForDisplay } from './tablePolicy.js';
import { getWhitelistedTables } from './schema.js';

// Resolve the affected patient and record IDs for a Database Studio read audit.
async function resolvePhiTargets(table, rows, pkCols) {
  const src = phiPatientSource(table);
  if (!src || rows.length === 0) return [];
  // Use the first primary key column to identify the displayed database record.
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
    // Extract the patient or parent identifiers used for PHI access logging.
    const parentKeys = [...new Set(rows.map((r) => r[src.col]).filter(/* Discard missing identifiers before resolving patient ownership. */ (v) => v !== null && v !== undefined))];
    if (parentKeys.length === 0) return [];
    const [parents] = await pool.query(
      `SELECT ?? AS k, ?? AS patient FROM ?? WHERE ?? IN (?)`,
      [src.via.key, src.via.patient, src.via.table, src.via.key, parentKeys]
    );
    // Index parent records by their key to resolve patient ownership.
    const patientOfParent = new Map(parents.map((p) => [p.k, p.patient]));
    for (const row of rows) {
      const patientId = patientOfParent.get(row[src.col]);
      if (patientId !== null && patientId !== undefined && !byPatient.has(patientId)) {
        byPatient.set(patientId, recordIdOf(row));
      }
    }
  }
  // Turn one resolved patient and record pair into an audit target.
  return [...byPatient].map(([patientUserId, recordId]) => ({ patientUserId, recordId }));
}

// Write PHI read audits for identifiable patient records in the result.
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

// Mount approved table listing and paginated row reads.
export function registerDatabaseStudioReads(router, requireDatabaseAccess) {
  // 1. GET /api/admin/db/tables
  // List the tables available to Database Studio.
  router.get('/db/tables', requireDatabaseAccess, async (req, res) => {
    try {
      const tables = await getWhitelistedTables();
      res.json(tables);
    } catch (error) {
      console.error('[DB Studio] Tables fetch error:', error);
      res.status(500).json({ error: 'Failed to retrieve database tables.' });
    }
  });

  // 2. GET /api/admin/db/tables/:table
  // Page through an allowed table, mask sensitive values, and audit applicable PHI reads.
  router.get('/db/tables/:table', requireDatabaseAccess, async (req, res) => {
    const tableName = req.params.table;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    try {
      const tables = await getWhitelistedTables();
      // Check the requested table against the discovered allow-list.
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
        .filter(/* Exclude unsupported types, secrets, and encrypted fields from text search. */ (c) => {
          const dt = (c.dataType || '').toLowerCase();
          return !nonSearchableDataTypes.includes(dt) && !isSecretCol(tableName, c.columnName);
        })
        .map(/* Extract the eligible search column name. */ (c) => c.columnName);

      let countQuery = `SELECT COUNT(*) as total FROM ??`;
      let countParams = [tableName];
      let dataQuery = `SELECT * FROM ??`;
      let dataParams = [tableName];

      if (search && searchableCols.length > 0) {
        const searchPattern = `%${search}%`;
        // Build a parameterized text comparison for each searchable column.
        const whereClause = searchableCols.map(() => `CAST(?? AS CHAR) LIKE ?`).join(' OR ');
        // Bind the column identifier together with its search pattern.
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
      // Mask protected values before adding a row to the response.
      const rows = rawRows.map((r) => maskRowForDisplay(tableName, r));

      // Select columns belonging to the table's primary key.
      const pkCols = columns.filter((c) => c.columnKey === 'PRI').map(/* Extract the primary key column name for record identification. */ (c) => c.columnName);
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
}
