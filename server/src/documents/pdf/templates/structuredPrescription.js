import { createDoc, bufferFromDoc, qrBuffer, drawLetterhead, BRAND_GREEN, BRAND_SOFT, BORDER, TEXT_DARK, TEXT_SUB } from '../renderer.js';
import { formatSignatory } from '../../signing/signatory.js';

const recorded = value => value == null || value === '' ? 'Not recorded' : String(value);
const printable = value => recorded(value).replace(/[\u2010-\u2015]/g, '-');

// One recorded representation is used by old and structured records; missing
// legacy data is never replaced with a clinical instruction.
export function prescriptionBlocks(item) {
  if (Number(item.contract_version) === 2) return [
    ['Helvetica-Bold', 10, `${item.medicine_name} - ${item.is_outside ? 'External pharmacy' : 'Clinic dispensing'}`],
    ['Helvetica', 9, `Strength: ${item.strength} | Form: ${item.form}`],
    ['Helvetica', 9, `Dose per administration: ${item.dosage} | Route: ${item.route}`],
    ['Helvetica', 9, `Schedule: ${item.frequency}`],
    ['Helvetica', 9, [item.duration_days ? `Course: ${item.duration_days} days` : '', item.review_on ? `Review on: ${item.review_on}` : ''].filter(Boolean).join(' | ')],
    ['Helvetica', 9, `Supply: ${item.quantity} ${item.quantity_unit}${item.pack_size ? ` (${item.pack_size})` : ''}`],
    ['Helvetica', 9, `Directions: ${item.directions}`],
  ];
  return [
    ['Helvetica-Bold', 10, `${recorded(item.medicine_name)}${item.is_outside ? ' - External pharmacy' : ''}`],
    ['Helvetica', 9, `Generic name: ${recorded(item.generic_name)} | Recorded dosage: ${recorded(item.dosage)}`],
    ['Helvetica', 9, `Frequency: ${recorded(item.frequency)} | Route: ${recorded(item.route)}`],
    ['Helvetica', 9, `Duration: ${recorded(item.duration_days)}${item.duration_days ? ' days' : ''} | Quantity: ${recorded(item.quantity_prescribed ?? item.quantity_dispensed)} (unit not recorded)`],
    ['Helvetica', 9, `Directions: ${recorded(item.instructions)}`],
  ];
}

