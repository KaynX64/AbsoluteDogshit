// Shares PDF document setup, branding, layout primitives, and QR rendering across templates.

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// ─── Brand palette (mirrors the desktop theme) ────────────────────────────
export const BRAND_GREEN = '#1F4A34';
export const BRAND_SOFT  = '#E2EBE1';
export const TEXT_DARK   = '#191C1A';
export const TEXT_SUB    = '#5A635B';
export const TEXT_MUTED  = '#94A396';
export const BORDER      = '#DCE4DA';
export const DANGER      = '#7A2E26';

// ─── Low-level helpers ────────────────────────────────────────────────────

// Initialize an A4 PDF with the clinic's shared margins and metadata.
export function createDoc() {
  return new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Producer: 'LeoVital HealthLink',
      Creator: 'Pangasinan State University - Lingayen Infirmary',
    },
  });
}

// Collect PDFKit output into a promise that resolves to the complete buffer.
export function bufferFromDoc(doc) {
  // Register stream listeners that collect output and propagate rendering errors.
  return new Promise((resolve, reject) => {
    const chunks = [];
    // Append each PDF chunk to the output buffer's parts.
    doc.on('data', (c) => chunks.push(c));
    // Combine PDF chunks when rendering finishes.
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// Render QR text as a PNG in the shared document style.
export async function qrBuffer(text, size = 110) {
  return QRCode.toBuffer(text, {
    type: 'png',
    width: size,
    margin: 1,
    color: { dark: '#0F1E17', light: '#FFFFFF' },
  });
}

// Draw the university and infirmary letterhead and document subtitle.
export function drawLetterhead(doc, subtitle) {
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

// Draw a label and value side by side in a document information row.
export function drawInfoRow(doc, label, value) {
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

// Draw a styled section title and adjust vertical spacing.
export function drawSectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(BRAND_GREEN)
    .text(text, { characterSpacing: 0.8 });
  doc.moveDown(0.3);
}

// Draw the document reference, issue date, and verification footer.
export function drawFooter(doc, refLabel, refValue, issuedAt) {
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
