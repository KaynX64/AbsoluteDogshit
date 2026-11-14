import { consoleNavigation } from './consoleNavigation';
import { useKeyboardPressFeedback, useWorkspaceMotion } from '../shared/ui/selectionMotion';
import { useConfirmAction } from '../shared/ui/ConfirmAction';
import { useActionFeedback } from '../shared/ui/feedback';
import Dialog from '../shared/ui/Dialog';
// desktop/src/app/App.tsx
import React, { useCallback, useEffect, useState } from 'react';
import NurseConsole from '../features/nurse/NurseConsole';
import DoctorConsole from '../features/consultations/DoctorConsole';
import AdminConsole from '../features/admin/AdminConsole';
import type { AdminTab } from '../features/admin/AdminConsole';
import ResponderConsole from '../features/emergency/ResponderConsole';
import { useBookingBadge } from '../features/appointments/useBookingBadge';
import { DesktopSocketContext, useDesktopSocketSession } from '../platform/realtime/desktopRealtime';
import { bootstrapOfflineCache } from '../platform/offline/offlineSync';
import { offlineQueueStatus, replayOfflineQueue, setOfflineAccount } from '../platform/offline/offlineQueue';
import { API_BASE_URL } from '../config/api';
import PasswordStrengthIndicator, { evaluatePassword } from '../shared/ui/PasswordStrengthIndicator';
import { T, btnPrimary, btnSubtle } from '../theme';
import { ThemeProvider, applyThemeFromAccount, resetThemeAfterLogout, useTheme } from '../theme/ThemeProvider';
import Icon from '../shared/ui/Icon';
import IncidentReportModal from '../features/emergency/IncidentReportModal';


import Sidebar from './Sidebar';
import TopBar from './TopBar';
import TitleBar from './TitleBar';
import LoginScreen from './LoginScreen';
import { useSessionTimeout } from './useSessionTimeout';

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
  const { confirmAction, confirmation } = useConfirmAction();
  const { notify, notice } = useActionFeedback();
  const { mode, preset } = useTheme();
  const [updateStatus, setUpdateStatus] = useState<{ state: string; version?: string; percent?: number } | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState(() => sessionStorage.getItem('valetudo_session_expired')
    ? 'Your session expired due to inactivity. Sign in again to continue.'
    : '');
  useEffect(() => { sessionStorage.removeItem('valetudo_session_expired'); }, []);
  const [activeRoleView, setActiveRoleView] = useState<string>('');

  /* ── Workspace state (driven by sidebar) ─────────────────────── */
  const [adminTab, setAdminTab] = useState<AdminTab>('users');
  const [showIncidentRecords, setShowIncidentRecords] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const updateTerminalAccess = useCallback((allowed: boolean) => {
    setShowTerminal(allowed);
    if (!allowed) setAdminTab(current => current === 'terminal' ? 'users' : current);
  }, []);
  const [doctorViewMode, setDoctorViewMode] = useState<
    'active' | 'scheduled' | 'history' | 'archive' | 'analytics'
  >('active');
  const [nurseViewMode, setNurseViewMode] = useState<'triage' | 'expected' | 'inventory' | 'analytics'>('triage');

  function destinationFor(role: string) {
    if (role === 'ADMIN') return adminTab === 'archived' ? 'users' : adminTab;
    if (role === 'NURSE') return nurseViewMode;
    return role === 'EMERGENCY_RESPONDER' ? 'dispatch' : doctorViewMode;
  }

  const destination = destinationFor(activeRoleView);
  const { workspace, requestWorkspace } = useWorkspaceMotion(
    activeRoleView, destination, consoleNavigation(activeRoleView).map(item => item.key),
  );
  function navigateTo(destination: string) {
    requestWorkspace(activeRoleView, destination);
    if (activeRoleView === 'ADMIN') setAdminTab(destination as AdminTab);
    if (activeRoleView === 'DOCTOR' || activeRoleView === 'DENTIST') setDoctorViewMode(destination as typeof doctorViewMode);
    if (activeRoleView === 'NURSE') setNurseViewMode(destination as typeof nurseViewMode);
  }
  useKeyboardPressFeedback();

  /* ── Connectivity & offline queue ────────────────────────────── */
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState({ pending: 0, needsReview: 0, unassigned: 0, unavailable: false });
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
    setOfflineAccount(null);
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
    setShowTerminal(false);
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
    let mounted = true;
    let pending: ReturnType<typeof offlineQueueStatus> | undefined;
    const updateQueueCount = () => {
      const current = offlineQueueStatus();
      pending = current;
      void current.then(counts => {
        if (mounted && pending === current) setOfflineQueue({ ...counts, unavailable: false });
      }).catch(() => {
        if (mounted && pending === current) setOfflineQueue({ pending: 0, needsReview: 0, unassigned: 0, unavailable: true });
      });
    };

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOffline);
    window.addEventListener('offline-queue-changed', updateQueueCount);

    updateQueueCount();

    return () => {
      mounted = false;
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOffline);
      window.removeEventListener('offline-queue-changed', updateQueueCount);
    };
  }, []);

  useEffect(() => {
    if (!user?.roles?.some((role: string) => ['DOCTOR', 'DENTIST', 'NURSE'].includes(role))) return;
    const retry = () => {
      void replayOfflineQueue().then(result => {
        if (result.synced) return bootstrapOfflineCache();
      }).catch(() => {});
    };
    if (navigator.onLine) retry();
    window.addEventListener('online', retry);
    desktopSocket?.on('connect', retry);
    return () => {
      window.removeEventListener('online', retry);
      desktopSocket?.off('connect', retry);
    };
  }, [desktopSocket, user]);

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
        setOfflineAccount(Number(data.user.user_id), data.token, userRoles.some(role => role === 'DOCTOR' || role === 'DENTIST'));

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
    if (isReplaying) return;
    setIsReplaying(true);
    try {
      const result = await replayOfflineQueue();
      if (result.synced) void bootstrapOfflineCache();
      const review = result.failed ? ` ${result.failed} need review.` : '';
      const pending = result.remaining ? ` ${result.remaining} still queued.` : '';
      notify(`Synced ${result.synced} offline changes.${review}${pending}`, Boolean(result.failed || result.remaining));
    } catch (err: any) {
      notify(`Replay failed. ${err.message} Use Replay to try again.`, true);
    } finally {
      setIsReplaying(false);
    }
  };

