// Runs database work with a pooled transaction and handles commit, rollback, and release.

import { pool } from './pool.js';

export async function inTransaction(work) {
  const connection = await pool.getConnection();
  let reusable = true;
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      reusable = false;
    }
    throw error;
  } finally {
    if (reusable) connection.release();
    else connection.destroy();
  }
}
