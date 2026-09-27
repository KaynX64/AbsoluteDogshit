// desktop/src/App.tsx
import React, { useEffect, useState } from 'react';
import NurseConsole from './components/NurseConsole';
import DoctorConsole from './components/DoctorConsole';
import AdminConsole from './components/AdminConsole';
import ResponderConsole from './components/ResponderConsole';
import { getOfflineQueue, replayOfflineQueue } from './services/offlineSync';

export function useSessionTimeout(isActive: boolean, timeoutMinutes = 480) {
  useEffect(() => {
    if (!isActive) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        localStorage.removeItem('valetudo_token');
        localStorage.removeItem('token');
        alert('🔒 Session expired due to 8 hours of inactivity (R.A. 10173 Compliance). Please log in again.');
        window.location.reload();
      }, timeoutMinutes * 60 * 1000);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isActive, timeoutMinutes]);
}

export default function App() {
  const [email, setEmail] = useState('nurse@psu.edu.ph');
  const [password, setPassword] = useState('Password123!');
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');

  // Allows switching perspectives if the account has multi-roles
  const [activeRoleView, setActiveRoleView] = useState<string>('');

  // Offline Sync & Connectivity States
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() => getOfflineQueue().length);
  const [isReplaying, setIsReplaying] = useState(false);

  // Change Password Modal States
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  // Activate the single 8-hour timeout for non-responders
  const isResponder =
    activeRoleView === 'EMERGENCY_RESPONDER' ||
    (user?.roles?.length === 1 && user.roles[0] === 'EMERGENCY_RESPONDER');
  useSessionTimeout(Boolean(user) && !isResponder, 480);

  useEffect(() => {
    const updateOnline = () => setIsOnline(true);
    const updateOffline = () => setIsOnline(false);
    const updateQueueCount = () => setOfflineQueueCount(getOfflineQueue().length);

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOffline);
    window.addEventListener('offline-queue-changed', updateQueueCount);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOffline);
      window.removeEventListener('offline-queue-changed', updateQueueCount);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('https://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        const userRoles: string[] = data.user.roles || [];
        const staffRoles = ['NURSE', 'DOCTOR', 'DENTIST', 'ADMIN', 'EMERGENCY_RESPONDER'];

        // GATEKEEPER: Prevent student-only accounts from logging into clinic desktop terminals
        const isAuthorizedStaff = userRoles.some((r) => staffRoles.includes(r));
        if (!isAuthorizedStaff) {
          setError('⛔ Access Denied: Student accounts are restricted to the Valetudo Mobile App.');
          return;
        }

        localStorage.setItem('valetudo_token', data.token);
        setUser(data.user);

        // Select the primary authorized staff role
        const defaultRole = userRoles.find((r) => staffRoles.includes(r)) || staffRoles[0];
        setActiveRoleView(defaultRole);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err: any) {
      setError('Cannot connect to backend: ' + err.message);
    }
  };

  const handleManualReplay = async () => {
    setIsReplaying(true);
    try {
      const result = await replayOfflineQueue();
      alert(`✅ Replay complete. Synced ${result.synced} offline mutations.`);
    } catch (err: any) {
      alert(`⚠️ Replay failed: ${err.message}`);
    } finally {
      setIsReplaying(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'New passwords do not match.', isError: true });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMsg({ text: 'New password must be at least 8 characters long.', isError: true });
      return;
    }

    setIsSubmittingPassword(true);
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch('https://localhost:5000/api/auth/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        setPasswordMsg({ text: '✅ ' + data.message, isError: false });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordMsg(null);
        }, 1500);
      } else {
        setPasswordMsg({ text: '❌ ' + (data.error || 'Failed to update password.'), isError: true });
      }
    } catch (err: any) {
      setPasswordMsg({ text: '❌ Network error: ' + err.message, isError: true });
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  // ---------------------------------------------------------------------------
  // LOGIN SCREEN
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

            {error && (
              <div
                style={{
                  color: '#dc2626',
                  fontSize: 12,
                  marginBottom: 14,
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                {error}
              </div>
            )}

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
              Sign In to Clinic Terminal
            </button>
          </form>

          {/* Quick preset buttons for testing clinical roles */}
          <div style={{ marginTop: 24, borderTop: '1px dashed #cbd5e1', paddingTop: 14 }}>
            <small style={{ color: '#64748b', display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Quick Select Staff Role:</small>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                type="button"
                onClick={() => { setEmail('nurse@psu.edu.ph'); setPassword('Password123!'); setError(''); }}
                style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 4, color: '#0f766e' }}
              >
                👩‍⚕️ Clinic Nurse
              </button>
              <button
                type="button"
                onClick={() => { setEmail('doctor@psu.edu.ph'); setPassword('Password123!'); setError(''); }}
                style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, color: '#0284c7' }}
              >
                🩺 Campus Doctor
              </button>
              <button
                type="button"
                onClick={() => { setEmail('admin@psu.edu.ph'); setPassword('Password123!'); setError(''); }}
                style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 4, color: '#6d28d9' }}
              >
                ⚙️ System Admin
              </button>
              <button
                type="button"
                onClick={() => { setEmail('responder@psu.edu.ph'); setPassword('Password123!'); setError(''); }}
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
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: '#0f766e' }}>Valetudo HealthLink Console</h2>
          <small style={{ color: '#475569' }}>
            Logged in: <b>{user.first_name} {user.last_name}</b> ({user.email}) &nbsp;|&nbsp; Active Interface: <b style={{ color: '#0f766e' }}>{activeRoleView}</b>
          </small>

          {/* Live Connectivity & Offline Replay Queue Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                fontWeight: 'bold',
                padding: '2px 8px',
                borderRadius: 12,
                background: isOnline ? '#dcfce7' : '#fee2e2',
                color: isOnline ? '#15803d' : '#b91c1c',
                border: `1px solid ${isOnline ? '#bbf7d0' : '#fecaca'}`,
              }}
            >
              <span style={{ fontSize: 8 }}>●</span> {isOnline ? 'Online (Connected)' : 'Offline Mode (Local Storage)'}
            </span>

            {offlineQueueCount > 0 && (
              <button
                type="button"
                onClick={handleManualReplay}
                disabled={isReplaying}
                style={{
                  fontSize: 11,
                  fontWeight: 'bold',
                  padding: '2px 10px',
                  borderRadius: 12,
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                  cursor: isReplaying ? 'not-allowed' : 'pointer',
                }}
              >
                {isReplaying ? '⏳ Syncing...' : `⏳ ${offlineQueueCount} Queued Offline Replays (Sync Now)`}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Switch view if user holds multiple roles */}
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

          {/* Password Change Button */}
          <button
            onClick={() => {
              setShowPasswordModal(true);
              setPasswordMsg(null);
            }}
            style={{
              padding: '6px 12px',
              background: '#f0fdfa',
              border: '1px solid #99f6e4',
              color: '#0f766e',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 12,
            }}
          >
            🔑 Change Password
          </button>

          <button
            onClick={() => setUser(null)}
            style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Render Role-Specific Interface */}
      {activeRoleView === 'NURSE' && <NurseConsole />}
      {(activeRoleView === 'DOCTOR' || activeRoleView === 'DENTIST') && <DoctorConsole />}
      {activeRoleView === 'ADMIN' && <AdminConsole />}
      {activeRoleView === 'EMERGENCY_RESPONDER' && <ResponderConsole />}

      {/* --------------------------------------------------------------------- */}
      {/* CHANGE PASSWORD MODAL DIALOG                                          */}
      {/* --------------------------------------------------------------------- */}
      {showPasswordModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: 380,
              background: '#ffffff',
              borderRadius: 8,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              border: '1px solid #cbd5e1',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: '#0f766e', fontSize: 16 }}>🔑 Update Account Password</h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChangePassword}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Current Password:</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', marginTop: 4, borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>New Password (min 8 chars):</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', marginTop: 4, borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Confirm New Password:</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', marginTop: 4, borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              {passwordMsg && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 5,
                    fontSize: 12,
                    fontWeight: 'bold',
                    marginBottom: 12,
                    background: passwordMsg.isError ? '#fef2f2' : '#f0fdf4',
                    color: passwordMsg.isError ? '#dc2626' : '#15803d',
                    border: `1px solid ${passwordMsg.isError ? '#fecaca' : '#bbf7d0'}`,
                  }}
                >
                  {passwordMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  style={{ flex: 1, padding: 10, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword}
                  style={{
                    flex: 1,
                    padding: 10,
                    background: isSubmittingPassword ? '#94a3b8' : '#0f766e',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 5,
                    cursor: isSubmittingPassword ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  {isSubmittingPassword ? 'Updating...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}