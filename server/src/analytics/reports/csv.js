// Renders the authorized analytics sections as CSV and escapes spreadsheet formula inputs.

import { workflowSections } from './sections.js';

// Escape CSV text and keep formula-like values literal in spreadsheet applications.
function cell(value) {
  if (typeof value === 'number') return String(value);
  const text = String(value ?? '');
  const literal = /^\s*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + literal.replaceAll('"', '""') + '"';
}

// Render available analytics sections into one UTF-8 CSV report.
export function renderCsv({ roles, topDiagnoses, deptBreakdown, inventory, surveillance, pharmacy }) {
  let csv = '\uFEFF';
  csv += 'PANGASINAN STATE UNIVERSITY - INFIRMARY HEALTH ANALYTICS REPORT\n';
  csv += `Exported On,${new Date().toLocaleString()}\n\n`;

  let section = 0;

  if (roles) {
    csv += `SECTION ${++section}: CAMPUS ROLES & USER HEADCOUNT\n`;
    csv += 'Role Designation,Active Users\n';
    // Append one role and its account count.
    roles.forEach((r) => {
      csv += `${cell(r.name)},${r.count}\n`;
    });
    csv += '\n';
  }

  if (topDiagnoses) {
    csv += `SECTION ${++section}: TOP CLINICAL DIAGNOSES\n`;
    csv += 'Diagnosis,Cases Recorded\n';
    // Append one diagnosis and its encounter count.
    topDiagnoses.forEach((d) => {
      csv += `${cell(d.diagnosis)},${d.count}\n`;
    });
    csv += '\n';
  }

  if (deptBreakdown) {
    csv += `SECTION ${++section}: CONSULTATION VOLUME BY DEPARTMENT / COURSE\n`;
    csv += 'Department / Course,Completed Consultations\n';
    // Append one department and its consultation count.
    deptBreakdown.forEach((d) => {
      csv += `${cell(d.department)},${d.count}\n`;
    });
    csv += '\n';
  }

  if (inventory) {
    csv += `SECTION ${++section}: PHARMACY INVENTORY & EXPIRY STATUS\n`;
    csv += 'Medicine Name,Batch Number,Stock on Hand,Expiry Date\n';
    // Append one inventory batch, including its quantity and expiry date.
    inventory.forEach((i) => {
      csv += `${cell(i.name)},${cell(i.batch_no)},${i.quantity_on_hand},"${new Date(i.expiry_date).toISOString().split('T')[0]}"\n`;
    });
    csv += '\n';
  }

  for (const { title, subtitle, columns, rows } of workflowSections({ surveillance, pharmacy })) {
    csv += `SECTION ${++section}: ${title.toUpperCase()}\n`;
    if (subtitle) csv += cell(subtitle) + '\n';
    csv += columns.map(cell).join(',') + '\n';
    for (const row of rows) csv += row.map(cell).join(',') + '\n';
    csv += '\n';
  }
  return csv;
}
