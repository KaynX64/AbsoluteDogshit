// desktop/src/App.tsx
import React, { useState } from 'react';
import QrIntakeScanner from './components/QrIntakeScanner';
import PrescriptionGenerator from './components/PrescriptionGenerator';
import EmergencyAlertBanner from './components/EmergencyAlertBanner'; // Feature 4
import InventoryManager from './components/InventoryManager';         // Feature 9

export default function App() {
  const [email, setEmail] = useState('nurse@psu.edu.ph');
  const [password, setPassword] = useState('Password123!');
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');

  const [verifiedPatient, setVerifiedPatient] = useState<any>(null);
  const [scannedToken, setScannedToken] = useState('');

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
    <div style={{ padding: 30, fontFamily: 'sans-serif', maxWidth: 1050, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f766e' }}>PSU Lingayen Clinic Console</h2>
          <small>Logged in: <b>{user.first_name} {user.last_name}</b> ({user.roles.join(', ')})</small>
        </div>
        <button onClick={() => setUser(null)} style={{ padding: '6px 14px', cursor: 'pointer' }}>Sign Out</button>
      </header>

      {/* Feature 4: Real-time Emergency SOS Alert Banner */}
      <div style={{ marginTop: 20 }}>
        <EmergencyAlertBanner />
      </div>

      {/* Features 2 & 8: Clinic Triage & Prescription Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 10 }}>
        <QrIntakeScanner 
          onPatientVerified={(patient, token) => {
            setVerifiedPatient(patient);
            setScannedToken(token);
          }} 
        />
        <PrescriptionGenerator 
          verifiedPatient={verifiedPatient} 
          scannedToken={scannedToken} 
        />
      </div>

      {/* Feature 9: Medicine Inventory & Stock Deduction */}
      <div style={{ marginTop: 20 }}>
        <InventoryManager />
      </div>
    </div>
  );
}