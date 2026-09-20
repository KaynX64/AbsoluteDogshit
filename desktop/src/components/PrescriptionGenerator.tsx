import { useState } from 'react';

interface PrescriptionGeneratorProps {
  verifiedPatient: any;
  scannedToken: string;
}

export default function PrescriptionGenerator({ verifiedPatient, scannedToken }: PrescriptionGeneratorProps) {
  const [rxMedName, setRxMedName] = useState('Biogesic (Paracetamol)');
  const [rxDosage, setRxDosage] = useState('500mg');
  const [rxInstructions, setRxInstructions] = useState('Take 1 tablet every 4-6 hours as needed for fever.');
  const [rxQuantity, setRxQuantity] = useState('10');

  const handlePrintPrescription = async () => {
    if (!verifiedPatient) {
      alert('Please scan and verify a patient first!');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; }
            .header h1 { margin: 0; color: #0f766e; font-size: 20px; }
            .header p { margin: 4px 0 0 0; font-size: 13px; color: #666; }
            .patient-box { margin-top: 24px; padding: 12px; background: #f0fdfa; border-radius: 6px; }
            .rx-symbol { font-size: 48px; font-weight: bold; color: #0f766e; margin: 20px 0 10px 0; }
            .med-item { margin-bottom: 16px; padding-left: 10px; }
            .med-name { font-size: 16px; font-weight: bold; }
            .med-instructions { font-style: italic; color: #444; margin-top: 4px; }
            .footer { margin-top: 60px; border-top: 1px dashed #aaa; padding-top: 16px; display: flex; justify-content: space-between; }
            .signature-block { text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>PANGASINAN STATE UNIVERSITY INFIRMARY</h1>
            <p>Lingayen Campus Medical Services • Republic Act No. 10173 Compliant</p>
          </div>

          <div class="patient-box">
            <b>Patient Name:</b> ${verifiedPatient.first_name} ${verifiedPatient.last_name} &nbsp;|&nbsp;
            <b>Student No:</b> ${verifiedPatient.student_no || 'N/A'}<br/>
            <b>Course:</b> ${verifiedPatient.course || 'N/A'} &nbsp;|&nbsp;
            <b>Allergies:</b> <span style="color:red;">${verifiedPatient.allergies || 'None recorded'}</span>
          </div>

          <div class="rx-symbol">℞</div>

          <div class="med-item">
            <div class="med-name">${rxMedName} - ${rxDosage}</div>
            <div class="med-instructions">Sig: ${rxInstructions}</div>
            <div>Quantity Dispensed: <b>${rxQuantity} pcs</b></div>
          </div>

          <div class="footer">
            <div>
              <p><small>Issued: ${new Date().toLocaleString()}</small></p>
              <p><small>Tamper-Proof Verification Token: ${scannedToken.substring(0, 16)}...</small></p>
            </div>
            <div class="signature-block">
              <p>_____________________________________</p>
              <p><b>Attending Physician / Clinic Officer</b></p>
              <p>PRC License Verified</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (window.electronAPI?.printDocument) {
      const result = await window.electronAPI.printDocument({ htmlContent });
      if (!result.success && result.error) {
        alert('Print failed or was cancelled: ' + result.error);
      }
    } else {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(htmlContent);
        printWin.document.close();
        printWin.print();
      }
    }
  };

  return (
    <section style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
      <h3 style={{ marginTop: 0, color: '#0f766e' }}>2. Digital Prescription & Issuance</h3>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 13 }}>Medicine & Form:</label>
        <input style={{ width: '100%', padding: 6, marginTop: 2 }} value={rxMedName} onChange={(e) => setRxMedName(e.target.value)} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 13 }}>Dosage / Strength:</label>
        <input style={{ width: '100%', padding: 6, marginTop: 2 }} value={rxDosage} onChange={(e) => setRxDosage(e.target.value)} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 13 }}>Quantity (Tablets/Bottles):</label>
        <input style={{ width: '100%', padding: 6, marginTop: 2 }} value={rxQuantity} onChange={(e) => setRxQuantity(e.target.value)} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13 }}>Instructions (Sig):</label>
        <textarea style={{ width: '100%', padding: 6, marginTop: 2 }} rows={2} value={rxInstructions} onChange={(e) => setRxInstructions(e.target.value)} />
      </div>
      <button
        onClick={handlePrintPrescription}
        style={{ width: '100%', padding: 10, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
      >
        🖨️ Print Prescription (Preview / Save as PDF)
      </button>
      <small style={{ display: 'block', marginTop: 8, color: '#666', textAlign: 'center' }}>
        Works with standard OS Print Dialog. Select "Save as PDF" to test without physical printer.
      </small>
    </section>
  );
}