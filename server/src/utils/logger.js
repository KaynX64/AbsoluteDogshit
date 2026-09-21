// server/src/utils/logger.js
import { pool } from '../db.js';

/**
 * Logs read-access of Protected Health Information (PHI)
 * @param {number|string} practitionerId - The ID of the clinic staff viewing the data (maps to user_id)
 * @param {number|string} patientUserId - The ID of the student/patient
 * @param {string} purpose - The clinical or administrative reason for access
 * @param {string} tableAffected - The primary table being accessed (defaults to 'MULTIPLE')
 * @param {number|string} recordId - The primary record ID being accessed (defaults to patient ID)
 */
export async function logPHIAccess(practitionerId, patientUserId, purpose, tableAffected = 'MULTIPLE', recordId = patientUserId) {
    try {
        const query = `
            INSERT INTO PHI_ACCESS_LOGS 
            (user_id, patient_user_id, table_affected, record_id, purpose, accessed_at)
            VALUES (?, ?, ?, ?, ?, NOW())
        `;
        // Using MySQL '?' placeholders and the correct connection pool
        await pool.query(query, [
            practitionerId, 
            patientUserId, 
            tableAffected, 
            recordId, 
            purpose
        ]);
    } catch (error) {
        console.error('CRITICAL: Failed to write to PHI_ACCESS_LOGS', error);
    }
}