import { pool } from '../db/pool.js';

export async function listConsultationsByDepartment({ fallback = 'General Walk-in', limit } = {}) {
  const [rows] = await pool.query(
    `SELECT department, COUNT(*) AS count
     FROM (
       SELECT COALESCE(sp.course, fp.department, ?) AS department
       FROM APPOINTMENTS a
       LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
       LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
       WHERE a.status = 'completed' AND a.deleted_at IS NULL
     ) AS consultations
     GROUP BY department
     ORDER BY count DESC, department ASC${limit === undefined ? '' : ' LIMIT ?'}`,
    limit === undefined ? [fallback] : [fallback, limit],
  );
  return rows;
}

export async function listActiveRoles() {
  const [rows] = await pool.query(
    `SELECT r.code, r.name, COUNT(u.user_id) AS count
     FROM ROLES r
     LEFT JOIN USER_ROLES ur ON r.role_id = ur.role_id
     LEFT JOIN USERS u ON ur.user_id = u.user_id AND u.is_active = TRUE AND u.deleted_at IS NULL
     GROUP BY r.role_id, r.code, r.name
     ORDER BY count DESC, r.role_id ASC`,
  );
  return rows;
}

export async function listInventoryForReport({ orderByExpiry = false } = {}) {
  const [rows] = await pool.query(
    `SELECT m.name, b.batch_no, b.quantity_on_hand, b.expiry_date,
            DATEDIFF(b.expiry_date, CURDATE()) AS days_until_expiry
     FROM MEDICINE_BATCHES b
     JOIN MEDICINES m ON b.medicine_id = m.medicine_id
     WHERE b.deleted_at IS NULL${orderByExpiry ? ' ORDER BY b.expiry_date ASC' : ''}`,
  );
  return rows;
}

export async function listInventoryAlerts(limit) {
  const [rows] = await pool.query(
    `SELECT b.batch_id, m.name, m.generic_name, b.batch_no, b.quantity_on_hand, m.reorder_level,
            DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiry_date,
            DATEDIFF(b.expiry_date, CURDATE()) AS days_until_expiry
     FROM MEDICINE_BATCHES b
     JOIN MEDICINES m ON b.medicine_id = m.medicine_id
     WHERE b.deleted_at IS NULL AND (b.quantity_on_hand < 25 OR b.expiry_date <= CURDATE() + INTERVAL 90 DAY)
     ORDER BY b.quantity_on_hand ASC, b.batch_id ASC
     LIMIT ?`,
    [limit],
  );
  return rows;
}

export async function listTopPrescribedMedicines(limit = 6) {
  const [rows] = await pool.query(
    `SELECT m.medicine_id, m.name, m.generic_name, m.form, m.strength, m.unit, m.reorder_level,
            COUNT(DISTINCT pi.prescription_id) AS prescription_count,
            COALESCE(SUM(pi.quantity_prescribed), 0) AS quantity_prescribed,
            COALESCE(stock.total_stock_on_hand, 0) AS total_stock_on_hand,
            CASE
              WHEN COALESCE(stock.total_stock_on_hand, 0) <= m.reorder_level
              THEN GREATEST((m.reorder_level * 2) - COALESCE(stock.total_stock_on_hand, 0), m.reorder_level)
              ELSE 0
            END AS suggested_reorder_qty,
            CASE
              WHEN COALESCE(stock.total_stock_on_hand, 0) = 0 THEN 'OUT_OF_STOCK'
              WHEN COALESCE(stock.total_stock_on_hand, 0) <= m.reorder_level THEN 'CRITICAL_BUFFER'
              ELSE 'ADEQUATE'
            END AS stock_status
     FROM PRESCRIPTION_ITEMS pi
     JOIN PRESCRIPTIONS p ON p.prescription_id = pi.prescription_id
     JOIN MEDICINES m ON m.medicine_id = pi.medicine_id
     LEFT JOIN (
       SELECT medicine_id, SUM(quantity_on_hand) AS total_stock_on_hand
       FROM MEDICINE_BATCHES
       WHERE deleted_at IS NULL AND expiry_date > CURDATE()
       GROUP BY medicine_id
     ) AS stock ON stock.medicine_id = m.medicine_id
     WHERE pi.deleted_at IS NULL
       AND p.deleted_at IS NULL
       AND p.status <> 'cancelled'
       AND m.is_active = TRUE
       AND m.deleted_at IS NULL
     GROUP BY m.medicine_id, m.name, m.generic_name, m.form, m.strength, m.unit,
              m.reorder_level, stock.total_stock_on_hand
     ORDER BY quantity_prescribed DESC, prescription_count DESC, m.name ASC
     LIMIT ?`,
    [limit],
  );
  return rows;
}
