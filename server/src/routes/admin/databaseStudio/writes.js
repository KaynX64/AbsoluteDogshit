// Validates and audits Database Studio row creation, edits, and deletion.

import { pool } from '../../../db/pool.js';
import { logAudit } from '../../../utils/auditLogger.js';
import { fail } from '../../../utils/httpError.js';
import { normalizeValue, auditSafe, assertKnownColumns, assertPrimaryKey, protectValues, planDelete, shouldBumpVersion } from './tablePolicy.js';
import { getTableColumns } from './schema.js';

export function registerDatabaseStudioWrites(router, requireDatabaseAccess, requireWritableTable) {
  // 3. POST /api/admin/db/tables/:table/rows
  router.post('/db/tables/:table/rows', requireDatabaseAccess, requireWritableTable, async (req, res) => {
    const tableName = req.params.table;
    const rowData = req.body;

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
  router.put('/db/tables/:table/rows', requireDatabaseAccess, requireWritableTable, async (req, res) => {
    const tableName = req.params.table;
    const { primaryKey, updates } = req.body;

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
  router.delete('/db/tables/:table/rows', requireDatabaseAccess, requireWritableTable, async (req, res) => {
    const tableName = req.params.table;
    const { primaryKey } = req.body;

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
