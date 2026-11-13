import { useState, type FormEvent, type PointerEvent } from 'react';
import Icon from '../shared/ui/Icon';
import ThemedLogo from '../shared/ui/ThemedLogo';

interface LoginScreenProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string;
  onSubmit: (e: FormEvent) => void | Promise<void>;
}

const DEV_ACCOUNTS = [
  { email: 'nurse@psu.edu.ph',     label: 'Clinic nurse',   icon: 'medical_information' },
  { email: 'doctor@psu.edu.ph',    label: 'Campus doctor',  icon: 'medical_services' },
  { email: 'dentist@psu.edu.ph',   label: 'Campus dentist', icon: 'dentistry' },
  { email: 'admin@psu.edu.ph',     label: 'System admin',   icon: 'admin_panel_settings' },
  { email: 'responder@psu.edu.ph', label: 'SOS responder',  icon: 'emergency' },
];

export default function LoginScreen({ email, setEmail, password, setPassword, error, onSubmit }: LoginScreenProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const errorId = 'login-error';
  const emailId = 'login-email';
  const passwordId = 'login-password';

  const handleLoginCardPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const bounds = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--login-pointer-x', `${e.clientX - bounds.left}px`);
    e.currentTarget.style.setProperty('--login-pointer-y', `${e.clientY - bounds.top}px`);
  };

  const handleSubmit = async (e: FormEvent) => {
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
