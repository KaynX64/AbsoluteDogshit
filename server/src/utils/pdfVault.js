// server/src/utils/pdfVault.js
//
// Renders official PSU Infirmary PDFs for prescriptions and clearances.
// Output is a Buffer ready for upload to MinIO/S3. No headless Chrome,
// no external QR API — everything renders locally with pdfkit + qrcode.

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// ─── Brand palette (mirrors the desktop theme) ────────────────────────────
const BRAND_GREEN = '#1F4A34';
const BRAND_SOFT  = '#E2EBE1';
const TEXT_DARK   = '#191C1A';
const TEXT_SUB    = '#5A635B';
const TEXT_MUTED  = '#94A396';
const BORDER      = '#DCE4DA';
const DANGER      = '#7A2E26';

// ─── Low-level helpers ────────────────────────────────────────────────────

function createDoc() {
  return new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Producer: 'Valetudo HealthLink',
      Creator: 'Pangasinan State University - Lingayen Infirmary',
    },
  });
}

function bufferFromDoc(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

async function qrBuffer(text, size = 110) {
  return QRCode.toBuffer(text, {
    type: 'png',
    width: size,
    margin: 1,
    color: { dark: '#0F1E17', light: '#FFFFFF' },
  });
}

function drawLetterhead(doc, subtitle) {
  doc
    .fillColor(TEXT_SUB)
    .fontSize(9)
    .font('Helvetica-Bold')
    .text('PANGASINAN STATE UNIVERSITY', { align: 'center', characterSpacing: 2 })
    .moveDown(0.15)
    .fillColor(BRAND_GREEN)
    .fontSize(15)
    .font('Helvetica-Bold')
    .text('CAMPUS INFIRMARY MEDICAL SERVICES', { align: 'center' })
    .moveDown(0.1)
    .fillColor(TEXT_SUB)
    .fontSize(9)
    .font('Helvetica')
    .text(subtitle, { align: 'center' });

  doc.moveDown(0.6);
  const y = doc.y;
  doc
    .moveTo(60, y)
    .lineTo(doc.page.width - 60, y)
    .strokeColor(BRAND_GREEN)
    .lineWidth(1.4)
    .stroke();
  doc.moveDown(1.2);
}

function drawInfoRow(doc, label, value) {
  const labelWidth = 150;
  const startY = doc.y;

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(TEXT_SUB)
    .text(label, 60, startY, { width: labelWidth });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(TEXT_DARK)
    .text(value || 'N/A', 60 + labelWidth, startY, {
      width: doc.page.width - 60 - labelWidth - 60,
    });

  doc.moveDown(0.3);
}

function drawSectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(BRAND_GREEN)
    .text(text, { characterSpacing: 0.8 });
  doc.moveDown(0.3);
}

function drawFooter(doc, refLabel, refValue, issuedAt) {
  const bottomY = doc.page.height - 90;

  doc
    .moveTo(60, bottomY - 10)
    .lineTo(doc.page.width - 60, bottomY - 10)
    .strokeColor(BORDER)
    .lineWidth(0.8)
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(TEXT_MUTED)
    .text(
      `Protected under R.A. 10173 (Data Privacy Act of 2012) · ${refLabel}: ${refValue}`,
      60,
      bottomY,
      { width: doc.page.width - 120, align: 'left' }
    );

  doc.text(
    `Generated: ${new Date(issuedAt).toLocaleString('en-PH')}`,
    60,
    doc.y + 2,
    { width: doc.page.width - 120, align: 'right' }
  );
}

// ─── PRESCRIPTION PDF ─────────────────────────────────────────────────────

