// server/src/routes/analytics.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { decrypt } from '../utils/cryptoVault.js';
import { getDiagnosisCounts, getRiskCounts } from '../utils/analyticsStats.js';
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
    const topDiagnoses = (await getDiagnosisCounts()).slice(0, 5);

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
    const {
      hypertension_count,
      asthma_count,
      diabetes_count,
      severe_allergies_count,
      total: riskProfileTotal,
    } = await getRiskCounts();

    
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
        total_students_monitored: riskProfileTotal,
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
    const topDiagnoses = (await getDiagnosisCounts()).slice(0, 10);

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

// 4. GET /api/analytics/export/excel - Native Microsoft Excel (.xlsx) Report
router.get('/export/excel', async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Valetudo HealthLink - PSU Lingayen Infirmary';
    workbook.created = new Date();

    // Palette & Styles
    const headerFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4A34' }, // PSU Forest Green
    };
    const headerFont = {
      name: 'Arial',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };

    // Sheet 1: Headcount & Roles
    const [roles] = await pool.query(
      `SELECT r.name, COUNT(u.user_id) as count
       FROM ROLES r
       LEFT JOIN USER_ROLES ur ON r.role_id = ur.role_id
       LEFT JOIN USERS u ON ur.user_id = u.user_id AND u.is_active = TRUE AND u.deleted_at IS NULL
       GROUP BY r.role_id, r.name
       ORDER BY count DESC`
    );
    const sheetRoles = workbook.addWorksheet('Campus Headcount');
    sheetRoles.columns = [
      { header: 'Role Designation', key: 'name', width: 35 },
      { header: 'Active Accounts', key: 'count', width: 20 },
    ];
    sheetRoles.getRow(1).fill = headerFill;
    sheetRoles.getRow(1).font = headerFont;
    roles.forEach((r) => sheetRoles.addRow({ name: r.name, count: r.count }));

    // Sheet 2: Clinical Diagnoses
    const topDiagnoses = (await getDiagnosisCounts());

    const sheetDiag = workbook.addWorksheet('Clinical Diagnoses');
    sheetDiag.columns = [
      { header: 'Primary Diagnosis', key: 'diagnosis', width: 45 },
      { header: 'Encounter Cases', key: 'count', width: 20 },
    ];
    sheetDiag.getRow(1).fill = headerFill;
    sheetDiag.getRow(1).font = headerFont;
    topDiagnoses.forEach((d) => sheetDiag.addRow(d));

    // Sheet 3: Volume by Department
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
    const sheetDept = workbook.addWorksheet('Department Volume');
    sheetDept.columns = [
      { header: 'Department / Course', key: 'department', width: 40 },
      { header: 'Completed Consultations', key: 'count', width: 25 },
    ];
    sheetDept.getRow(1).fill = headerFill;
    sheetDept.getRow(1).font = headerFont;
    deptBreakdown.forEach((d) => sheetDept.addRow(d));

    // Sheet 4: Pharmacy Inventory
    const [inventory] = await pool.query(
      `SELECT m.name, b.batch_no, b.quantity_on_hand, b.expiry_date,
              DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry
       FROM MEDICINE_BATCHES b 
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id
       WHERE b.deleted_at IS NULL
       ORDER BY b.expiry_date ASC`
    );
    const sheetInv = workbook.addWorksheet('Pharmacy Formulary');
    sheetInv.columns = [
      { header: 'Medication Name', key: 'name', width: 35 },
      { header: 'Lot / Batch No.', key: 'batch_no', width: 25 },
      { header: 'Units on Hand', key: 'quantity_on_hand', width: 18 },
      { header: 'Expiry Date', key: 'expiry_date', width: 18 },
      { header: 'Days Remaining', key: 'days_until_expiry', width: 18 },
    ];
    sheetInv.getRow(1).fill = headerFill;
    sheetInv.getRow(1).font = headerFont;
    inventory.forEach((i) =>
      sheetInv.addRow({
        name: i.name,
        batch_no: i.batch_no,
        quantity_on_hand: i.quantity_on_hand,
        expiry_date: new Date(i.expiry_date).toISOString().split('T')[0],
        days_until_expiry: i.days_until_expiry,
      })
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="PSU_Health_Analytics_${Date.now()}.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('[Analytics] Excel Export error:', error);
    res.status(500).json({ error: 'Failed to generate Excel report.' });
  }
});

