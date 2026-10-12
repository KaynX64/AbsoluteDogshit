// server/src/utils/interactionChecker.js
//
// Drug-Drug Interaction Checker
// Queries the DRUG_INTERACTIONS table for known interaction pairs
// among a list of medicine IDs being prescribed together.
//
// Usage:
//   const interactions = await checkInteractions(connection, [1, 2, 3]);
//   // Returns array of interaction objects, empty if none found.

import { pool } from '../db.js';

/**
 * Check all pairwise interactions among the given medicine IDs.
 *
 * @param {import('mysql2/promise').PoolConnection} connection - Active DB connection (must be inside a transaction)
 * @param {number[]} medicineIds - Array of medicine IDs being prescribed
 * @returns {Promise<Array>} Array of interaction objects
 */
export async function checkInteractions(connection, medicineIds) {
  // Need at least 2 medicines to have an interaction
  if (!medicineIds || medicineIds.length < 2) return [];

  // Deduplicate and sort
  const uniqueIds = [...new Set(medicineIds)].sort((a, b) => a - b);
  if (uniqueIds.length < 2) return [];

  // Generate all pairs (a, b) where a < b
  // This matches our CHECK constraint: medicine_id_a < medicine_id_b
  const pairs = [];
  for (let i = 0; i < uniqueIds.length; i++) {
    for (let j = i + 1; j < uniqueIds.length; j++) {
      pairs.push([uniqueIds[i], uniqueIds[j]]);
    }
  }

  if (pairs.length === 0) return [];

  // Build a query that checks all pairs at once
  // Using OR conditions for each pair
  const conditions = pairs.map(() => '(di.medicine_id_a = ? AND di.medicine_id_b = ?)');
  const params = pairs.flat(); // [id_a1, id_b1, id_a2, id_b2, ...]

  const sql = `
    SELECT
      di.interaction_id,
      di.medicine_id_a,
      di.medicine_id_b,
      di.severity,
      di.interaction_type,
      di.description,
      di.recommendation,
      di.source,
      ma.name AS medicine_a_name,
      ma.generic_name AS medicine_a_generic,
      mb.name AS medicine_b_name,
      mb.generic_name AS medicine_b_generic
    FROM DRUG_INTERACTIONS di
    JOIN MEDICINES ma ON di.medicine_id_a = ma.medicine_id
    JOIN MEDICINES mb ON di.medicine_id_b = mb.medicine_id
    WHERE di.is_active = TRUE
      AND (${conditions.join(' OR ')})
    ORDER BY
      FIELD(di.severity, 'contraindicated', 'severe', 'moderate', 'mild')
  `;

  const [rows] = await connection.query(sql, params);
  return rows;
}

/**
 * Standalone version using the pool directly (for the preview/check endpoint).
 * Not transactional — read-only.
 *
 * @param {number[]} medicineIds
 * @returns {Promise<Array>}
 */
export async function checkInteractionsStandalone(medicineIds) {
  const connection = await pool.getConnection();
  try {
    return await checkInteractions(connection, medicineIds);
  } finally {
    connection.release();
  }
}