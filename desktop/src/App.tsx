import React, { useState } from 'react';
import EmergencyAlertBanner from './components/EmergencyAlertBanner';
import NurseConsole from './components/NurseConsole';
import DoctorConsole from './components/DoctorConsole';
import AdminConsole from './components/AdminConsole';
import ResponderConsole from './components/ResponderConsole';

export default function App() {
  const [email, setEmail] = useState('nurse@psu.edu.ph');
  const [password, setPassword] = useState('Password123!');
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');

  // Allows switching perspectives if the account has multi-roles
  const [activeRoleView, setActiveRoleView] = useState<string>('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('valetudo_token', data.token);
        setUser(data.user);
        setActiveRoleView(data.user.roles[0] || 'NURSE');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err: any) {
      setError('Cannot connect to backend: ' + err.message);
    }
  };

  // ---------------------------------------------------------------------------
  // LOGIN SCREEN (Fixed input styling to allow typing in Electron)
  // ---------------------------------------------------------------------------
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div
          style={{
            width: 400,
            padding: 32,
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            fontFamily: 'sans-serif',
          }}
        >
          <h2 style={{ textAlign: 'center', color: '#0f766e', margin: '0 0 6px 0' }}>Valetudo Clinic Portal</h2>
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13, marginBottom: 20 }}>
            Pangasinan State University • Lingayen Campus
          </p>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14, textAlign: 'left' }}>
              <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155' }}>Staff PSU Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  fontSize: 14,
                  marginTop: 6,
                  color: '#111827',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 16, textAlign: 'left' }}>
              <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  fontSize: 14,
                  marginTop: 6,
                  color: '#111827',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  outline: 'none',
                }}
              />
            </div>

            {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '12px',
                background: '#0f766e',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Sign In
            </button>
          </form>

          {/* Quick preset buttons for testing each role */}
          <div style={{ marginTop: 24, borderTop: '1px dashed #cbd5e1', paddingTop: 14 }}>
            <small style={{ color: '#64748b', display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Quick Select Test Role:</small>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                type="button"
                onClick={() => { setEmail('nurse@psu.edu.ph'); setPassword('Password123!'); }}
                style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 4, color: '#0f766e' }}
              >
                👩‍⚕️ Clinic Nurse
              </button>
              <button
                type="button"
                onClick={() => { setEmail('doctor@psu.edu.ph'); setPassword('Password123!'); }}
                style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, color: '#0284c7' }}
              >
                🩺 Campus Doctor
              </button>
              <button
                type="button"
                onClick={() => { setEmail('admin@psu.edu.ph'); setPassword('Password123!'); }}
                style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 4, color: '#6d28d9' }}
              >
                ⚙️ System Admin
              </button>
              <button
                type="button"
                onClick={() => { setEmail('responder@psu.edu.ph'); setPassword('Password123!'); }}
                style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, color: '#b91c1c' }}
              >
                🚨 SOS Responder
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ROLE-BASED CONSOLE ROUTING
  // ---------------------------------------------------------------------------
  return (
    // To a fully fluid, dynamically scalable container:
<div style={{ padding: 'clamp(14px, 2vw, 28px)', fontFamily: 'sans-serif', width: '100%', boxSizing: 'border-box', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Top Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: '#0f766e' }}>Valetudo HealthLink Console</h2>
          <small style={{ color: '#475569' }}>
            Logged in: <b>{user.first_name} {user.last_name}</b> ({user.email}) &nbsp;|&nbsp; Active Interface: <b style={{ color: '#0f766e' }}>{activeRoleView}</b>
          </small>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Switch view if user holds multiple roles or wants to preview */}
          {user.roles.length > 1 && (
            <select
              value={activeRoleView}
              onChange={(e) => setActiveRoleView(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13 }}
            >
              {user.roles.map((r: string) => (
                <option key={r} value={r}>View as {r}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setUser(null)}
            style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Real-time Emergency SOS Alert Banner is visible across all campus staff */}
      <div style={{ marginBottom: 16 }}>
        <EmergencyAlertBanner />
      </div>

      {/* Render Role-Specific Interface according to Architectural Design */}
      {activeRoleView === 'NURSE' && <NurseConsole />}
      {(activeRoleView === 'DOCTOR' || activeRoleView === 'DENTIST') && <DoctorConsole />}
      {activeRoleView === 'ADMIN' && <AdminConsole />}
      {activeRoleView === 'EMERGENCY_RESPONDER' && <ResponderConsole />}
    </div>
  );
}