export async function renderPrescriptionPDF(rx) {
  const {
    prescription_id,
    patient,
    doctor,
    items,
    notes,
    qr_token,
    issued_at,
    verification_url,
  } = rx;

  const doc = createDoc();
  const bufPromise = bufferFromDoc(doc);

  drawLetterhead(
    doc,
    'Lingayen Campus · Official Digital Prescription (R.A. 10173 Verified)'
  );

  drawInfoRow(doc, 'Patient Name:',        `${patient.first_name} ${patient.last_name}`);
  drawInfoRow(doc, 'Student / ID No:',     patient.student_no || 'N/A');
  drawInfoRow(doc, 'Course / Affiliation:', patient.course || 'PSU Lingayen');
  drawInfoRow(doc, 'Blood Type:',          patient.blood_type || 'Unknown');
  drawInfoRow(
    doc,
    'Allergies:',
    patient.allergies && patient.allergies !== 'None'
      ? `⚠ ${patient.allergies}`
      : 'None reported'
  );
  drawInfoRow(doc, 'Attending Physician:', `Dr. ${doctor.first_name} ${doctor.last_name}`);
  drawInfoRow(doc, 'PRC License:',         doctor.license_no || 'PRC Verified');
  drawInfoRow(doc, 'Issued:',              new Date(issued_at).toLocaleString('en-PH'));

  // Rx glyph
  doc.moveDown(0.4);
  doc
    .font('Times-Bold')
    .fontSize(28)
    .fillColor(BRAND_GREEN)
    .text('℞', { align: 'left' });
  doc.moveDown(0.3);

  drawSectionTitle(doc, 'PRESCRIBED FORMULARY MEDICATION');

  // Table header
  const col1X = 60;
  const col2X = 340;
  const col3X = 420;
  const col4X = 470;
  const headerY = doc.y;

  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT_SUB);
  doc.text('Medicine',  col1X, headerY, { width: 270 });
  doc.text('Dosage',    col2X, headerY, { width: 70 });
  doc.text('Duration',  col3X, headerY, { width: 50 });
  doc.text('Qty',       col4X, headerY, { width: 60 });

  doc.moveDown(0.4);
  doc
    .moveTo(60, doc.y)
    .lineTo(doc.page.width - 60, doc.y)
    .strokeColor(BORDER)
    .lineWidth(0.6)
    .stroke();
  doc.moveDown(0.3);

  for (const it of items) {
    const rowY = doc.y;
    const medName = it.medicine_name || 'Prescribed medication';
    const generic = it.generic_name ? ` (${it.generic_name})` : '';

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(TEXT_DARK)
      .text(medName, col1X, rowY, { width: 270 });
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(TEXT_SUB)
      .text(generic, col1X, doc.y, { width: 270 });

    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(TEXT_DARK)
      .text(it.dosage || '—', col2X, rowY, { width: 70 });
    doc.text(`${it.duration_days || '—'} d`, col3X, rowY, { width: 50 });
    doc.text(`${it.quantity_dispensed || '—'}`, col4X, rowY, { width: 60 });

    doc.moveDown(0.2);
    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor(TEXT_SUB)
      .text(
        `Sig: ${it.instructions || 'Take as directed'} · ${
          it.frequency || 'As needed'
        } · ${it.route || 'Oral'}`,
        col1X,
        doc.y,
        { width: doc.page.width - 120 }
      );
    doc.moveDown(0.5);
  }

  if (notes && notes.trim()) {
    drawSectionTitle(doc, 'PHYSICIAN NOTES');
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(TEXT_DARK)
      .text(notes, { width: doc.page.width - 120 });
    doc.moveDown(0.4);
  }

  // Verification seal panel
  drawSectionTitle(doc, 'R.A. 10173 CRYPTOGRAPHIC SEAL');
  const panelY = doc.y;
  const qr = await qrBuffer(verification_url, 110);

  doc
    .rect(60, panelY, doc.page.width - 120, 130)
    .fillAndStroke(BRAND_SOFT, BORDER);

  doc.image(qr, 78, panelY + 10, { width: 110, height: 110 });

  doc
    .fillColor(BRAND_GREEN)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('Digital Prescription Verification', 205, panelY + 18, { width: 320 });
  doc
    .fillColor(TEXT_SUB)
    .font('Helvetica')
    .fontSize(9)
    .text(
      'Scan with the Valetudo mobile scanner or infirmary terminal to confirm valid issuance.',
      205,
      panelY + 34,
      { width: 320 }
    );
  doc
    .fillColor(TEXT_MUTED)
    .font('Courier')
    .fontSize(7.5)
    .text(qr_token || '', 205, panelY + 66, { width: 320 });

  doc.y = panelY + 140;

  // Signature line
  doc.moveDown(2);
  const sigY = doc.y;
  doc
    .moveTo(doc.page.width - 260, sigY)
    .lineTo(doc.page.width - 60, sigY)
    .strokeColor(TEXT_DARK)
    .lineWidth(0.8)
    .stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(TEXT_DARK)
    .text(
      `Dr. ${doctor.first_name} ${doctor.last_name}`,
      doc.page.width - 260,
      sigY + 4,
      { width: 200, align: 'center' }
    );
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(TEXT_SUB)
    .text('PRC Verified E-Signature', doc.page.width - 260, doc.y, {
      width: 200,
      align: 'center',
    });

  drawFooter(doc, 'Prescription ID', `RX-${prescription_id}`, issued_at);

  doc.end();
  return bufPromise;
}

