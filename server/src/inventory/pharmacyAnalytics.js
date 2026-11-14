// Aggregates prescribing, dispensing, and returns and ranks replenishment by usable stock.

import { pool } from '../db/pool.js';

const windowDays = 14;
const orderByStock = `total_stock_on_hand ASC, net_dispensed DESC, quantity_prescribed DESC,
                     prescription_count DESC, name ASC, medicine_id ASC`;

const formularyMetrics = `
  WITH reporting_window AS (
    SELECT CURRENT_TIMESTAMP AS ends_at, CURRENT_TIMESTAMP - INTERVAL ${windowDays} DAY AS starts_at
  ),
  prescribed AS (
    SELECT i.medicine_id,
           SUM(i.quantity_prescribed) AS quantity_prescribed,
           COUNT(DISTINCT i.prescription_id) AS prescription_count
    FROM PRESCRIPTIONS p
    JOIN PRESCRIPTION_ITEMS i ON i.prescription_id = p.prescription_id
    CROSS JOIN reporting_window w
    WHERE p.issued_at >= w.starts_at AND p.issued_at <= w.ends_at
      AND p.deleted_at IS NULL AND p.status <> 'cancelled'
      AND i.deleted_at IS NULL AND i.medicine_id IS NOT NULL
    GROUP BY i.medicine_id
  ),
  movements AS (
    SELECT b.medicine_id,
           SUM(CASE WHEN l.transaction_type = 'dispense' AND l.quantity_change < 0
                    THEN -l.quantity_change ELSE 0 END) AS quantity_dispensed,
           SUM(CASE WHEN l.transaction_type = 'return' AND l.quantity_change > 0
                    THEN l.quantity_change ELSE 0 END) AS quantity_returned
    FROM INVENTORY_LOGS l
    JOIN MEDICINE_BATCHES b ON b.batch_id = l.batch_id
    CROSS JOIN reporting_window w
    WHERE l.created_at >= w.starts_at AND l.created_at <= w.ends_at
      AND l.transaction_type IN ('dispense', 'return')
    GROUP BY b.medicine_id
  ),
  stock AS (
    SELECT medicine_id, SUM(quantity_on_hand) AS total_stock_on_hand
    FROM MEDICINE_BATCHES
    WHERE deleted_at IS NULL AND expiry_date > CURDATE()
    GROUP BY medicine_id
  ),
  formulary AS (
    SELECT m.medicine_id, m.name, m.generic_name, m.form, m.strength, m.unit, m.reorder_level,
           COALESCE(s.total_stock_on_hand, 0) AS total_stock_on_hand,
           COALESCE(p.quantity_prescribed, 0) AS quantity_prescribed,
           COALESCE(p.prescription_count, 0) AS prescription_count,
           COALESCE(a.quantity_dispensed, 0) AS quantity_dispensed,
           COALESCE(a.quantity_returned, 0) AS quantity_returned
    FROM MEDICINES m
    LEFT JOIN stock s ON s.medicine_id = m.medicine_id
    LEFT JOIN prescribed p ON p.medicine_id = m.medicine_id
    LEFT JOIN movements a ON a.medicine_id = m.medicine_id
    WHERE m.is_active = TRUE AND m.deleted_at IS NULL
  ),
  metrics AS (
    SELECT f.*, quantity_dispensed - quantity_returned AS net_dispensed,
           CASE WHEN total_stock_on_hand <= reorder_level
                THEN GREATEST(reorder_level * 2 - total_stock_on_hand, reorder_level)
                ELSE 0 END AS suggested_reorder_qty,
           CASE WHEN total_stock_on_hand = 0 THEN 'OUT_OF_STOCK'
                WHEN total_stock_on_hand <= reorder_level THEN 'CRITICAL_BUFFER'
                ELSE 'ADEQUATE' END AS stock_status
    FROM formulary f
  )`;

export async function listReorderSuggestions() {
  const [rows] = await pool.query(`
    ${formularyMetrics}
    SELECT medicine_id, name, generic_name, form, strength, unit, reorder_level,
           total_stock_on_hand, suggested_reorder_qty, stock_status
    FROM metrics
    ORDER BY ${orderByStock}
  `);
  return rows;
}

export async function getPharmacyAnalytics({ includeDispensing = true, includeReorder = false, limit = 6 } = {}) {
  if (!includeDispensing) {
    const [rows] = await pool.query(`
      ${formularyMetrics}
      SELECT medicine_id, name, generic_name, form, strength, unit, total_stock_on_hand,
             reorder_level, suggested_reorder_qty, stock_status
      FROM metrics
      WHERE stock_status <> 'ADEQUATE'
      ORDER BY ${orderByStock}
      LIMIT ?
    `, [limit]);
    return { windowDays, dispensing: null, reorderPriorities: rows };
  }
  const reorderRank = includeReorder
    ? `, ROW_NUMBER() OVER (ORDER BY (stock_status = 'ADEQUATE'), ${orderByStock}) AS reorder_rank`
    : '';
  const reorderRows = includeReorder ? " OR (reorder_rank <= ? AND stock_status <> 'ADEQUATE')" : '';
  const inventoryColumns = includeReorder
    ? ', total_stock_on_hand, reorder_level, suggested_reorder_qty, stock_status, reorder_rank'
    : '';
  const [rows] = await pool.query(`
    ${formularyMetrics},
    ranked AS (
      SELECT metrics.*,
             ROW_NUMBER() OVER (ORDER BY (quantity_dispensed > 0 OR quantity_returned > 0) DESC,
                 net_dispensed DESC, quantity_dispensed DESC, quantity_prescribed DESC, name, medicine_id) AS usage_rank
             ${reorderRank}
      FROM metrics
    )
    SELECT medicine_id, name, generic_name, form, strength, unit,
           quantity_prescribed, quantity_dispensed, quantity_returned, net_dispensed,
           IF(total_stock_on_hand > 0, 'IN_STOCK', 'OUT_OF_STOCK') AS availability,
           usage_rank${inventoryColumns}
    FROM ranked
    WHERE usage_rank <= ?${reorderRows}
  `, includeReorder ? [limit, limit] : [limit]);

  const identity = ({ medicine_id, name, generic_name, form, strength, unit }) =>
    ({ medicine_id, name, generic_name, form, strength, unit });
  const dispensing = rows.filter(row => Number(row.usage_rank) <= limit)
    .sort((a, b) => Number(a.usage_rank) - Number(b.usage_rank))
    .map(({ quantity_prescribed, quantity_dispensed, quantity_returned, net_dispensed, availability, ...medicine }) => ({
      ...identity(medicine), quantity_prescribed, quantity_dispensed, quantity_returned, net_dispensed, availability,
    }));
  const reorderPriorities = includeReorder ? rows
    .filter(row => Number(row.reorder_rank) <= limit && row.stock_status !== 'ADEQUATE')
    .sort((a, b) => Number(a.reorder_rank) - Number(b.reorder_rank))
    .map(({ total_stock_on_hand, reorder_level, suggested_reorder_qty, stock_status, ...medicine }) => ({
      ...identity(medicine), total_stock_on_hand, reorder_level, suggested_reorder_qty, stock_status,
    })) : null;
  return { windowDays, dispensing, reorderPriorities };
}