// 5. GET /api/analytics/export/pdf - Programmatic Server-Side PDF Report (PDFKit)
router.get('/export/pdf', async (req, res) => {
  try {
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));

    // Letterhead
    doc
      .fillColor('#5A635B')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('PANGASINAN STATE UNIVERSITY', { align: 'center', characterSpacing: 2 })
      .moveDown(0.2)
      .fillColor('#1F4A34')
      .fontSize(15)
      .font('Helvetica-Bold')
      .text('CAMPUS INFIRMARY EPIDEMIOLOGICAL REPORT', { align: 'center' })
      .moveDown(0.2)
      .fillColor('#5A635B')
      .fontSize(9)
      .font('Helvetica')
      .text('Lingayen Campus · R.A. 10173 Compliant Health Analytics Summary', { align: 'center' });

    doc.moveDown(0.6);
    doc.moveTo(45, doc.y).lineTo(doc.page.width - 45, doc.y).strokeColor('#1F4A34').lineWidth(1.2).stroke();
    doc.moveDown(0.8);

    doc
      .fillColor('#191C1A')
      .fontSize(9)
      .font('Helvetica')
      .text(`Generated: ${new Date().toLocaleString('en-PH')} · Origin: University Healthlink Backend`, { align: 'right' });
    doc.moveDown(0.8);

    // Section 1: Clinical Diagnoses
    const topDiag = (await getDiagnosisCounts()).slice(0, 8);

    doc.fillColor('#1F4A34').font('Helvetica-Bold').fontSize(11).text('1. TOP CLINICAL DIAGNOSES');
    doc.moveDown(0.4);

    topDiag.forEach((d, idx) => {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#191C1A')
        .text(`${idx + 1}. ${d.diagnosis}`, 55, doc.y, { continued: true, width: 380 })
        .font('Helvetica-Bold')
        .text(` — ${d.count} encounters`, { align: 'right' });
      doc.moveDown(0.2);
    });

    doc.moveDown(0.8);

    // Section 2: Department Volume
    const [deptRows] = await pool.query(
      `SELECT department, COUNT(*) as count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'General Walk-in') as department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed' AND a.deleted_at IS NULL
       ) as d_sub
       GROUP BY department 
       ORDER BY count DESC
       LIMIT 6`
    );

    doc.fillColor('#1F4A34').font('Helvetica-Bold').fontSize(11).text('2. CONSULTATION VOLUME BY DEPARTMENT / PROGRAM');
    doc.moveDown(0.4);

    deptRows.forEach((dp, idx) => {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#191C1A')
        .text(`${idx + 1}. ${dp.department}`, 55, doc.y, { continued: true, width: 380 })
        .font('Helvetica-Bold')
        .text(` — ${dp.count} visits`, { align: 'right' });
      doc.moveDown(0.2);
    });

    doc.moveDown(0.8);

    // Section 3: Critical Low Stock Supplies
    const [medRows] = await pool.query(
      `SELECT m.name, b.batch_no, b.quantity_on_hand, DATE_FORMAT(b.expiry_date, '%Y-%m-%d') as expiry_date
       FROM MEDICINE_BATCHES b
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id
       WHERE b.deleted_at IS NULL AND (b.quantity_on_hand < 25 OR DATEDIFF(b.expiry_date, CURDATE()) <= 90)
       ORDER BY b.quantity_on_hand ASC
       LIMIT 5`
    );

    doc.fillColor('#1F4A34').font('Helvetica-Bold').fontSize(11).text('3. CRITICAL PHARMACY INVENTORY & NEAR-EXPIRY WATCH');
    doc.moveDown(0.4);

    if (medRows.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#5A635B').text('All formulary stocks have adequate buffer margins.', 55);
    } else {
      medRows.forEach((m) => {
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#7A2E26')
          .text(`• ${m.name} (Lot: ${m.batch_no})`, 55, doc.y, { continued: true })
          .text(` — ${m.quantity_on_hand} units left (Expires: ${m.expiry_date})`, { align: 'right' });
        doc.moveDown(0.2);
      });
    }

    // Sign-off footer
    const bottomY = doc.page.height - 75;
    doc.moveTo(45, bottomY - 10).lineTo(doc.page.width - 45, bottomY - 10).strokeColor('#DCE4DA').lineWidth(0.8).stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#94A396')
      .text('Republic Act No. 10173 Protected Data · For Internal Campus Clinical Administration Only', 45, bottomY, {
        align: 'center',
      });

    doc.end();

    doc.on('end', () => {
      const result = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="PSU_Infirmary_Analytics_${Date.now()}.pdf"`
      );
      res.setHeader('Content-Length', String(result.length));
      res.send(result);
    });
  } catch (error) {
    console.error('[Analytics] PDF Export error:', error);
    res.status(500).json({ error: 'Failed to generate PDF analytics report.' });
  }
});

export default router;