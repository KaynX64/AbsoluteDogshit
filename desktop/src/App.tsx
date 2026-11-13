// desktop/src/App.tsx
import React, { useEffect, useState } from 'react';
import NurseConsole from './components/NurseConsole';
import DoctorConsole from './components/DoctorConsole';
import AdminConsole from './components/AdminConsole';
import type { AdminTab } from './components/AdminConsole';
import ResponderConsole from './components/ResponderConsole';
import { useBookingBadge } from './hooks/useBookingBadge';
import { DesktopSocketContext, useDesktopSocketSession } from './services/desktopRealtime';
import {
  getOfflineQueue,
  replayOfflineQueue,
  bootstrapOfflineCache,
  refreshOfflineQueueFromBackend,
} from './services/offlineSync';
import { API_BASE_URL } from './config/api';
import PasswordStrengthIndicator, { evaluatePassword } from './components/PasswordStrengthIndicator';
import { T, btnPrimary, btnSubtle } from './theme';
import { ThemeProvider, applyThemeFromAccount, resetThemeAfterLogout, useTheme } from './theme/ThemeProvider';
import Icon from './components/Icon';
import IncidentReportModal from './components/IncidentReportModal';
import SettingsMenu from './components/SettingsMenu';
import ThemedLogo from './components/ThemedLogo';


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
        alert('Session expired due to 8 hours of inactivity (R.A. 10173 Compliance). Please log in again.');
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
  badgeCounts?: Record<string, number>;
  showIncidentRecords: boolean;
}

