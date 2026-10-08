// desktop/src/App.tsx
import React, { useEffect, useState } from 'react';
import NurseConsole from './components/NurseConsole';
import DoctorConsole from './components/DoctorConsole';
import AdminConsole from './components/AdminConsole';
import ResponderConsole from './components/ResponderConsole';
import {
  getOfflineQueue,
  replayOfflineQueue,
  bootstrapOfflineCache,
  refreshOfflineQueueFromBackend,
} from './services/offlineSync';
import { API_BASE_URL } from './config/api';

/* ── Inline SVG icons ──────────────────────────────────────────── */
const I = {
  Users: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Shield: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  Activity: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Chart: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-6 3 4 4-7" />
    </svg>
  ),
  Database: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </svg>
  ),
  Stethoscope: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2v6a6 6 0 0 0 12 0V2" />
      <path d="M12 14v4a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4v-2" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  ),
  Calendar: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  History: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  Folder: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  Pill: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 20.5a7 7 0 0 1-9.9-9.9l6.4-6.4a7 7 0 0 1 9.9 9.9z" />
      <path d="M8.5 8.5l7 7" />
    </svg>
  ),
  Alert: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  Key: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6" />
      <path d="M15.5 7.5l3 3" />
    </svg>
  ),
  Logout: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  Help: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  ),
};

/* ================================================================= */
/* SESSION TIMEOUT HOOK                                               */
/* ================================================================= */
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

/* ================================================================= */
/* SIDEBAR — compact icon rail                                        */
/* ================================================================= */
interface SidebarProps {
  role: string;
  onSignOut: () => void;
  onChangePassword: () => void;
  activeItem?: string;
  onItemClick?: (key: string) => void;
}

