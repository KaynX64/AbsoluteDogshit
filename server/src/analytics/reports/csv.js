export function renderCsv({ roles, topDiagnoses, deptBreakdown, inventory }) {
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
  return csv;
}