function Sidebar({ role, onSignOut, onChangePassword, activeItem, onItemClick, badgeCounts, showIncidentRecords }: SidebarProps) {
  // Each item now uses Material Symbols ligatures for clean, consistent icons.
  const navByRole: Record<string, { key: string; label: string; icon: string }[]> = {
    ADMIN: [
      { key: 'users',     label: 'Users & roles',    icon: 'manage_accounts' },
      { key: 'audit',     label: 'Privacy & audit',  icon: 'shield_lock' },
      { key: 'telemetry', label: 'System health',    icon: 'dns' },
      { key: 'serverPolicy', label: 'Server Policy', icon: 'tune' },
      { key: 'analytics', label: 'Health analytics', icon: 'monitoring' },
      { key: 'incidents', label: 'Incident Records', icon: 'assignment' },
      { key: 'db',        label: 'Database Studio',  icon: 'database' },
    ],
    NURSE: [
      { key: 'triage',    label: 'Triage',           icon: 'local_hospital' },
      { key: 'expected',  label: 'Expected',         icon: 'monitor_heart' },
      { key: 'inventory', label: 'Inventory',        icon: 'medication' },
      { key: 'analytics', label: 'Analytics',        icon: 'monitoring' },
    ],
    DOCTOR: [
      { key: 'active',    label: 'Queue',            icon: 'stethoscope' },
      { key: 'scheduled', label: 'Bookings',         icon: 'event' },
      { key: 'history',   label: 'History',          icon: 'history' },
      { key: 'archive',   label: 'EMR',              icon: 'folder_shared' },
      { key: 'analytics', label: 'Analytics',        icon: 'monitoring' },
    ],
    DENTIST: [
      { key: 'active',    label: 'Queue',            icon: 'stethoscope' },
      { key: 'scheduled', label: 'Bookings',         icon: 'event' },
      { key: 'history',   label: 'History',          icon: 'history' },
      { key: 'archive',   label: 'EMR',              icon: 'folder_shared' },
      { key: 'analytics', label: 'Analytics',        icon: 'monitoring' },
    ],
    EMERGENCY_RESPONDER: [
      { key: 'dispatch',  label: 'Dispatch',         icon: 'emergency' },
    ],
  };

  const navItems = (navByRole[role] ?? navByRole.ADMIN).filter(item => item.key !== 'incidents' || showIncidentRecords);

  return (
    <aside className="sb">
      <div className="sb-logo-block">
        <div className="sb-logo-lg">
          <ThemedLogo alt="LeoVital HealthLink" />
        </div>
        <div className="sb-brand-text">
          <span className="sb-brand-name">LeoVital</span>
          <span className="sb-brand-sub">HealthLink</span>
        </div>
      </div>
      <nav className="sb-nav">
        {navItems.map((item) => {
          const isActive = activeItem === item.key;
          const badge = badgeCounts?.[item.key] ?? 0;
          return (
            <button
              key={item.key}
              type="button"
              className={`sb-item${isActive ? ' is-active' : ''}`}
              onClick={() => onItemClick?.(item.key)}
              style={{ cursor: onItemClick ? 'pointer' : 'default', position: 'relative' }}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
              {badge > 0 && (
                <span className="sb-badge">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sb-spacer" />

      <div className="sb-links">
        {/* Dedicated settings menu (bottom-left) — theme mode & presets,
            reset password, and per-account persistence state. */}
        <SettingsMenu onResetPassword={onChangePassword} />
        <button
          type="button"
          className="sb-link"
          onClick={onSignOut}
          title="Sign out"
        >
          <Icon name="logout" size={20} />
          <span>Sign out</span>
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

  // Format current time in PHT for the sync-status pill
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Shanghai',
  });

  return (
    <header className="tb">
      <div className="tb-left">
        <div className="tb-eyebrow">LeoVital HealthLink Console</div>
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
          {isOnline ? `Connected · ${timeStr}` : 'Offline'}
        </span>

        {offlineQueueCount > 0 && (
          <button
            type="button"
            className="tb-replay"
            onClick={onManualReplay}
            disabled={isReplaying}
          >
            {isReplaying ? 'Syncing…' : `${offlineQueueCount} queued`}
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
/* LOGIN SCREEN — clinic terminal                                     */
/* ================================================================= */
interface LoginScreenProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
}

const DEV_ACCOUNTS = [
  { email: 'nurse@psu.edu.ph',     label: 'Clinic nurse',   icon: 'medical_information' },
  { email: 'doctor@psu.edu.ph',    label: 'Campus doctor',  icon: 'medical_services' },
  { email: 'dentist@psu.edu.ph',   label: 'Campus dentist', icon: 'dentistry' },
  { email: 'admin@psu.edu.ph',     label: 'System admin',   icon: 'admin_panel_settings' },
  { email: 'responder@psu.edu.ph', label: 'SOS responder',  icon: 'emergency' },
];

function LoginScreen({ email, setEmail, password, setPassword, error, onSubmit }: LoginScreenProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const errorId = 'login-error';
  const emailId = 'login-email';
  const passwordId = 'login-password';

  const handleLoginCardPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const bounds = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--login-pointer-x', `${e.clientX - bounds.left}px`);
    e.currentTarget.style.setProperty('--login-pointer-y', `${e.clientY - bounds.top}px`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(e);
    } finally {
      // The screen unmounts on success; this only matters for failed attempts.
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      {/* LEFT — context rail (brand, what the workspace covers, campus identity) */}
      <aside className="login-aside">
        <div className="login-aside-atmosphere" aria-hidden="true">
          <svg
            className="login-aside-art"
            viewBox="0 0 460 620"
            preserveAspectRatio="xMidYMax slice"
            focusable="false"
          >
            <defs>
              <linearGradient id="login-wave-a" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--primary-tint)' }} stopOpacity="0.2" />
                <stop offset="100%" style={{ stopColor: 'var(--primary-tint)' }} stopOpacity="0" />
              </linearGradient>
              <linearGradient id="login-wave-b" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--primary-tint)' }} stopOpacity="0.14" />
                <stop offset="100%" style={{ stopColor: 'var(--primary-tint)' }} stopOpacity="0" />
              </linearGradient>
              <radialGradient id="login-halo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style={{ stopColor: 'var(--primary-tint)' }} stopOpacity="0.3" />
                <stop offset="70%" style={{ stopColor: 'var(--primary-tint)' }} stopOpacity="0.08" />
                <stop offset="100%" style={{ stopColor: 'var(--primary-tint)' }} stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="96" cy="470" r="190" fill="url(#login-halo)" />
            <circle cx="96" cy="470" r="118" fill="none" style={{ stroke: 'var(--primary-tint)' }} strokeOpacity="0.24" />
            <circle cx="96" cy="470" r="166" fill="none" style={{ stroke: 'var(--primary-tint)' }} strokeOpacity="0.15" />
            <circle cx="96" cy="470" r="214" fill="none" style={{ stroke: 'var(--primary-tint)' }} strokeOpacity="0.09" />
            <circle cx="402" cy="120" r="96" fill="url(#login-halo)" />
            <path
              d="M0 470 C 70 436 132 502 208 476 C 292 448 356 494 460 452 L460 620 L0 620 Z"
              fill="url(#login-wave-a)"
            />
            <path
              d="M0 520 C 86 492 150 556 236 528 C 320 500 384 546 460 512 L460 620 L0 620 Z"
              fill="url(#login-wave-b)"
            />
          </svg>
        </div>

        <div className="login-aside-brand">
          <span className="login-aside-mark">
            <ThemedLogo />
          </span>
          <span className="login-aside-wordmark">
            <span className="login-aside-name">LeoVital</span>
            <span className="login-aside-sub">HealthLink</span>
          </span>
        </div>

        <div className="login-aside-copy">
          <p className="login-aside-eyebrow">University Infirmary · Lingayen</p>
          <p className="login-aside-title">One calm place for campus care.</p>
          <p className="login-aside-text">
            Triage, records and emergency response — for the people who keep the clinic running.
          </p>

          <ul className="login-aside-list">
            <li>
              <Icon name="event_available" size={18} tone="inherit" />
              <span>
                <strong>Appointments &amp; queue</strong>
                Daily triage, bookings and patient flow
              </span>
            </li>
            <li>
              <Icon name="folder_shared" size={18} tone="inherit" />
              <span>
                <strong>Electronic medical records</strong>
                Consults, prescriptions and dental charts
              </span>
            </li>
            <li>
              <Icon name="emergency" size={18} tone="inherit" />
              <span>
                <strong>Emergency response</strong>
                Campus SOS alerts with responder dispatch
              </span>
            </li>
          </ul>
        </div>

        <div className="login-aside-foot">
          <Icon name="apartment" size={20} tone="inherit" />
          <span>
            <strong>Pangasinan State University</strong>
            <span>Lingayen Campus · University Infirmary</span>
          </span>
        </div>
      </aside>

      {/* RIGHT — sign-in card */}
      <main className="login-main">
        {/* Ambient art so the canvas around the card never reads as empty space. */}
        <div className="login-main-art" aria-hidden="true">
          <svg
            className="login-main-art-svg"
            viewBox="0 0 900 900"
            preserveAspectRatio="xMidYMid slice"
            focusable="false"
          >
            <circle cx="812" cy="790" r="330" fill="none" style={{ stroke: 'var(--primary)' }} strokeOpacity="0.09" />
            <circle cx="812" cy="790" r="252" fill="none" style={{ stroke: 'var(--primary)' }} strokeOpacity="0.08" />
            <circle cx="812" cy="790" r="174" fill="none" style={{ stroke: 'var(--primary)' }} strokeOpacity="0.075" />
            <circle cx="812" cy="790" r="96" style={{ fill: 'var(--primary)' }} fillOpacity="0.05" />
            <circle cx="96" cy="110" r="210" fill="none" style={{ stroke: 'var(--primary)' }} strokeOpacity="0.075" />
            <circle cx="96" cy="110" r="140" fill="none" style={{ stroke: 'var(--primary)' }} strokeOpacity="0.06" />
            <path
              className="login-main-wave login-main-wave--one"
              d="M-40 700 C 130 640 250 760 400 720 C 560 676 690 780 940 716 L940 940 L-40 940 Z"
              style={{ fill: 'var(--primary)' }}
              fillOpacity="0.058"
            />
            <path
              className="login-main-wave login-main-wave--two"
              d="M-40 790 C 140 742 270 848 430 806 C 590 764 720 856 940 800 L940 940 L-40 940 Z"
              style={{ fill: 'var(--primary)' }}
              fillOpacity="0.05"
            />
          </svg>
          <ThemedLogo className="login-main-watermark" />
        </div>

        <div className="login-main-top">
          <span className="login-status">
            <span className="login-status-dot" aria-hidden="true" />
            Encrypted session · TLS
          </span>
        </div>

        <div className="login-main-body">
          <section
            className="login-card"
            aria-labelledby="login-title"
            onPointerMove={handleLoginCardPointerMove}
          >
            <div className="login-card-smoke" aria-hidden="true" />
            <p className="login-eyebrow">Staff sign-in</p>
            <h1 id="login-title" className="login-title">Clinic workspace</h1>
            <p className="login-sub">
              Sign in with your institutional account. Your role decides which workspace opens.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="login-field">
                <label className="login-label" htmlFor={emailId}>Institutional email</label>
                <input
                  id={emailId}
                  type="email"
                  className="login-input"
                  placeholder="you@psu.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  required
                  aria-describedby={error ? errorId : undefined}
                />
              </div>

              <div className="login-field">
                <div className="login-label-row">
                  <label className="login-label" htmlFor={passwordId}>Password</label>
                  <span className="login-hint">Forgot? Ask your administrator</span>
                </div>
                <div className="login-input-wrap">
                  <input
                    id={passwordId}
                    type={revealPassword ? 'text' : 'password'}
                    className="login-input login-input--password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                    onBlur={() => setCapsLock(false)}
                    autoComplete="current-password"
                    required
                    aria-describedby={error ? errorId : undefined}
                  />
                  <button
                    type="button"
                    className="login-reveal"
                    onClick={() => setRevealPassword((v) => !v)}
                    aria-pressed={revealPassword}
                  >
                    {revealPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {capsLock && (
                  <p className="login-caps">
                    <Icon name="keyboard_capslock" size={14} tone="warning" />
                    Caps Lock is on
                  </p>
                )}
              </div>

              {error && (
                <p className="login-error" id={errorId} role="alert">
                  <Icon name="error" size={16} tone="inherit" />
                  <span>{error}</span>
                </p>
              )}

              <button type="submit" className="login-submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="login-spinner" aria-hidden="true" />
                    Verifying…
                  </>
                ) : (
                  <>
                    Sign in to clinic terminal
                    <Icon name="arrow_right_alt" size={18} tone="inherit" />
                  </>
                )}
              </button>

              <p className="login-privacy">
                <Icon name="lock" size={15} tone="inherit" />
                <span>
                  Clinic staff only. Sessions end after 8 hours of inactivity, and patient
                  data is handled under R.A. 10173.
                </span>
              </p>
            </form>
          </section>

          {import.meta.env.DEV && (
            <div className="login-dev">
              <p className="login-dev-label">Dev quick sign-in</p>
              <div className="login-dev-grid">
                {DEV_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    className="login-dev-chip"
                    onClick={() => { setEmail(account.email); setPassword('Password123!'); }}
                  >
                    <Icon name={account.icon} size={15} tone="inherit" />
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="login-main-foot">
          <p><strong>Need account help?</strong> Contact your campus administrator.</p>
          <p>LeoVital HealthLink · R.A. 10173 Data Privacy Act</p>
        </div>
      </main>
    </div>
  );
}

/* ================================================================= */
/* APP ROOT                                                           */
/* ================================================================= */

/**
 * Shell — everything below ThemeProvider. Consuming useTheme() here
 * re-renders the whole tree on theme changes, which re-resolves every
 * live `T.*` token used by the consoles. (Non-consuming subtrees would
 * otherwise bail out of re-render and keep stale inline colors.)
 */
function AppShell() {
  const { mode, preset } = useTheme();
  const [updateStatus, setUpdateStatus] = useState<{ state: string; version?: string; percent?: number } | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');
  const [activeRoleView, setActiveRoleView] = useState<string>('');

  /* ── Workspace state (driven by sidebar) ─────────────────────── */
  const [adminTab, setAdminTab] = useState<AdminTab>('users');
  const [showIncidentRecords, setShowIncidentRecords] = useState(false);
  const [doctorViewMode, setDoctorViewMode] = useState<
    'active' | 'scheduled' | 'history' | 'archive' | 'analytics'
  >('active');
  const [nurseViewMode, setNurseViewMode] = useState<'triage' | 'expected' | 'inventory' | 'analytics'>('triage');

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

  // ── Session Logout & Token Invalidation ───────────────────────
  const handleSignOut = async () => {
    const token = localStorage.getItem('valetudo_token');
    localStorage.removeItem('valetudo_token');
    localStorage.removeItem('token');
    resetThemeAfterLogout();

    // Purge cached credentials and role state from React memory
    setPassword('');
    setEmail('');
    setActiveRoleView('');
    setUser(null);
    setAdminTab('users');
    setShowIncidentRecords(false);
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (_) {}
    }
  };

  const isResponder =
    activeRoleView === 'EMERGENCY_RESPONDER' ||
    (user?.roles?.length === 1 && user.roles[0] === 'EMERGENCY_RESPONDER');
  useSessionTimeout(Boolean(user) && !isResponder, 480);

  const desktopSocket = useDesktopSocketSession(user ? localStorage.getItem('valetudo_token') : null);
  const bookingBadge = useBookingBadge(activeRoleView, Boolean(user), desktopSocket);
  const badgeKey =
    activeRoleView === 'NURSE' ? 'expected'
    : (activeRoleView === 'DOCTOR' || activeRoleView === 'DENTIST') ? 'scheduled'
    : null;

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
          setError('Access Denied: Unauthorized Access');
          return;
        }

        localStorage.setItem('valetudo_token', data.token);

        // Per-account theme: apply the preference stored on the account
        // (validated inside) so the workspace opens in the user's theme.
        applyThemeFromAccount(data.user);

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
      alert(`Replay complete. Synced ${result.synced} offline mutations.`);
    } catch (err: any) {
      alert(`Replay failed: ${err.message}`);
    } finally {
      setIsReplaying(false);
    }
  };

const handleChangePassword = async (e: React.FormEvent) => {
  e.preventDefault();
  setPasswordMsg(null);

  // ── Strong-password policy check (mirrors the server) ─────────
  const evaluation = evaluatePassword(newPassword);
  if (!evaluation.isAcceptable) {
    setPasswordMsg({
      text:
        evaluation.score < 2
          ? 'Password is too weak. Please reach at least "Medium" strength before continuing.'
          : 'Password is missing one or more required elements. Check the requirements list.',
      isError: true,
    });
    return;
  }

  if (newPassword !== confirmPassword) {
    setPasswordMsg({ text: 'New passwords do not match.', isError: true });
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
      setPasswordMsg({ text: data.message, isError: false });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordMsg(null);
      }, 1500);
    } else {
      // Server may reject with a detailed issues array — surface it
      const detailed =
        Array.isArray(data.issues) && data.issues.length > 0
          ? data.issues.join(' ')
          : data.error || 'Failed to update password.';
      setPasswordMsg({ text: detailed, isError: true });
    }
  } catch (err: any) {
    setPasswordMsg({ text: 'Network error: ' + err.message, isError: true });
  } finally {
    setIsSubmittingPassword(false);
  }
};

  useEffect(() => {
  const api = window.electronAPI;
  if (!api?.onUpdateStatus) return;
  return api.onUpdateStatus((s) => setUpdateStatus(s));

}, []);
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
    <DesktopSocketContext.Provider value={desktopSocket}>
    <div className="app-shell" data-theme-mode={mode} data-theme-preset={preset}>
      <Sidebar
        role={activeRoleView}
        showIncidentRecords={showIncidentRecords}
        badgeCounts={badgeKey ? { [badgeKey]: bookingBadge } : undefined}
        onSignOut={handleSignOut}
        onChangePassword={() => { setShowPasswordModal(true); setPasswordMsg(null); }}
        activeItem={
          activeRoleView === 'ADMIN' ? (adminTab === 'archived' ? 'users' : adminTab)
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
            ? (key) => setNurseViewMode(key as typeof nurseViewMode)
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

        {updateStatus && !updateDismissed &&
  (updateStatus.state === 'downloading' || updateStatus.state === 'downloaded') && (
  <div className="update-banner">
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Icon
        name={updateStatus.state === 'downloading' ? 'download' : 'cloud_done'}
        size={18}
        tone={updateStatus.state === 'downloading' ? 'info' : 'success'}
      />
      {updateStatus.state === 'downloading'
        ? `Downloading update… ${updateStatus.percent ?? 0}%`
        : `Update ${updateStatus.version ?? ''} is ready to install.`}
    </span>

    {updateStatus.state === 'downloaded' && (
      <span style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="update-btn update-btn-later"
          onClick={() => setUpdateDismissed(true)}
        >
          Later
        </button>
        <button
          type="button"
          className="update-btn update-btn-install"
          onClick={() => {
            if (offlineQueueCount > 0 &&
                !window.confirm(`${offlineQueueCount} offline changes are still queued. Restart anyway? They stay saved locally and sync after restart.`)) return;
            window.electronAPI?.installUpdate();
          }}
        >
          Restart now
        </button>
      </span>
    )}
  </div>
)}

        <main
          className="app-content"
          style={activeRoleView === 'NURSE' && nurseViewMode === 'inventory'
            ? { padding: 0, display: 'flex', minHeight: 0, overflow: 'hidden' }
            : undefined}
        >
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
            <AdminConsole activeTab={adminTab} onTabChange={setAdminTab} onIncidentAccessChange={setShowIncidentRecords} />
          )}
          {activeRoleView === 'EMERGENCY_RESPONDER' && <ResponderConsole />}
        </main>
      </div>

      {/* Post-resolution incident documentation popup. Server-driven: it
          only appears for accounts in the live responder audience, on any
          console view, whenever ANY responder closes an SOS as resolved. */}
      <IncidentReportModal />

      {showPasswordModal && (
        <div className="modal-backdrop" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, color: T.primary, fontSize: 17, fontWeight: 800, letterSpacing: -0.3, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="key" size={20} tone="primary" />
                Update account password
              </h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: T.textSub,
                  width: 32,
                  height: 32,
                  borderRadius: T.radius.sm,
                  transition: `background ${T.durBase} ${T.ease}`,
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.sage100)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                aria-label="Close"
              ><Icon name="close" size={20} /></button>
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

              <label className="field-label">New password</label>
              <input
                type="password"
                className="field-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={{ marginBottom: 4 }}
              />
              <PasswordStrengthIndicator password={newPassword} />
              <div style={{ marginBottom: 14 }} />

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
                    borderRadius: T.radius.md,
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: passwordMsg.isError ? T.dangerSoft : T.successSoft,
                    color: passwordMsg.isError ? T.danger : T.success,
                    border: `1px solid ${passwordMsg.isError ? T.dangerBorder : T.successBorder}`,
                  }}
                >
                  {passwordMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  style={{ ...btnSubtle, flex: 1, padding: 12 }}
                >
                  Cancel
                </button>
              <button
                type="submit"
                disabled={isSubmittingPassword || !evaluatePassword(newPassword).isAcceptable}
                style={{
                  ...btnPrimary,
                  flex: 1,
                  padding: 12,
                  cursor:
                    isSubmittingPassword || !evaluatePassword(newPassword).isAcceptable
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    isSubmittingPassword || !evaluatePassword(newPassword).isAcceptable ? 0.55 : 1,
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
    </DesktopSocketContext.Provider>
  );
}

/**
 * App — mounts the theme provider above the shell so both the login
 * screen and the authenticated workspace live-theme, and so the
 * account's stored preference can be applied the moment login succeeds.
 */
export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
