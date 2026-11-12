import { once } from 'node:events';
import PDFDocument from 'pdfkit';

export async function renderPdf({ topDiag, deptRows, medRows }) {
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

  const ended = once(doc, 'end');
  doc.end();
  await ended;
  return Buffer.concat(chunks);
}
