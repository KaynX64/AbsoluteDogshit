import React, { useState } from 'react';

interface QrIntakeScannerProps {
  onPatientVerified: (patient: any, token: string) => void;
}

export default function QrIntakeScanner({ onPatientVerified }: QrIntakeScannerProps) {
  const [scannedToken, setScannedToken] = useState('');
  const [verifiedPatient, setVerifiedPatient] = useState<any>(null);
  const [scanStatus, setScanStatus] = useState('');

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
        onPatientVerified(data.patient, scannedToken.trim());
        setScanStatus('Verification Successful: Patient identity and security signature valid.');
      } else {
        setScanStatus('Verification Failed: ' + (data.error || 'Invalid Token'));
      }
    } catch (err: any) {
      setScanStatus('Error: ' + err.message);
    }
  };

  return (
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
  );
}