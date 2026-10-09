// server/src/routes/analytics.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { decrypt } from '../utils/cryptoVault.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const router = express.Router();

router.use(authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'ADMIN'));

// 1. GET /api/analytics/summary
router.get('/summary', async (req, res) => {
  try {
    // 1. Total Consultations
    const [consultations] = await pool.query(
      'SELECT COUNT(*) as total FROM APPOINTMENTS WHERE deleted_at IS NULL'
    );

    // 2. Total Enrolled Students
    const [studentCount] = await pool.query(
      `SELECT COUNT(DISTINCT sp.user_id) as total_students
       FROM STUDENT_PROFILES sp
       JOIN USERS u ON sp.user_id = u.user_id
       WHERE u.is_active = TRUE AND u.deleted_at IS NULL`
    );

    // 3. Active Emergencies & Average Response Time
    const [emergencies] = await pool.query(
      `SELECT COUNT(CASE WHEN status IN ('triggered', 'acknowledged', 'dispatched') THEN 1 END) as active,
              COALESCE(AVG(response_time_seconds), 0) as avgResponseSeconds 
       FROM EMERGENCY_ALERTS`
    );

    // 4. Role Distribution (Headcount per role)
    const [roleDistribution] = await pool.query(
      `SELECT r.code AS role_code, 
              r.name AS role_name, 
              COUNT(u.user_id) AS count
       FROM ROLES r
       LEFT JOIN USER_ROLES ur ON r.role_id = ur.role_id
       LEFT JOIN USERS u ON ur.user_id = u.user_id AND u.is_active = TRUE AND u.deleted_at IS NULL
       GROUP BY r.role_id, r.code, r.name
       ORDER BY count DESC`
    );

    // 5. 14-Day Consultation Timeline
    const [dailyTimeline] = await pool.query(
      `SELECT date_key, label, COUNT(*) as count
       FROM (
         SELECT DATE_FORMAT(encounter_date, '%Y-%m-%d') as date_key,
                DATE_FORMAT(encounter_date, '%b %d') as label
         FROM EMR_RECORDS
         WHERE encounter_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND deleted_at IS NULL
       ) AS timeline_sub
       GROUP BY date_key, label
       ORDER BY date_key ASC`
    );

    const timelineMap = new Map(dailyTimeline.map((item) => [item.date_key, item.count]));
    const timeSeries = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      timeSeries.push({
        date: dateKey,
        label,
        count: timelineMap.get(dateKey) || 0,
      });
    }

    // 6. 14-Day Emergency SOS Incidents Timeline
    const [dailyEmergencyTimeline] = await pool.query(
      `SELECT date_key, label, COUNT(*) as count
       FROM (
         SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date_key,
                DATE_FORMAT(created_at, '%b %d') as label
         FROM EMERGENCY_ALERTS
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
       ) AS em_sub
       GROUP BY date_key, label
       ORDER BY date_key ASC`
    );

    const emergencyTimelineMap = new Map(dailyEmergencyTimeline.map((item) => [item.date_key, item.count]));
    const emergencyTimeSeries = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      emergencyTimeSeries.push({
        date: dateKey,
        label,
        count: emergencyTimelineMap.get(dateKey) || 0,
      });
    }

    // 7. Top Diagnoses (In-Memory AES-256 Decrypted Aggregation)
    const [allEmrs] = await pool.query(
      `SELECT diagnosis FROM EMR_RECORDS WHERE diagnosis IS NOT NULL AND diagnosis != '' AND deleted_at IS NULL`
    );

    const diagCountMap = {};
    for (const row of allEmrs) {
      const plainDiag = decrypt(row.diagnosis) || 'General Health Check';
      diagCountMap[plainDiag] = (diagCountMap[plainDiag] || 0) + 1;
    }

    const topDiagnoses = Object.entries(diagCountMap)
      .map(([diagnosis, count]) => ({ diagnosis, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 8. Consultation Volume per Department
    const [deptBreakdown] = await pool.query(
      `SELECT department, COUNT(*) as consultations_count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'General Walk-in') AS department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed' AND a.deleted_at IS NULL
       ) AS dept_sub
       GROUP BY department
       ORDER BY consultations_count DESC
       LIMIT 6`
    );

    // 9. Flu / Respiratory Surveillance
    const [fluEmrs] = await pool.query(
      `SELECT diagnosis, encounter_date FROM EMR_RECORDS 
       WHERE encounter_date >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND deleted_at IS NULL`
    );

    let cases_past_7_days = 0;
    let cases_prev_7_days = 0;
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

    for (const emr of fluEmrs) {
      const diagPlain = (decrypt(emr.diagnosis) || '').toLowerCase();
      const isFluLike =
        diagPlain.includes('flu') ||
        diagPlain.includes('respiratory') ||
        diagPlain.includes('fever') ||
        diagPlain.includes('cough');

      if (isFluLike) {
        const encounterTime = new Date(emr.encounter_date).getTime();
        const diff = now - encounterTime;
        if (diff <= sevenDaysMs) {
          cases_past_7_days++;
        } else if (diff <= fourteenDaysMs) {
          cases_prev_7_days++;
        }
      }
    }

    // 10. High-Risk Student Groups
    const [riskProfiles] = await pool.query(
      `SELECT chronic_conditions, allergies FROM HEALTH_PROFILES WHERE deleted_at IS NULL`
    );

    let hypertension_count = 0;
    let asthma_count = 0;
    let diabetes_count = 0;
    let severe_allergies_count = 0;

    for (const hp of riskProfiles) {
      const cond = (decrypt(hp.chronic_conditions) || '').toLowerCase();
      const allergy = (decrypt(hp.allergies) || '').toLowerCase();

      if (cond.includes('hypertension') || cond.includes('blood pressure')) hypertension_count++;
      if (cond.includes('asthma')) asthma_count++;
      if (cond.includes('diabetes')) diabetes_count++;
      if (allergy && allergy !== 'none' && allergy !== 'none recorded' && allergy !== 'n/a') {
        severe_allergies_count++;
      }
    }

    // 11. Low Stock & Near Expiry Pharmacy Batches
    const [lowStockMeds] = await pool.query(
      `SELECT b.batch_id, m.name, m.generic_name, b.batch_no, b.quantity_on_hand, m.reorder_level,
              DATE_FORMAT(b.expiry_date, '%Y-%m-%d') as expiry_date,
              DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry
       FROM MEDICINE_BATCHES b
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id
       WHERE b.deleted_at IS NULL AND (b.quantity_on_hand < 25 OR DATEDIFF(b.expiry_date, CURDATE()) <= 90)
       ORDER BY b.quantity_on_hand ASC
       LIMIT 6`
    );

    res.json({
      totalConsultations: consultations[0]?.total || 0,
      totalStudents: studentCount[0]?.total_students || 0,
      emergencyMetrics: emergencies[0] || { active: 0, avgResponseSeconds: 0 },
      roleDistribution,
      timeSeries,
      emergencyTimeSeries,
      topDiagnoses: topDiagnoses.length > 0 ? topDiagnoses : [{ diagnosis: 'General Health Check', count: 1 }],
      deptBreakdown: deptBreakdown.length > 0 ? deptBreakdown : [{ department: 'BS Information Technology', consultations_count: 1 }],
      fluStats: { cases_past_7_days, cases_prev_7_days },
      highRiskGroups: {
        hypertension_count,
        asthma_count,
        diabetes_count,
        severe_allergies_count,
        total_students_monitored: riskProfiles.length,
      },
      lowStockMeds,
    });
  } catch (error) {
    console.error('[Analytics] Error computing summary:', error);
    res.status(500).json({ error: 'Failed to compute health analytics summary.' });
  }
});

// 2. GET /api/analytics/by-department
router.get('/by-department', async (req, res) => {
  try {
    const [breakdown] = await pool.query(
      `SELECT department, COUNT(*) as consultation_count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'Other / Walk-in') as department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed' AND a.deleted_at IS NULL
       ) as d_sub
       GROUP BY department
       ORDER BY consultation_count DESC`
    );
    res.json(breakdown);
  } catch (error) {
    res.status(500).json({ error: 'Failed to aggregate departmental consultation data.' });
  }
});

// 3. GET /api/analytics/export/csv (Kept for backward compatibility)
router.get('/export/csv', async (req, res) => {
  try {
    const [allEmrs] = await pool.query(
      `SELECT diagnosis FROM EMR_RECORDS WHERE diagnosis IS NOT NULL AND diagnosis != '' AND deleted_at IS NULL`
    );

    const diagCountMap = {};
    for (const row of allEmrs) {
      const plainDiag = decrypt(row.diagnosis) || 'General Health Check';
      diagCountMap[plainDiag] = (diagCountMap[plainDiag] || 0) + 1;
    }

    const topDiagnoses = Object.entries(diagCountMap)
      .map(([diagnosis, count]) => ({ diagnosis, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const [deptBreakdown] = await pool.query(
      `SELECT department, COUNT(*) as count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'General Walk-in') as department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed' AND a.deleted_at IS NULL
       ) as d_sub
       GROUP BY department 
       ORDER BY count DESC`
    );

    const [roles] = await pool.query(
      `SELECT r.name, COUNT(u.user_id) as count
       FROM ROLES r
       LEFT JOIN USER_ROLES ur ON r.role_id = ur.role_id
       LEFT JOIN USERS u ON ur.user_id = u.user_id AND u.is_active = TRUE AND u.deleted_at IS NULL
       GROUP BY r.role_id, r.name
       ORDER BY count DESC`
    );

    const [inventory] = await pool.query(
      `SELECT m.name, b.batch_no, b.quantity_on_hand, b.expiry_date 
       FROM MEDICINE_BATCHES b 
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id
       WHERE b.deleted_at IS NULL`
    );

    let csv = '\uFEFF';
    csv += 'PANGASINAN STATE UNIVERSITY - INFIRMARY HEALTH ANALYTICS REPORT\n';
    csv += `Exported On,${new Date().toLocaleString()}\n\n`;

    csv += 'SECTION 1: CAMPUS ROLES & USER HEADCOUNT\n';
    csv += 'Role Designation,Active Users\n';
    roles.forEach((r) => {
      csv += `"${r.name}",${r.count}\n`;
    });
    csv += '\n';

    csv += 'SECTION 2: TOP CLINICAL DIAGNOSES\n';
    csv += 'Diagnosis,Cases Recorded\n';
    topDiagnoses.forEach((d) => {
      csv += `"${d.diagnosis}",${d.count}\n`;
    });
    csv += '\n';

    csv += 'SECTION 3: CONSULTATION VOLUME BY DEPARTMENT / COURSE\n';
    csv += 'Department / Course,Completed Consultations\n';
    deptBreakdown.forEach((d) => {
      csv += `"${d.department}",${d.count}\n`;
    });
    csv += '\n';

    csv += 'SECTION 4: PHARMACY INVENTORY & EXPIRY STATUS\n';
    csv += 'Medicine Name,Batch Number,Stock on Hand,Expiry Date\n';
    inventory.forEach((i) => {
      csv += `"${i.name}","${i.batch_no}",${i.quantity_on_hand},"${new Date(i.expiry_date).toISOString().split('T')[0]}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="PSU_Health_Report_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('[Analytics] CSV Export error:', error);
    res.status(500).json({ error: 'Failed to export CSV report.' });
  }
});

// 4. GET /api/analytics/export/xlsx
router.get('/export/xlsx', async (req, res) => {
  try {
    // 1. Fetch all the data
    const [allEmrs] = await pool.query(
      `SELECT diagnosis FROM EMR_RECORDS WHERE diagnosis IS NOT NULL AND diagnosis != '' AND deleted_at IS NULL`
    );

    const diagCountMap = {};
    for (const row of allEmrs) {
      const plainDiag = decrypt(row.diagnosis) || 'General Health Check';
      diagCountMap[plainDiag] = (diagCountMap[plainDiag] || 0) + 1;
    }

    const topDiagnoses = Object.entries(diagCountMap)
      .map(([diagnosis, count]) => ({ diagnosis, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const [deptBreakdown] = await pool.query(
      `SELECT department, COUNT(*) as count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'General Walk-in') as department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed' AND a.deleted_at IS NULL
       ) as d_sub
       GROUP BY department 
       ORDER BY count DESC`
    );

    const [roles] = await pool.query(
      `SELECT r.name, COUNT(u.user_id) as count
       FROM ROLES r
       LEFT JOIN USER_ROLES ur ON r.role_id = ur.role_id
       LEFT JOIN USERS u ON ur.user_id = u.user_id AND u.is_active = TRUE AND u.deleted_at IS NULL
       GROUP BY r.role_id, r.name
       ORDER BY count DESC`
    );

    const [inventory] = await pool.query(
      `SELECT m.name, b.batch_no, b.quantity_on_hand, b.expiry_date 
       FROM MEDICINE_BATCHES b 
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id
       WHERE b.deleted_at IS NULL`
    );

    // 2. Create the Excel Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Valetudo HealthLink';
    workbook.created = new Date();

    // --- Sheet 1: Summary ---
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 40 },
    ];
    summarySheet.addRow({ metric: 'Report Generated', value: new Date().toLocaleString() });
    summarySheet.addRow({ metric: 'Institution', value: 'Pangasinan State University - Lingayen Campus' });
    summarySheet.getRow(1).font = { bold: true };

    // --- Sheet 2: Role Headcount ---
    const rolesSheet = workbook.addWorksheet('User Roles');
    rolesSheet.columns = [
      { header: 'Role Designation', key: 'role', width: 30 },
      { header: 'Active Users', key: 'count', width: 15 },
    ];
    roles.forEach(r => rolesSheet.addRow({ role: r.name, count: r.count }));
    rolesSheet.getRow(1).font = { bold: true };

    // --- Sheet 3: Top Diagnoses ---
    const diagSheet = workbook.addWorksheet('Top Diagnoses');
    diagSheet.columns = [
      { header: 'Diagnosis', key: 'diagnosis', width: 40 },
      { header: 'Cases Recorded', key: 'count', width: 20 },
    ];
    topDiagnoses.forEach(d => diagSheet.addRow({ diagnosis: d.diagnosis, count: d.count }));
    diagSheet.getRow(1).font = { bold: true };

    // --- Sheet 4: Department Breakdown ---
    const deptSheet = workbook.addWorksheet('Department Breakdown');
    deptSheet.columns = [
      { header: 'Department / Course', key: 'department', width: 40 },
      { header: 'Completed Consultations', key: 'count', width: 25 },
    ];
    deptBreakdown.forEach(d => deptSheet.addRow({ department: d.department, count: d.count }));
    deptSheet.getRow(1).font = { bold: true };

    // --- Sheet 5: Pharmacy Inventory ---
    const invSheet = workbook.addWorksheet('Pharmacy Inventory');
    invSheet.columns = [
      { header: 'Medicine Name', key: 'name', width: 35 },
      { header: 'Batch Number', key: 'batch_no', width: 20 },
      { header: 'Stock on Hand', key: 'quantity', width: 15 },
      { header: 'Expiry Date', key: 'expiry', width: 15 },
    ];
    inventory.forEach(i => invSheet.addRow({ 
      name: i.name, 
      batch_no: i.batch_no, 
      quantity: i.quantity_on_hand, 
      expiry: new Date(i.expiry_date).toISOString().split('T')[0]
    }));
    invSheet.getRow(1).font = { bold: true };

    // 3. Stream the Excel file to the response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="PSU_Health_Analytics_${Date.now()}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('[Analytics] XLSX Export error:', error);
    res.status(500).json({ error: 'Failed to export XLSX report.' });
  }
});

// 5. GET /api/analytics/export/pdf
router.get('/export/pdf', async (req, res) => {
  try {
    // 1. Fetch the same data as the XLSX route
    const [allEmrs] = await pool.query(
      `SELECT diagnosis FROM EMR_RECORDS WHERE diagnosis IS NOT NULL AND diagnosis != '' AND deleted_at IS NULL`
    );
    const diagCountMap = {};
    for (const row of allEmrs) {
      const plainDiag = decrypt(row.diagnosis) || 'General Health Check';
      diagCountMap[plainDiag] = (diagCountMap[plainDiag] || 0) + 1;
    }
    const topDiagnoses = Object.entries(diagCountMap)
      .map(([diagnosis, count]) => ({ diagnosis, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const [deptBreakdown] = await pool.query(
      `SELECT department, COUNT(*) as count
       FROM (SELECT COALESCE(sp.course, fp.department, 'General Walk-in') as department
             FROM APPOINTMENTS a
             LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
             LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
             WHERE a.status = 'completed' AND a.deleted_at IS NULL) as d_sub
       GROUP BY department ORDER BY count DESC`
    );

    const [roles] = await pool.query(
      `SELECT r.name, COUNT(u.user_id) as count
       FROM ROLES r
       LEFT JOIN USER_ROLES ur ON r.role_id = ur.role_id
       LEFT JOIN USERS u ON ur.user_id = u.user_id AND u.is_active = TRUE AND u.deleted_at IS NULL
       GROUP BY r.role_id, r.name ORDER BY count DESC`
    );

    // 2. Create the PDF document
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PSU_Health_Analytics_${Date.now()}.pdf"`);

    // Pipe the PDF directly to the response
    doc.pipe(res);

    // --- Letterhead ---
    doc.fillColor('#1F4A34').fontSize(18).font('Helvetica-Bold').text('PANGASINAN STATE UNIVERSITY', { align: 'center' });
    doc.fontSize(14).font('Helvetica-Bold').text('CAMPUS INFIRMARY MEDICAL SERVICES', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#5A635B').text('Lingayen Campus · Health Analytics & Reporting', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#1F4A34').lineWidth(1.5).stroke();
    doc.moveDown(1);

    // --- Report Metadata ---
    doc.fillColor('#191C1A').fontSize(12).font('Helvetica-Bold').text('EPIDEMIOLOGICAL REPORT');
    doc.fontSize(9).font('Helvetica').fillColor('#5A635B').text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown(1.5);

    // --- Section 1: Role Headcount ---
    doc.fillColor('#1F4A34').fontSize(14).font('Helvetica-Bold').text('1. Campus Population & Headcount');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#191C1A');
    roles.forEach(r => {
      doc.text(`• ${r.name}: ${r.count} active users`);
    });
    doc.moveDown(1.5);

    // --- Section 2: Top Diagnoses ---
    doc.fillColor('#1F4A34').fontSize(14).font('Helvetica-Bold').text('2. Top Clinical Diagnoses');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#191C1A');
    topDiagnoses.forEach(d => {
      doc.text(`• ${d.diagnosis}: ${d.count} cases`);
    });
    doc.moveDown(1.5);

    // --- Section 3: Department Breakdown ---
    doc.fillColor('#1F4A34').fontSize(14).font('Helvetica-Bold').text('3. Consultation Volume by Department');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#191C1A');
    deptBreakdown.forEach(d => {
      doc.text(`• ${d.department}: ${d.count} completed consultations`);
    });
    doc.moveDown(1.5);

    // --- Footer ---
    const bottomY = doc.page.height - 50;
    doc.fontSize(8).fillColor('#94A396').text('Protected under Republic Act No. 10173 (Data Privacy Act of 2012).', 50, bottomY, { align: 'center' });

    // Finalize the PDF
    doc.end();

  } catch (error) {
    console.error('[Analytics] PDF Export error:', error);
    res.status(500).json({ error: 'Failed to export PDF report.' });
  }
});

export default router;