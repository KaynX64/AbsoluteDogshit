import { formatSignatory } from '../../../utils/signatory.js';
import {
  BRAND_GREEN,
  BRAND_SOFT,
  TEXT_DARK,
  TEXT_SUB,
  TEXT_MUTED,
  BORDER,
  DANGER,
  createDoc,
  bufferFromDoc,
  qrBuffer,
  drawLetterhead,
  drawInfoRow,
  drawSectionTitle,
  drawFooter,
} from '../renderer.js';

// ─── MEDICAL CLEARANCE PDF ────────────────────────────────────────────────
// (unchanged — no layout bugs in this path)

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

  const signer = formatSignatory(doctor);
  drawInfoRow(doc, 'Issued By:',   signer.name);
  drawInfoRow(doc, 'Designation:', signer.designation);
  drawInfoRow(doc, 'PRC License:', signer.license_no);
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
  doc.moveDown(doctor.signature_png ? 4 : 2);
  const sigY = doc.y;
  if (doctor.signature_png) {
    try {
      doc.image(doctor.signature_png, doc.page.width - 250, sigY - 48, {
        fit: [180, 46],
        align: 'center',
        valign: 'bottom',
      });
    } catch (e) {
      console.warn('⚠️ [PDF] Signature image skipped:', e.message);
    }
  }

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
    .text(signer.name, doc.page.width - 260, sigY + 4, { width: 200, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(signer.qualified ? TEXT_SUB : DANGER)
    .text(signer.caption, doc.page.width - 260, doc.y, {
      width: 200,
      align: 'center',
    });

  drawFooter(doc, 'Clearance ID', `CLR-${clearance_id}`, issued_at);

  doc.end();
  return bufPromise;
}
