import { once } from 'node:events';
import PDFDocument from 'pdfkit';
import { workflowSections } from './sections.js';

export async function renderPdf({ roles, topDiagnoses: topDiag, deptBreakdown: deptRows, inventory: medRows, surveillance, pharmacy }) {
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
    .text('CAMPUS INFIRMARY ANALYTICS REPORT', { align: 'center' })
    .moveDown(0.2)
    .fillColor('#5A635B')
    .fontSize(9)
    .font('Helvetica')
    .text('Lingayen Campus', { align: 'center' });

  doc.moveDown(0.6);
  doc.moveTo(45, doc.y).lineTo(doc.page.width - 45, doc.y).strokeColor('#1F4A34').lineWidth(1.2).stroke();
  doc.moveDown(0.8);

  doc
    .fillColor('#191C1A')
    .fontSize(9)
    .font('Helvetica')
    .text(`Generated: ${new Date().toLocaleString('en-PH')} · Origin: University Healthlink Backend`, { align: 'right' });
  doc.moveDown(0.8);

  let section = 0;
  if (roles) {
    doc.fillColor('#1F4A34').font('Helvetica-Bold').fontSize(11).text(`${++section}. CAMPUS ROLES & USER HEADCOUNT`);
    doc.moveDown(0.4);
    for (const role of roles) {
      doc.fillColor('#191C1A').font('Helvetica').fontSize(9.5).text(`${role.name}: ${role.count}`);
    }
    doc.moveDown(0.8);
  }

  if (topDiag) {
    // Section 1: Clinical Diagnoses

    doc.fillColor('#1F4A34').font('Helvetica-Bold').fontSize(11).text(`${++section}. TOP CLINICAL DIAGNOSES`);
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
  }

  if (deptRows) {
    // Section 2: Department Volume

    doc.fillColor('#1F4A34').font('Helvetica-Bold').fontSize(11).text(`${++section}. CONSULTATION VOLUME BY DEPARTMENT / PROGRAM`);
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
  }

  if (medRows) {
    // Section 3: Critical Low Stock Supplies

    doc.fillColor('#1F4A34').font('Helvetica-Bold').fontSize(11).text(`${++section}. CRITICAL PHARMACY INVENTORY & NEAR-EXPIRY WATCH`);
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
  }

  for (const { title, subtitle, columns, rows } of workflowSections({ surveillance, pharmacy })) {
    doc.moveDown(0.8).fillColor('#1F4A34').font('Helvetica-Bold').fontSize(11).text(`${++section}. ${title.toUpperCase()}`, 45);
    doc.moveDown(0.4).fillColor('#191C1A').font('Helvetica').fontSize(9.5);
    if (subtitle) doc.text(subtitle);
    if (rows.length === 0) doc.text('No entries.');
    for (const [label, ...values] of rows) {
      const detail = values.length === 1 ? values[0] : values.map((value, index) => `${columns[index + 1]}: ${value}`).join(' · ');
      doc.text(`${label}: ${detail}`);
    }
  }

  if (topDiag || medRows || surveillance || pharmacy) {
    doc.moveDown().fillColor('#5A635B').font('Helvetica').fontSize(8)
      .text('Republic Act No. 10173 Protected Data · Internal campus use', { align: 'center' });
  }

  const ended = once(doc, 'end');
  doc.end();
  await ended;
  return Buffer.concat(chunks);
}