export async function renderRecordedPrescription(rx) {
  const doc = createDoc();
  const result = bufferFromDoc(doc);
  const left = 60, width = doc.page.width - 120, bottom = 742;
  let page = 1;
  const patientName = `${rx.patient.first_name} ${rx.patient.last_name}`;
  const signer = formatSignatory(rx.doctor);
  const footer = () => {
    const y = doc.y;
    doc.font('Helvetica').fontSize(8).fillColor(TEXT_SUB)
      .text(`RX-${rx.prescription_id} | ${patientName} | Page ${page}`, left, 765, { width, lineBreak: false });
    doc.y = y;
  };
  const nextPage = () => {
    footer(); doc.addPage(); page++;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND_GREEN)
      .text(`Prescription RX-${rx.prescription_id} - continued`, left, 50, { width });
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_SUB).text(patientName, left, 68, { width });
    doc.y = 92;
  };
  const blockHeight = ([font, size, text]) => doc.font(font).fontSize(size).heightOfString(printable(text), { width: width - 20, lineGap: 2 }) + 5;
  const textBlock = (font, size, text) => {
    doc.font(font).fontSize(size).fillColor(TEXT_DARK).text(printable(text), left + 10, doc.y, { width: width - 20, lineGap: 2 });
    doc.y += 5;
  };
  const pagedBlock = (block, continuation) => {
    let text = printable(block[2]);
    while (text) {
      const available = bottom - doc.y;
      if (blockHeight([block[0], block[1], text]) <= available) { textBlock(block[0], block[1], text); break; }
      let low = 0, high = text.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (blockHeight([block[0], block[1], text.slice(0, mid)]) <= available) low = mid;
        else high = mid - 1;
      }
      if (low > 0) {
        const boundary = Math.max(text.lastIndexOf(' ', low - 1), text.lastIndexOf('\n', low - 1));
        const count = boundary > 0 ? boundary + 1 : low;
        textBlock(block[0], block[1], text.slice(0, count)); text = text.slice(count);
      }
      nextPage();
      if (continuation) textBlock('Helvetica-Bold', 9, continuation);
    }
  };
  drawLetterhead(doc, 'Lingayen Campus - Digital Prescription');
  const details = [
    ['Patient', patientName], ['Student / ID', rx.patient.student_no],
    ['Age / Sex', [rx.patient.age == null ? '' : `${rx.patient.age} years`, rx.patient.sex].filter(Boolean).join(' / ')],
    ['Allergies (recorded)', rx.patient.allergies], ['Prescriber', `${signer.name} | ${signer.designation} | PRC ${signer.license_no}`],
    ['Issued', new Date(rx.issued_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })],
    ['Prescription valid until', rx.expires_at],
  ];
  for (const [label, value] of details) pagedBlock(['Helvetica', 9, `${label}: ${recorded(value)}`]);
  doc.y += 6;
  for (const [index, item] of rx.items.entries()) {
    const blocks = prescriptionBlocks(item);
    const height = blocks.reduce((sum, block) => sum + blockHeight(block), blockHeight(['Helvetica-Bold', 9, `Medicine ${index + 1} of ${rx.items.length}`]) + 12);
    if (doc.y + height > bottom) nextPage();
    // Ordinary medication rows stay intact. An unusually long recorded item
    // continues by measured blocks, with its identity repeated on the next page.
    if (height <= bottom - 92) {
      doc.roundedRect(left, doc.y - 4, width, height, 5).fillAndStroke(BRAND_SOFT, BORDER);
    }
    textBlock('Helvetica-Bold', 9, `Medicine ${index + 1} of ${rx.items.length}`);
    for (const block of blocks) {
      if (doc.y + blockHeight(block) > bottom) {
        nextPage(); textBlock('Helvetica-Bold', 9, `Medicine ${index + 1} - ${item.medicine_name} (continued)`);
      }
      pagedBlock(block, `Medicine ${index + 1} - ${item.medicine_name} (continued)`);
    }
    doc.y += 12;
  }
  if (rx.notes?.trim()) {
    const note = ['Helvetica', 9, rx.notes.trim()];
    if (doc.y + blockHeight(note) + 24 > bottom) nextPage();
    textBlock('Helvetica-Bold', 10, Number(rx.contract_version) === 2 ? 'Patient advice' : 'Recorded prescription notes');
    pagedBlock(note, 'Patient advice (continued)');
  }
  if (doc.y + 218 > bottom) nextPage();
  const sealY = doc.y + 5;
  const qr = await qrBuffer(rx.verification_url, 330);
  doc.image(qr, left, sealY, { width: 110, height: 110 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND_GREEN).text('Prescription record verification', left + 125, sealY + 8, { width: width - 130 });
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_SUB).text('Scan to verify issuance and current status. External items are not dispensed by the infirmary.', left + 125, sealY + 26, { width: width - 130 });
  doc.font('Courier').fontSize(7).text(rx.qr_token || '', left + 125, sealY + 64, { width: width - 130 });
  const signatureY = sealY + 150;
  if (rx.doctor.signature_png) doc.image(rx.doctor.signature_png, doc.page.width - 240, signatureY - 38, { fit: [160, 36] });
  doc.moveTo(doc.page.width - 250, signatureY).lineTo(doc.page.width - 60, signatureY).strokeColor(TEXT_DARK).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_DARK).text(signer.name, doc.page.width - 250, signatureY + 5, { width: 190, align: 'center' });
  doc.font('Helvetica').fontSize(8).text(signer.caption, doc.page.width - 250, signatureY + 20, { width: 190, align: 'center' });
  footer(); doc.end(); return result;
}
