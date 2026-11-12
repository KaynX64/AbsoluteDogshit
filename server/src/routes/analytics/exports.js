import { pool } from '../../db/pool.js';
import { getDiagnosisCounts } from '../../analytics/analyticsStats.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export function registerAnalyticsExports(router) {
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
      workbook.creator = 'LeoVital HealthLink - PSU Lingayen Infirmary';
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
}