const handleChangePassword = async (e: React.FormEvent) => {
  e.preventDefault();
  if (isSubmittingPassword) return;
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
    document.getElementById('desktop-new-password')?.focus();
    return;
  }

  if (newPassword !== confirmPassword) {
    setPasswordMsg({ text: 'New passwords do not match.', isError: true });
    document.getElementById('desktop-confirm-password')?.focus();
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
      <>
        <TitleBar />
        <LoginScreen
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          error={error}
          onSubmit={handleLogin}
        />
      </>
    );
  }

  return (
    <>
    <TitleBar />
    <DesktopSocketContext.Provider value={desktopSocket}>
    <div className="app-shell" data-theme-mode={mode} data-theme-preset={preset}>
      <Sidebar
        role={activeRoleView}
        showIncidentRecords={showIncidentRecords}
        showTerminal={showTerminal}
        badgeCounts={badgeKey ? { [badgeKey]: bookingBadge } : undefined}
        onSignOut={handleSignOut}
        onChangePassword={() => { setShowPasswordModal(true); setPasswordMsg(null); }}
        activeItem={destination}
        onItemClick={activeRoleView === 'EMERGENCY_RESPONDER' ? undefined : navigateTo}
      />

      <div className="app-main">
        <TopBar
          user={user}
          role={activeRoleView}
          isOnline={isOnline}
          offlineQueueCount={offlineQueue.pending}
          offlineNeedsReview={offlineQueue.needsReview}
          offlineUnassigned={offlineQueue.unassigned}
          offlineStorageUnavailable={offlineQueue.unavailable}
          isReplaying={isReplaying}
          onManualReplay={handleManualReplay}
          roleView={activeRoleView}
          roles={user.roles}
          onChangeRoleView={role => {
            requestWorkspace(role, destinationFor(role));
            setActiveRoleView(role);
          }}
        />

        {notice}
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
          onClick={async () => {
            if (offlineQueue.pending > 0 &&
                !await confirmAction('Restart now', `${offlineQueue.pending} offline changes stay saved locally. Sign in again after restart to sync them.`)) return;
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
          id="desktop-workspace"
          ref={workspace}
          tabIndex={-1}
          style={activeRoleView === 'NURSE' && nurseViewMode === 'inventory'
            ? { padding: 0, display: 'flex', minHeight: 0, overflow: 'hidden' }
            : undefined}
        >
          {activeRoleView === 'NURSE' && (
            <NurseConsole
              viewMode={nurseViewMode}
              onViewModeChange={navigateTo}
            />
          )}
          {(activeRoleView === 'DOCTOR' || activeRoleView === 'DENTIST') && (
            <DoctorConsole
              viewMode={doctorViewMode}
              onViewModeChange={navigateTo}
              currentRole={activeRoleView}
            />
          )}
          {activeRoleView === 'ADMIN' && (
            <AdminConsole activeTab={adminTab} onTabChange={setAdminTab} onIncidentAccessChange={setShowIncidentRecords} onTerminalAccessChange={updateTerminalAccess} />
          )}
          {activeRoleView === 'EMERGENCY_RESPONDER' && <ResponderConsole />}
        </main>
      </div>

      {/* Post-resolution incident documentation popup. Server-driven: it
          only appears for accounts in the live responder audience, on any
          console view, whenever ANY responder closes an SOS as resolved. */}
      {confirmation}
      <IncidentReportModal />

      {showPasswordModal && (
        <Dialog label="Update account password" size="compact" busy={isSubmittingPassword} onDismiss={() => setShowPasswordModal(false)}>
          <div className="modal-card" style={{ maxWidth: 460 }}>
            <div className="dialog-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 tabIndex={-1} data-dialog-initial style={{ margin: 0, color: T.primary, fontSize: 17, fontWeight: 800, letterSpacing: -0.3, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="key" size={20} tone="primary" />
                Update account password
              </h3>
              <button
                type="button"
                disabled={isSubmittingPassword}
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
              <label className="field-label" htmlFor="desktop-current-password">Current password</label>
              <input id="desktop-current-password"
                type="password"
                className="field-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                style={{ marginBottom: 14 }}
              />

              <label className="field-label" htmlFor="desktop-new-password">New password</label>
              <input id="desktop-new-password"
                type="password"
                className="field-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={{ marginBottom: 4 }}
              />
              <PasswordStrengthIndicator password={newPassword} />
              <div style={{ marginBottom: 14 }} />

              <label className="field-label" htmlFor="desktop-confirm-password">Confirm new password</label>
              <input id="desktop-confirm-password"
                type="password"
                className="field-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />

              {passwordMsg && (
                <div role={passwordMsg.isError ? 'alert' : 'status'}
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

              <div className="dialog-footer" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  disabled={isSubmittingPassword}
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
        </Dialog>
      )}
    </div>
    </DesktopSocketContext.Provider>
    </>
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
