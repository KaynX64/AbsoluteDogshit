// server/src/utils/dataRetention.js
import { pool } from '../db.js';

export async function executeDataRetentionPurge() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const cutoffQuery = "DATE_SUB(NOW(), INTERVAL 5 YEAR)";

    // 1. Fetch users marked for deletion past the 5-year retention window under RA 10173
    const [usersToPurge] = await connection.query(
      `SELECT user_id FROM USERS WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoffQuery}`
    );

    if (usersToPurge.length > 0) {
      const userIds = usersToPurge.map(u => u.user_id);

      // 2. Explicitly clean up all dependent child records to prevent foreign key constraint rejections
      await connection.query(`DELETE FROM PHI_ACCESS_LOGS WHERE user_id IN (?) OR patient_user_id IN (?)`, [userIds, userIds]);
      await connection.query(`DELETE FROM LOCAL_SYNC_LOGS WHERE user_id IN (?)`, [userIds]);
      await connection.query(`DELETE FROM INVENTORY_LOGS WHERE performed_by IN (?)`, [userIds]);
      await connection.query(`DELETE FROM EMERGENCY_ALERTS WHERE user_id IN (?) OR assigned_responder_id IN (?)`, [userIds, userIds]);
      await connection.query(`DELETE FROM MEDICAL_CLEARANCES WHERE user_id IN (?) OR issued_by IN (?)`, [userIds, userIds]);
      
      // Delete prescription line items and headers
      await connection.query(`DELETE pi FROM PRESCRIPTION_ITEMS pi JOIN PRESCRIPTIONS p ON pi.prescription_id = p.prescription_id WHERE p.patient_user_id IN (?) OR p.doctor_user_id IN (?)`, [userIds, userIds]);
      await connection.query(`DELETE FROM PRESCRIPTIONS WHERE patient_user_id IN (?) OR doctor_user_id IN (?)`, [userIds, userIds]);
      
      // Delete vitals, EMR records, queue entries, and appointments
      await connection.query(`DELETE FROM VITAL_SIGNS WHERE recorded_by IN (?) OR emr_id IN (SELECT emr_id FROM EMR_RECORDS WHERE patient_user_id IN (?) OR doctor_user_id IN (?))`, [userIds, userIds, userIds]);
      await connection.query(`DELETE FROM EMR_RECORDS WHERE patient_user_id IN (?) OR doctor_user_id IN (?)`, [userIds, userIds]);
      await connection.query(`DELETE FROM QUEUE WHERE patient_user_id IN (?)`, [userIds]);
      await connection.query(`DELETE FROM APPOINTMENTS WHERE patient_user_id IN (?) OR doctor_user_id IN (?)`, [userIds, userIds]);
      
      // Delete role profiles and mappings
      await connection.query(`DELETE FROM HEALTH_PROFILES WHERE user_id IN (?)`, [userIds]);
      await connection.query(`DELETE FROM STUDENT_PROFILES WHERE user_id IN (?)`, [userIds]);
      await connection.query(`DELETE FROM FACULTY_PROFILES WHERE user_id IN (?)`, [userIds]);
      await connection.query(`DELETE FROM STAFF_PROFILES WHERE user_id IN (?)`, [userIds]);
      await connection.query(`DELETE FROM USER_ROLES WHERE user_id IN (?)`, [userIds]);

      // 3. Finally, delete the parent user accounts safely
      await connection.query(
        `DELETE FROM USERS WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoffQuery}`
      );
    }

    await connection.commit();
    console.log('[Data Retention] 5-year RA 10173 retention purge executed successfully.');
  } catch (error) {
    await connection.rollback();
    console.error('[Data Retention] Purge failed, transaction rolled back:', error);
  } finally {
    connection.release();
  }
}

export function startRetentionCron() {
  // Run purge check every 24 hours
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    executeDataRetentionPurge();
  }, TWENTY_FOUR_HOURS);
  
  // Initial check on server startup
  executeDataRetentionPurge();
}