function Sidebar({ role, onSignOut, onChangePassword, activeItem, onItemClick }: SidebarProps) {
  const navByRole: Record<string, { key: string; label: string; icon: React.ReactNode }[]> = {
    ADMIN: [
      { key: 'users',     label: 'Users',      icon: <I.Users /> },
      { key: 'audit',     label: 'Audit',      icon: <I.Shield /> },
      { key: 'telemetry', label: 'Health',     icon: <I.Activity /> },
      { key: 'analytics', label: 'Analytics',  icon: <I.Chart /> },
      { key: 'db',        label: 'Database',   icon: <I.Database /> },
    ],
    NURSE: [
      {
        key: 'triage',
        label: 'Triage',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        )
      },
      {
        key: 'expected',
        label: 'Expected',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <path d="M9 15l2 2 4-4" />
          </svg>
        )
      },
      {
        key: 'inventory',
        label: 'Inventory',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.5 20.5a7 7 0 0 1-9.9-9.9l6.4-6.4a7 7 0 0 1 9.9 9.9z" />
            <path d="M8.5 8.5l7 7" />
          </svg>
        )
      },
    ],
    DOCTOR: [
      { key: 'active',    label: 'Queue',     icon: <I.Stethoscope /> },
      { key: 'scheduled', label: 'Bookings',  icon: <I.Calendar /> },
      { key: 'history',   label: 'History',   icon: <I.History /> },
      { key: 'archive',   label: 'EMR',       icon: <I.Folder /> },
      { key: 'analytics', label: 'Analytics', icon: <I.Chart /> },
    ],
    DENTIST: [
      { key: 'active',    label: 'Queue',     icon: <I.Stethoscope /> },
      { key: 'scheduled', label: 'Bookings',  icon: <I.Calendar /> },
      { key: 'history',   label: 'History',   icon: <I.History /> },
      { key: 'archive',   label: 'EMR',       icon: <I.Folder /> },
      { key: 'analytics', label: 'Analytics', icon: <I.Chart /> },
    ],
    EMERGENCY_RESPONDER: [
      { key: 'dispatch', label: 'Dispatch', icon: <I.Alert /> },
    ],
  };

  const navItems = navByRole[role] ?? navByRole.ADMIN;

  return (
    <aside className="sb">
      <div className="sb-logo-block">
        <div className="sb-logo-lg">+</div>
      </div>

      <nav className="sb-nav">
        {navItems.map((item) => {
          const isActive = activeItem === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`sb-item${isActive ? ' is-active' : ''}`}
              onClick={() => onItemClick?.(item.key)}
              style={{ cursor: onItemClick ? 'pointer' : 'default' }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sb-spacer" />

      <div className="sb-links">
        <button
          type="button"
          className="sb-link"
          onClick={onChangePassword}
          title="Change password"
        >
          <I.Key />
        </button>
        <button
          type="button"
          className="sb-link"
          onClick={onSignOut}
          title="Sign out"
        >
          <I.Logout />
        </button>
      </div>
    </aside>
  );
}

/* ================================================================= */
/* TOP BAR — greeting header                                          */
/* ================================================================= */
interface TopBarProps {
  user: any;
  role: string;
  isOnline: boolean;
  offlineQueueCount: number;
  isReplaying: boolean;
  onManualReplay: () => void;
  roleView: string;
  roles: string[];
  onChangeRoleView: (v: string) => void;
}

function TopBar({
  user, role, isOnline, offlineQueueCount, isReplaying, onManualReplay,
  roleView, roles, onChangeRoleView,
}: TopBarProps) {
  const initials =
    `${(user.first_name?.[0] ?? '').toUpperCase()}${(user.last_name?.[0] ?? '').toUpperCase()}` || 'DA';

  // Dynamic greeting — computed on every render
  const hour = new Date().getHours();
  const greeting =
    hour >= 5 && hour < 12 ? 'Good morning'
    : hour >= 12 && hour < 18 ? 'Good afternoon'
    : 'Good evening';

  return (
    <header className="tb">
      <div className="tb-left">
        <div className="tb-eyebrow">Valetudo HealthLink Console</div>
        <h1 className="tb-greeting">{greeting}, {user.first_name}</h1>
      </div>

      <div className="tb-right">
        {roles.length > 1 && (
          <select
            className="tb-role-select"
            value={roleView}
            onChange={(e) => onChangeRoleView(e.target.value)}
          >
            {roles.map((r: string) => (
              <option key={r} value={r}>View as {r}</option>
            ))}
          </select>
        )}

        <span className={`tb-online ${isOnline ? 'is-on' : 'is-off'}`}>
          <span style={{ fontSize: 8 }}>●</span>
          {isOnline ? 'Online' : 'Offline'}
        </span>

        {offlineQueueCount > 0 && (
          <button
            type="button"
            className="tb-replay"
            onClick={onManualReplay}
            disabled={isReplaying}
          >
            {isReplaying ? '⏳ Syncing…' : `⏳ ${offlineQueueCount} queued`}
          </button>
        )}

        <span className="tb-role-pill">{role}</span>

        <div className="tb-user-chip">
          <div className="tb-avatar">{initials}</div>
          <div>
            <div className="tb-user-name">{user.first_name} {user.last_name}</div>
            <div className="tb-user-email">{user.email}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ================================================================= */
/* LOGIN SCREEN — two-panel split                                     */
/* ================================================================= */
interface LoginScreenProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
}

function LoginScreen({ email, setEmail, password, setPassword, error, onSubmit }: LoginScreenProps) {
  return (
    <div className="login-split">
      {/* LEFT — sage hero panel */}
      <div className="login-left">
        <div className="login-left-brand">
          <div className="login-left-logo">+</div>
          <div>
            <div className="login-left-brand-name">Valetudo</div>
            <div className="login-left-brand-sub">HealthLink</div>
          </div>
        </div>

        <div className="login-left-hero">
          <div className="login-left-eyebrow">PSU · Lingayen Campus</div>
          <h1 className="login-left-headline">
            Better care.<br />
            Thoughtful<br />
            administration.
          </h1>
          <p className="login-left-sub">
            A considered workspace for the people who keep our campus clinic running.
          </p>
          <div className="login-left-tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span>Secure access · Responsible health data stewardship</span>
          </div>
        </div>

        <div className="login-left-footer">
          <div className="login-left-footer-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}>
              <path d="M3 21h18" />
              <path d="M5 21V10l7-5 7 5v11" />
              <path d="M9 21v-6h6v6" />
            </svg>
          </div>
          <div>
            <div className="login-left-footer-name">Pangasinan State University</div>
            <div className="login-left-footer-sub">Lingayen Campus · University Infirmary</div>
          </div>
        </div>
      </div>

      {/* RIGHT — cream sign-in panel */}
      <div className="login-right">
        <div className="login-right-topbar">
          <span className="login-sample-pill">Sample design · Admin access</span>
        </div>

        <div className="login-right-body">
          <div className="login-right-eyebrow">Admin workspace</div>
          <h2 className="login-right-title">Valetudo Clinic Portal</h2>
          <p className="login-right-sub">
            Sign in with your institutional account to manage clinic systems and governance.
          </p>

          <form onSubmit={onSubmit}>
            <label className="field-label">Staff PSU email</label>
            <input
              type="email"
              className="field-input"
              placeholder="Enter your @psu.edu.ph email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ marginBottom: 18 }}
            />

            <label className="field-label">Password</label>
            <input
              type="password"
              className="field-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-submit">
              Sign in to clinic terminal
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </button>

            <p className="login-note">
              Authorized personnel only. Your role determines access.
              Sessions expire after 8 hours of inactivity to protect clinic information.
            </p>

            {import.meta.env.DEV && (
              <div className="dev-chips">
                <p className="dev-chips-label">Quick select test role (dev only)</p>
                <div className="dev-chip-grid">
                  <button type="button" className="dev-chip" onClick={() => { setEmail('nurse@psu.edu.ph'); setPassword('Password123!'); }}>
                    👩‍⚕️ Clinic Nurse
                  </button>
                  <button type="button" className="dev-chip" onClick={() => { setEmail('doctor@psu.edu.ph'); setPassword('Password123!'); }}>
                    🩺 Campus Doctor
                  </button>
                  <button type="button" className="dev-chip" onClick={() => { setEmail('admin@psu.edu.ph'); setPassword('Password123!'); }}>
                    ⚙️ System Admin
                  </button>
                  <button type="button" className="dev-chip" onClick={() => { setEmail('responder@psu.edu.ph'); setPassword('Password123!'); }}>
                    🚨 SOS Responder
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="login-right-footer">
          <strong>Need account assistance?</strong> Contact your campus administrator.<br />
          Valetudo HealthLink · R.A. 10173 Data Privacy Act
        </div>
      </div>
    </div>
  );
}

/* ================================================================= */
/* APP ROOT                                                           */
/* ================================================================= */
export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');
  const [activeRoleView, setActiveRoleView] = useState<string>('');

  /* ── Workspace state (driven by sidebar) ─────────────────────── */
  const [adminTab, setAdminTab] = useState<'users' | 'audit' | 'telemetry' | 'analytics' | 'db'>('users');
  const [doctorViewMode, setDoctorViewMode] = useState<
    'active' | 'scheduled' | 'history' | 'archive' | 'analytics'
  >('active');
  const [nurseViewMode, setNurseViewMode] = useState<'triage' | 'expected' | 'inventory'>('triage');

  /* ── Connectivity & offline queue ────────────────────────────── */
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() => getOfflineQueue().length);
  const [isReplaying, setIsReplaying] = useState(false);

  /* ── Change password modal ──────────────────────────────────── */
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

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

    // Sync the offline badge with the real SQLite queue on mount.
    // Falls back to localStorage silently when running outside Electron.
    refreshOfflineQueueFromBackend().catch(() => {});

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
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        const userRoles: string[] = data.user.roles || [];
        const staffRoles = ['NURSE', 'DOCTOR', 'DENTIST', 'ADMIN', 'EMERGENCY_RESPONDER'];

        const isAuthorizedStaff = userRoles.some((r) => staffRoles.includes(r));
        if (!isAuthorizedStaff) {
          setError('⛔ Access Denied: Student accounts are restricted to the Valetudo Mobile App.');
          return;
        }

        localStorage.setItem('valetudo_token', data.token);

        // Pull the offline SQLite bootstrap cache (patients + recent EMR)
        // in the background. Non-blocking; fails silently outside Electron.
        bootstrapOfflineCache().catch(() => {});

        setUser(data.user);

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
      const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  if (!user) {
    return (
      <LoginScreen
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        error={error}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        role={activeRoleView}
        onSignOut={() => setUser(null)}
        onChangePassword={() => { setShowPasswordModal(true); setPasswordMsg(null); }}
        activeItem={
          activeRoleView === 'ADMIN' ? adminTab
          : (activeRoleView === 'DOCTOR' || activeRoleView === 'DENTIST') ? doctorViewMode
          : activeRoleView === 'NURSE' ? nurseViewMode
          : undefined
        }
        onItemClick={
          activeRoleView === 'ADMIN'
            ? (key) => setAdminTab(key as typeof adminTab)
            : (activeRoleView === 'DOCTOR' || activeRoleView === 'DENTIST')
            ? (key) => setDoctorViewMode(key as typeof doctorViewMode)
            : activeRoleView === 'NURSE'
            ? (key) => setNurseViewMode(key as 'triage' | 'expected' | 'inventory')
            : undefined
        }
      />

      <div className="app-main">
        <TopBar
          user={user}
          role={activeRoleView}
          isOnline={isOnline}
          offlineQueueCount={offlineQueueCount}
          isReplaying={isReplaying}
          onManualReplay={handleManualReplay}
          roleView={activeRoleView}
          roles={user.roles}
          onChangeRoleView={setActiveRoleView}
        />

        <main className="app-content">
          {activeRoleView === 'NURSE' && (
            <NurseConsole
              viewMode={nurseViewMode}
              onViewModeChange={setNurseViewMode}
            />
          )}
          {(activeRoleView === 'DOCTOR' || activeRoleView === 'DENTIST') && (
            <DoctorConsole
              viewMode={doctorViewMode}
              onViewModeChange={setDoctorViewMode}
              currentRole={activeRoleView}
            />
          )}
          {activeRoleView === 'ADMIN' && (
            <AdminConsole activeTab={adminTab} onTabChange={setAdminTab} />
          )}
          {activeRoleView === 'EMERGENCY_RESPONDER' && <ResponderConsole />}
        </main>
      </div>

      {showPasswordModal && (
        <div className="modal-backdrop" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: 17, fontWeight: 800 }}>
                🔑 Update account password
              </h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-sub)' }}
              >✕</button>
            </div>

            <form onSubmit={handleChangePassword}>
              <label className="field-label">Current password</label>
              <input
                type="password"
                className="field-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                style={{ marginBottom: 14 }}
              />

              <label className="field-label">New password (min 8 chars)</label>
              <input
                type="password"
                className="field-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={{ marginBottom: 14 }}
              />

              <label className="field-label">Confirm new password</label>
              <input
                type="password"
                className="field-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />

              {passwordMsg && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '10px 14px',
                    borderRadius: 'var(--r-md)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: passwordMsg.isError ? 'var(--danger-soft)' : 'var(--success-soft)',
                    color: passwordMsg.isError ? 'var(--danger)' : 'var(--success)',
                    border: `1px solid ${passwordMsg.isError ? 'var(--danger-border)' : 'var(--success-border)'}`,
                  }}
                >
                  {passwordMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 'var(--r-pill)',
                    background: 'var(--sage-100)',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    color: 'var(--text)',
                    fontFamily: 'var(--font)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 'var(--r-pill)',
                    background: 'var(--primary)',
                    color: '#fff',
                    border: 'none',
                    cursor: isSubmittingPassword ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    fontFamily: 'var(--font)',
                    opacity: isSubmittingPassword ? 0.6 : 1,
                  }}
                >
                  {isSubmittingPassword ? 'Updating…' : 'Save password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}