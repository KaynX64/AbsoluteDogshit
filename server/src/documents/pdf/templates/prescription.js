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
    expires_at,
    verification_url,
  } = rx;

  const doc = createDoc();
  const bufPromise = bufferFromDoc(doc);

  drawLetterhead(
    doc,
    'Lingayen Campus · Official Digital Prescription (R.A. 10173 Verified)'
  );

  drawInfoRow(doc, 'Patient Name:',         `${patient.first_name} ${patient.last_name}`);
  drawInfoRow(doc, 'Student / ID No:',      patient.student_no || 'N/A');
  drawInfoRow(doc, 'Course / Affiliation:', patient.course || 'PSU Lingayen');
  if (patient.date_of_birth || patient.age != null) {
    const dobStr = patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('en-PH') : null;
    const ageStr = patient.age != null ? `${patient.age} yrs old` : null;
    const dobAge = [dobStr, ageStr].filter(Boolean).join(' · ');
    drawInfoRow(doc, 'DOB / Age:', dobAge);
  }
  if (patient.sex) {
    drawInfoRow(doc, 'Sex:', patient.sex);
  }
  drawInfoRow(doc, 'Blood Type:',           patient.blood_type || 'Unknown');
  drawInfoRow(
    doc,
    'Allergies:',
    patient.allergies && patient.allergies !== 'None'
      ? `⚠ ${patient.allergies}`
      : 'None reported'
  );
  const signer = formatSignatory(doctor);
  drawInfoRow(doc, 'Prescribed By:', signer.name);
  drawInfoRow(doc, 'Designation:',   signer.designation);
  drawInfoRow(doc, 'PRC License:',   signer.license_no);
  drawInfoRow(doc, 'Issued:',        new Date(issued_at).toLocaleString('en-PH'));
  if (expires_at) {
    drawInfoRow(doc, 'Valid Until:', new Date(expires_at).toLocaleDateString('en-PH'));
  }

  // Rx glyph — ASCII-safe "Rx" because U+211E ("℞") is not part of the
  // standard 14 PDF fonts and would render as a blank box / .notdef marker.
  // Explicit x=60 resets the cursor to the left margin (the previous
  // drawInfoRow left doc.x in the value column, which pushed the glyph off-
  // center in the old version).
  doc.moveDown(0.6);
  doc
    .font('Times-BoldItalic')
    .fontSize(22)
    .fillColor(BRAND_GREEN)
    .text('Rx', 60, doc.y, { align: 'left' });
  doc.moveDown(0.5);

  // ── Outside-drug detection (affects section title & advisory note) ──
  const hasOutsideItems = items.some((it) => Boolean(it.is_outside));

  drawSectionTitle(doc, hasOutsideItems ? 'PRESCRIBED MEDICATION' : 'PRESCRIBED FORMULARY MEDICATION');
  if (hasOutsideItems) {
    doc
      .font('Helvetica-Oblique')
      .fontSize(8.5)
      .fillColor(DANGER)
      .text(
        'Items marked OUTSIDE are not stocked by the infirmary pharmacy and must be purchased by the patient at an external / accredited drugstore.',
        { width: doc.page.width - 120 }
      );
    doc.moveDown(0.4);
  }

  // ── Fixed column grid (A4 = 595pt wide, margin 50 → content band 60..535) ──
  const col1X    = 60;    // Medicine name
  const colMedW  = 250;
  const col2X    = 320;   // Dosage
  const colDoseW = 65;
  const col3X    = 395;   // Duration
  const colDurW  = 60;
  const col4X    = 465;   // Qty
  const colQtyW  = 70;

  // Table header
  const headerY = doc.y;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT_SUB);
  doc.text('Medicine', col1X, headerY, { width: colMedW });
  doc.text('Dosage',   col2X, headerY, { width: colDoseW });
  doc.text('Duration', col3X, headerY, { width: colDurW });
  doc.text('Qty',      col4X, headerY, { width: colQtyW });

  doc.y = headerY + 14;
  doc
    .moveTo(60, doc.y)
    .lineTo(doc.page.width - 60, doc.y)
    .strokeColor(BORDER)
    .lineWidth(0.6)
    .stroke();
  doc.moveDown(0.6);

  // ── Table rows ──
  for (const it of items) {
    const rowTop = doc.y;
    const isOutside = Boolean(it.is_outside);
    const medName = isOutside
      ? `${it.medicine_name || 'Prescribed medication'}  [OUTSIDE]`
      : it.medicine_name || 'Prescribed medication';
    const generic = isOutside
      ? 'Outside-pharmacy purchase — not dispensed by the infirmary'
      : it.generic_name
        ? `(${it.generic_name})`
        : '';
    const sigLine = `Sig: ${it.instructions || 'Take as directed'} · ${
      it.frequency || 'As needed'
    } · ${it.route || 'Oral'}`;

    // 1. Measure each block using the font it will be drawn in,
    //    so we can size the whole row before writing anything.
    doc.font('Helvetica-Bold').fontSize(10);
    const medH = doc.heightOfString(medName, { width: colMedW });

    doc.font('Helvetica').fontSize(9);
    const genericH = generic ? doc.heightOfString(generic, { width: colMedW }) : 0;

    doc.font('Helvetica-Oblique').fontSize(9);
    const sigH = doc.heightOfString(sigLine, {
      width: doc.page.width - 60 - col1X,
    });

    const nameBlockH = medH + (genericH ? genericH + 2 : 0);
    const rowInnerH  = nameBlockH + sigH + 6;   // 6pt gap between name block and sig
    const rowH       = Math.max(rowInnerH, 26); // min height so short rows breathe

    // 2. Draw the brand name (bold).
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_DARK)
      .text(medName, col1X, rowTop, { width: colMedW });

    // 3. Draw the generic name (small grey) directly below the brand name.
    if (generic) {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SUB)
        .text(generic, col1X, rowTop + medH + 2, { width: colMedW });
    }

    // 4. Draw dosage / duration / qty — all top-aligned with the brand name.
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT_DARK);
    doc.text(it.dosage || '—',                                    col2X, rowTop, { width: colDoseW });
    doc.text(`${it.duration_days || '—'} d`,                      col3X, rowTop, { width: colDurW  });
    doc.text(`${it.quantity_prescribed ?? it.quantity_dispensed ?? '—'}`, col4X, rowTop, { width: colQtyW  });

    // 5. Draw the sig line — italic, full table width, below the name block.
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(TEXT_SUB)
      .text(sigLine, col1X, rowTop + nameBlockH + 6, {
        width: doc.page.width - 60 - col1X,
      });

    // 6. Advance the cursor past this row by exactly rowH, then add a small gap.
    doc.y = rowTop + rowH;
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
      'Scan with the LeoVital mobile scanner or infirmary terminal to confirm valid issuance.',
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

  drawFooter(doc, 'Prescription ID', `RX-${prescription_id}`, issued_at);

  doc.end();
  return bufPromise;
}
