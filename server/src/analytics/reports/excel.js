import ExcelJS from 'exceljs';
import { workflowSections } from './sections.js';

export function renderExcel({ roles, topDiagnoses, deptBreakdown, inventory, surveillance, pharmacy }) {
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

  if (roles) {
    // Sheet 1: Headcount & Roles
    const sheetRoles = workbook.addWorksheet('Campus Headcount');
    sheetRoles.columns = [
      { header: 'Role Designation', key: 'name', width: 35 },
      { header: 'Active Accounts', key: 'count', width: 20 },
    ];
    sheetRoles.getRow(1).fill = headerFill;
    sheetRoles.getRow(1).font = headerFont;
    roles.forEach((r) => sheetRoles.addRow({ name: r.name, count: r.count }));
  }

  if (topDiagnoses) {
    // Sheet 2: Clinical Diagnoses

    const sheetDiag = workbook.addWorksheet('Clinical Diagnoses');
    sheetDiag.columns = [
      { header: 'Primary Diagnosis', key: 'diagnosis', width: 45 },
      { header: 'Encounter Cases', key: 'count', width: 20 },
    ];
    sheetDiag.getRow(1).fill = headerFill;
    sheetDiag.getRow(1).font = headerFont;
    topDiagnoses.forEach((d) => sheetDiag.addRow(d));
  }

  if (deptBreakdown) {
    // Sheet 3: Volume by Department
    const sheetDept = workbook.addWorksheet('Department Volume');
    sheetDept.columns = [
      { header: 'Department / Course', key: 'department', width: 40 },
      { header: 'Completed Consultations', key: 'count', width: 25 },
    ];
    sheetDept.getRow(1).fill = headerFill;
    sheetDept.getRow(1).font = headerFont;
    deptBreakdown.forEach((d) => sheetDept.addRow(d));
  }

  if (inventory) {
    // Sheet 4: Pharmacy Inventory
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
  }

  for (const { title, subtitle, columns, rows } of workflowSections({ surveillance, pharmacy })) {
    const sheet = workbook.addWorksheet(title);
    sheet.columns = columns.map((header, index) => ({ header, width: index === 0 ? 46 : 20 }));
    sheet.getRow(1).fill = headerFill;
    sheet.getRow(1).font = headerFont;
    for (const row of rows) sheet.addRow(row);
    if (subtitle) sheet.addRow([subtitle]);
  }
  return workbook;
}