// ─── MEDICAL CLEARANCE PDF ────────────────────────────────────────────────

export async function renderClearancePDF(clearance) {
  const {
    clearance_id,
    patient,
    doctor,
    purpose,
    remarks,
    issued_at,
    expires_at,
    qr_token,
    verification_url,
  } = clearance;

  const doc = createDoc();
  const bufPromise = bufferFromDoc(doc);

  drawLetterhead(
    doc,
    'Lingayen Campus · Official Medical Clearance Certificate'
  );

  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(TEXT_DARK)
    .text('OFFICIAL MEDICAL CLEARANCE', { align: 'center', characterSpacing: 1 });
  doc.moveDown(1.2);

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(TEXT_DARK)
    .text('TO WHOM IT MAY CONCERN:');
  doc.moveDown(0.5);

  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor(TEXT_DARK)
    .text(
      `This certifies that ${patient.first_name} ${patient.last_name} ` +
        `(${patient.student_no || 'PSU Student'}), enrolled in ` +
        `${patient.course || 'PSU Lingayen'}, has undergone physical medical ` +
        `evaluation at the University Infirmary and is determined to be:`,
      { align: 'justify', lineGap: 3 }
    );

  doc.moveDown(0.8);

  // Fitness banner
  const bannerY = doc.y;
  doc
    .rect(60, bannerY, doc.page.width - 120, 58)
    .fillAndStroke(BRAND_SOFT, BRAND_GREEN);

  doc
    .fillColor(BRAND_GREEN)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('STATUS: PHYSICALLY FIT', 76, bannerY + 10, {
      width: doc.page.width - 152,
    });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(TEXT_DARK)
    .text(`Cleared for: ${purpose}`, 76, bannerY + 30, {
      width: doc.page.width - 152,
    });

  doc.y = bannerY + 70;

  drawInfoRow(doc, 'Issued By:',   `Dr. ${doctor.first_name} ${doctor.last_name}`);
  drawInfoRow(doc, 'PRC License:', doctor.license_no || 'PRC Verified');
  drawInfoRow(doc, 'Date Issued:', new Date(issued_at).toLocaleDateString('en-PH'));
  drawInfoRow(doc, 'Valid Until:', new Date(expires_at).toLocaleDateString('en-PH'));

  if (remarks && remarks.trim()) {
    drawSectionTitle(doc, 'CLINICAL FITNESS STATEMENT');
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(TEXT_DARK)
      .text(remarks, { align: 'justify', lineGap: 3 });
    doc.moveDown(0.4);
  }

  // Verification seal panel
  drawSectionTitle(doc, 'R.A. 10173 CRYPTOGRAPHIC SEAL');
  const panelY = doc.y;
  const qr = await qrBuffer(verification_url, 110);

  doc
    .rect(60, panelY, doc.page.width - 120, 130)
    .fillAndStroke(BRAND_SOFT, BORDER);

  doc.image(qr, 78, panelY + 10, { width: 110, height: 110 });

  doc
    .fillColor(BRAND_GREEN)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('Digital Clearance Verification', 205, panelY + 18, { width: 320 });
  doc
    .fillColor(TEXT_SUB)
    .font('Helvetica')
    .fontSize(9)
    .text(
      'Verifiable by university deans, athletic committees, or host training establishments.',
      205,
      panelY + 34,
      { width: 320 }
    );
  doc
    .fillColor(TEXT_MUTED)
    .font('Courier')
    .fontSize(7.5)
    .text(qr_token || '', 205, panelY + 66, { width: 320 });

  doc.y = panelY + 140;

  // Signature line
  doc.moveDown(2);
  const sigY = doc.y;
  doc
    .moveTo(doc.page.width - 260, sigY)
    .lineTo(doc.page.width - 60, sigY)
    .strokeColor(TEXT_DARK)
    .lineWidth(0.8)
    .stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(TEXT_DARK)
    .text(
      `Dr. ${doctor.first_name} ${doctor.last_name}`,
      doc.page.width - 260,
      sigY + 4,
      { width: 200, align: 'center' }
    );
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(TEXT_SUB)
    .text('PRC Verified E-Signature', doc.page.width - 260, doc.y, {
      width: 200,
      align: 'center',
    });

  drawFooter(doc, 'Clearance ID', `CLR-${clearance_id}`, issued_at);

  doc.end();
  return bufPromise;
}