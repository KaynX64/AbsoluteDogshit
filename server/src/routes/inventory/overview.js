import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';

export function registerInventoryOverview(router) {
  // =============================================================================
  // 1. READ / QUERY CATALOGUE & LOGS
  // =============================================================================

  // GET /api/inventory/batches - Fetch batches with active stock
  router.get('/batches', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT b.batch_id, m.medicine_id, m.name, m.generic_name, m.form, m.strength, m.unit, m.reorder_level,
                b.batch_no, b.quantity_on_hand, b.manufacture_date, b.expiry_date, b.supplier,
                DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry
         FROM MEDICINE_BATCHES b 
         JOIN MEDICINES m ON b.medicine_id = m.medicine_id 
         WHERE b.deleted_at IS NULL 
           AND b.quantity_on_hand > 0
         ORDER BY b.expiry_date ASC`
      );
      res.json(rows);
    } catch (error) {
      console.error('Error fetching inventory batches:', error);
      res.status(500).json({ error: 'Failed to fetch inventory batches.' });
    }
  });

  // GET /api/inventory/medicines - Master drug catalogue with unexpired available stock
  router.get('/medicines', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'), async (req, res) => {
    try {
      const [medicines] = await pool.query(
        `SELECT m.medicine_id, m.name, m.generic_name, m.form, m.strength, m.unit, m.reorder_level,
                COALESCE(SUM(CASE WHEN b.expiry_date > CURDATE() AND b.deleted_at IS NULL AND b.quantity_on_hand > 0 THEN b.quantity_on_hand ELSE 0 END), 0) AS available_stock
         FROM MEDICINES m 
         LEFT JOIN MEDICINE_BATCHES b ON m.medicine_id = b.medicine_id
         WHERE m.is_active = TRUE AND m.deleted_at IS NULL 
         GROUP BY m.medicine_id, m.name, m.generic_name, m.form, m.strength, m.unit, m.reorder_level
         ORDER BY m.name ASC`
      );
      res.json(medicines);
    } catch (error) {
      console.error('Failed to fetch medicine master:', error);
      res.status(500).json({ error: 'Failed to fetch medicines catalogue.' });
    }
  });

  // GET /api/inventory/expiring-soon
  router.get('/expiring-soon', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT b.batch_id, m.name, m.generic_name, b.batch_no, b.quantity_on_hand, m.reorder_level,
                DATE_FORMAT(b.expiry_date, '%Y-%m-%d') as expiry_date,
                DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry,
                CASE 
                  WHEN DATEDIFF(b.expiry_date, CURDATE()) < 0 THEN 'EXPIRED'
                  WHEN DATEDIFF(b.expiry_date, CURDATE()) <= 30 THEN 'CRITICAL (<30d)'
                  ELSE 'EXPIRING SOON'
                END AS alert_level
         FROM MEDICINE_BATCHES b
         JOIN MEDICINES m ON b.medicine_id = m.medicine_id
         WHERE b.deleted_at IS NULL 
           AND b.quantity_on_hand > 0
           AND DATEDIFF(b.expiry_date, CURDATE()) <= 90
         ORDER BY b.expiry_date ASC`
      );
      res.json(rows);
    } catch (error) {
      console.error('Error in expiry sweep:', error);
      res.status(500).json({ error: 'Failed to execute expiry sweep.' });
    }
  });

  // GET /api/inventory/reorder-suggestions
  router.get('/reorder-suggestions', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT m.medicine_id, m.name, m.generic_name, m.form, m.strength, m.unit, m.reorder_level,
                COALESCE(SUM(b.quantity_on_hand), 0) AS total_stock_on_hand,
                CASE 
                  WHEN COALESCE(SUM(b.quantity_on_hand), 0) <= m.reorder_level 
                  THEN GREATEST((m.reorder_level * 2) - COALESCE(SUM(b.quantity_on_hand), 0), m.reorder_level)
                  ELSE 0 
                END AS suggested_reorder_qty,
                CASE 
                  WHEN COALESCE(SUM(b.quantity_on_hand), 0) = 0 THEN 'OUT_OF_STOCK'
                  WHEN COALESCE(SUM(b.quantity_on_hand), 0) <= m.reorder_level THEN 'CRITICAL_BUFFER'
                  ELSE 'ADEQUATE'
                END AS stock_status
         FROM MEDICINES m
         LEFT JOIN MEDICINE_BATCHES b ON m.medicine_id = b.medicine_id 
              AND b.deleted_at IS NULL 
              AND b.expiry_date > CURDATE()
         LEFT JOIN (
           SELECT pi.medicine_id,
                  SUM(pi.quantity_prescribed) AS quantity_prescribed,
                  COUNT(DISTINCT pi.prescription_id) AS prescription_count
           FROM PRESCRIPTION_ITEMS pi
           JOIN PRESCRIPTIONS p ON p.prescription_id = pi.prescription_id
           WHERE pi.medicine_id IS NOT NULL
             AND pi.deleted_at IS NULL
             AND p.deleted_at IS NULL
             AND p.status <> 'cancelled'
           GROUP BY pi.medicine_id
         ) AS demand ON demand.medicine_id = m.medicine_id
         WHERE m.is_active = TRUE AND m.deleted_at IS NULL
         GROUP BY m.medicine_id, m.name, m.generic_name, m.form, m.strength, m.unit, m.reorder_level
         ORDER BY total_stock_on_hand ASC,
                  MAX(demand.quantity_prescribed) DESC,
                  MAX(demand.prescription_count) DESC,
                  m.name ASC,
                  m.medicine_id ASC`
      );
      res.json(rows);
    } catch (error) {
      console.error('Error computing reorder suggestions:', error);
      res.status(500).json({ error: 'Failed to calculate reorder suggestions.' });
    }
  });

  // GET /api/inventory/logs
  router.get('/logs', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
    try {
      const [logs] = await pool.query(
        `SELECT l.log_id, l.batch_id, l.prescription_item_id, pi.prescription_id,
                l.quantity_change, l.transaction_type, l.reason, l.created_at,
                b.batch_no, b.expiry_date,
                m.name AS medicine_name, m.generic_name, m.strength, m.form,
                CONCAT(u.first_name, ' ', u.last_name) AS performed_by_name,
                u.email AS performed_by_email
         FROM INVENTORY_LOGS l
         JOIN MEDICINE_BATCHES b ON l.batch_id = b.batch_id
         JOIN MEDICINES m ON b.medicine_id = m.medicine_id
         JOIN USERS u ON l.performed_by = u.user_id
         LEFT JOIN PRESCRIPTION_ITEMS pi ON pi.item_id = l.prescription_item_id
         ORDER BY l.log_id DESC
         LIMIT 100`
      );
      res.json(logs);
    } catch (error) {
      console.error('Error fetching inventory consumption logs:', error);
      res.status(500).json({ error: 'Failed to retrieve inventory logs.' });
    }
  });

  // GET /api/inventory/dashboard-summary - Live pharmacy inventory metrics for nurse console
  router.get('/dashboard-summary', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
    try {
      const [lowStock] = await pool.query(
        `SELECT COUNT(*) as count 
         FROM MEDICINE_BATCHES b
         JOIN MEDICINES m ON b.medicine_id = m.medicine_id
         WHERE b.deleted_at IS NULL 
           AND b.quantity_on_hand > 0 
           AND b.quantity_on_hand <= COALESCE(m.reorder_level, 20)
           AND b.expiry_date > CURDATE()`
      );

      const [expiringSoon] = await pool.query(
        `SELECT COUNT(*) as count
         FROM MEDICINE_BATCHES b
         WHERE b.deleted_at IS NULL 
           AND b.quantity_on_hand > 0 
           AND b.expiry_date > CURDATE()
           AND DATEDIFF(b.expiry_date, CURDATE()) <= 90`
      );

      const [expired] = await pool.query(
        `SELECT COUNT(*) as count
         FROM MEDICINE_BATCHES b
         WHERE b.deleted_at IS NULL 
           AND b.quantity_on_hand > 0 
           AND b.expiry_date <= CURDATE()`
      );

      res.json({
        lowStockCount: Number(lowStock[0]?.count) || 0,
        expiringSoonCount: Number(expiringSoon[0]?.count) || 0,
        expiredCount: Number(expired[0]?.count) || 0,
      });
    } catch (error) {
      console.error('Error fetching inventory summary:', error);
      res.status(500).json({ error: 'Failed to retrieve inventory summary.' });
    }
  });
}
