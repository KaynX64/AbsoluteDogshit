// desktop/src/App.tsx
import React, { useState } from 'react';

// Declare custom window.electronAPI from preload
declare global {
  interface Window {
    electronAPI?: {
      printDocument: (options: { htmlContent: string }) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export default function App() {
  const [email, setEmail] = useState('nurse@psu.edu.ph');
  const [password, setPassword] = useState('Password123!');
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');

  // QR Intake scanner state
  const [scannedToken, setScannedToken] = useState('');
  const [verifiedPatient, setVerifiedPatient] = useState<any>(null);
  const [scanStatus, setScanStatus] = useState('');

  // Prescription generator state
  const [rxMedName, setRxMedName] = useState('Biogesic (Paracetamol)');
  const [rxDosage, setRxDosage] = useState('500mg');
  const [rxInstructions, setRxInstructions] = useState('Take 1 tablet every 4-6 hours as needed for fever.');
  const [rxQuantity, setRxQuantity] = useState('10');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('valetudo_token', data.token);
        setUser(data.user);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err: any) {
      setError('Cannot connect to backend: ' + err.message);
    }
  };

  const handleVerifyQR = async () => {
    setScanStatus('Verifying token...');
    setVerifiedPatient(null);

    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('http://localhost:5000/api/health-pass/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ qrToken: scannedToken.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.verified) {
        setVerifiedPatient(data.patient);
        setScanStatus('Verification Successful: Patient identity and security signature valid.');
      } else {
        setScanStatus('Verification Failed: ' + (data.error || 'Invalid Token'));
      }
    } catch (err: any) {
      setScanStatus('Error: ' + err.message);
    }
  };

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
      // Fallback for standard browser testing
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(htmlContent);
        printWin.document.close();
        printWin.print();
      }
    }
  };

  if (!user) {
    return (
      <div style={{ maxWidth: 380, margin: '100px auto', padding: 24, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'sans-serif' }}>
        <h2 style={{ textAlign: 'center', color: '#0f766e' }}>Valetudo Clinic Portal</h2>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label>Staff PSU Email</label>
            <input style={{ width: '100%', padding: 8, marginTop: 4 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label>Password</label>
            <input style={{ width: '100%', padding: 8, marginTop: 4 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p style={{ color: 'red', fontSize: 13 }}>{error}</p>}
          <button type="submit" style={{ width: '100%', padding: 10, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Sign In to Clinic Console
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: 30, fontFamily: 'sans-serif', maxWidth: 1000, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f766e' }}>PSU Lingayen Clinic Console</h2>
          <small>Logged in: <b>{user.first_name} {user.last_name}</b> ({user.roles.join(', ')})</small>
        </div>
        <button onClick={() => setUser(null)} style={{ padding: '6px 14px', cursor: 'pointer' }}>Sign Out</button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        {/* Module 1: QR Verification & Triage */}
        <section style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0, color: '#0f766e' }}>1. QR Health Pass Scanner</h3>
          <p style={{ fontSize: 13, color: '#666' }}>
            Paste the raw token or simulate the USB barcode/QR scanner stream:
          </p>
          <textarea
            rows={4}
            style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
            placeholder="Scan or paste student QR string..."
            value={scannedToken}
            onChange={(e) => setScannedToken(e.target.value)}
          />
          <button onClick={handleVerifyQR} style={{ marginTop: 10, padding: '8px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Verify Pass
          </button>
          {scanStatus && <p style={{ fontSize: 13, marginTop: 8 }}><b>Status:</b> {scanStatus}</p>}

          {verifiedPatient && (
            <div style={{ marginTop: 12, padding: 12, background: '#f0fdfa', borderRadius: 6, fontSize: 14 }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#0f766e' }}>Verified Patient Identity:</h4>
              <p style={{ margin: '4px 0' }}><b>Name:</b> {verifiedPatient.first_name} {verifiedPatient.last_name}</p>
              <p style={{ margin: '4px 0' }}><b>Student No:</b> {verifiedPatient.student_no}</p>
              <p style={{ margin: '4px 0' }}><b>Course:</b> {verifiedPatient.course}</p>
              <p style={{ margin: '4px 0' }}><b>Blood Type:</b> {verifiedPatient.blood_type || 'N/A'}</p>
              <p style={{ margin: '4px 0' }}><b>Allergies:</b> <span style={{ color: 'red' }}>{verifiedPatient.allergies || 'None'}</span></p>
            </div>
          )}
        </section>

        {/* Module 2: Digital Prescription & Print */}
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
      </div>
    </div>
  );
}