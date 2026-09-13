import React, { useState, useEffect } from 'react';

interface QrIntakeScannerProps {
  onPatientVerified: (patient: any, token: string) => void;
}

export default function QrIntakeScanner({ onPatientVerified }: QrIntakeScannerProps) {
  const [scannedToken, setScannedToken] = useState('');
  const [verifiedPatient, setVerifiedPatient] = useState<any>(null);
  const [scanStatus, setScanStatus] = useState('');

  // The core verification logic extracted so both manual and USB scans can use it
  const verifyToken = async (tokenToVerify: string) => {
    setScanStatus('Verifying token signature...');
    setVerifiedPatient(null);

    const jwt = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('http://localhost:5000/api/health-pass/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ qrToken: tokenToVerify.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.verified) {
        setVerifiedPatient(data.patient);
        setScannedToken(tokenToVerify.trim());
        onPatientVerified(data.patient, tokenToVerify.trim());
        setScanStatus('✅ Verification Successful: Patient identity and security signature valid.');
      } else {
        setScanStatus('❌ Verification Failed: ' + (data.error || 'Invalid Token'));
      }
    } catch (err: any) {
      setScanStatus('❌ Error: ' + err.message);
    }
  };

  // THE USB BARCODE SCANNER LISTENER
  useEffect(() => {
    let buffer = '';
    let timer: NodeJS.Timeout;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keystrokes if the nurse is actively typing inside an input/textarea
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return;
      }

      if (e.key === 'Enter') {
        if (buffer.length > 20) { // Valid QR tokens are long strings
          verifyToken(buffer);
        }
        buffer = '';
      } else if (e.key.length === 1) { // Only capture printable characters
        buffer += e.key;
        clearTimeout(timer);
        // Scanners type instantly. If typing pauses for more than 50ms, it's a human, so clear the buffer.
        timer = setTimeout(() => { buffer = ''; }, 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, []);

  return (
    <section style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
      <h3 style={{ marginTop: 0, color: '#0f766e' }}>1. QR Health Pass Scanner</h3>
      <p style={{ fontSize: 13, color: '#666' }}>
        <strong>Touchless Mode Active:</strong> Scan a physical QR code at any time.
      </p>
      
      {/* Manual Fallback */}
      <textarea
        rows={3}
        style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
        placeholder="Or paste QR string here manually..."
        value={scannedToken}
        onChange={(e) => setScannedToken(e.target.value)}
      />
      <button 
        onClick={() => verifyToken(scannedToken)} 
        style={{ marginTop: 10, padding: '8px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
      >
        Manual Verify
      </button>
      
      {scanStatus && <p style={{ fontSize: 13, marginTop: 12 }}><b>Status:</b> {scanStatus}</p>}

      {verifiedPatient && (
        <div style={{ marginTop: 12, padding: 12, background: '#f0fdfa', borderRadius: 6, fontSize: 14, borderLeft: '4px solid #0f766e' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#0f766e' }}>Verified Patient Identity:</h4>
          <p style={{ margin: '4px 0' }}><b>Name:</b> {verifiedPatient.first_name} {verifiedPatient.last_name}</p>
          <p style={{ margin: '4px 0' }}><b>Student No:</b> {verifiedPatient.student_no}</p>
          <p style={{ margin: '4px 0' }}><b>Course:</b> {verifiedPatient.course}</p>
          <p style={{ margin: '4px 0' }}><b>Blood Type:</b> {verifiedPatient.blood_type || 'N/A'}</p>
          <p style={{ margin: '4px 0' }}><b>Allergies:</b> <span style={{ color: 'red', fontWeight: 'bold' }}>{verifiedPatient.allergies || 'None'}</span></p>
        </div>
      )}
    </section>
  );
} 