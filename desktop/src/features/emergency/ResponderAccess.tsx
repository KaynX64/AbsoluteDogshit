import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_BASE_URL } from '../../config/api';
import { subscribeToDesktopEvents, useDesktopSocket } from '../../platform/realtime/desktopRealtime';

export type ResponderTier = 'community' | 'clinical' | null;

type ResponderAccess = {
  tier: ResponderTier;
  refreshAccess: (invalidate?: boolean) => Promise<ResponderTier>;
  canUpdateStatus: (status: string) => boolean;
};

const ResponderAccessContext = createContext<ResponderAccess>({
  tier: null,
  refreshAccess: async () => null,
  canUpdateStatus: () => false,
});

export const useResponderAccess = () => useContext(ResponderAccessContext);

/** One live access lookup per desktop session, shared across alerts and reports. */
export function ResponderAccessProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<ResponderTier>(null);
  const tierRef = useRef<ResponderTier>(null);
  const pending = useRef<{ controller: AbortController; promise: Promise<ResponderTier> } | null>(null);
  const socket = useDesktopSocket();
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAccess = useCallback(() => {
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    expiryTimer.current = null;
    tierRef.current = null;
    setTier(null);
  }, []);

  const refreshAccess = useCallback((invalidate = false): Promise<ResponderTier> => {
    if (invalidate) {
      pending.current?.controller.abort();
      pending.current = null;
      clearAccess();
    }
    if (pending.current) return pending.current.promise;
    const controller = new AbortController();
    const token = localStorage.getItem('valetudo_token');
    const promise = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/emergency/responder-access`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        const access = response.ok ? await response.json() : null;
        if (controller.signal.aborted) return null;
        const next = access?.authorized === true && (access.tier === 'clinical' || access.tier === 'community')
          ? access.tier as ResponderTier : null;
        tierRef.current = next;
        setTier(next);
        if (expiryTimer.current) clearTimeout(expiryTimer.current);
        if (next && access.expiresAt) {
          const delay = Math.max(0, new Date(access.expiresAt).getTime() - Date.now());
          expiryTimer.current = setTimeout(() => { void refreshAccess(true); }, Math.min(delay, 2_147_000_000));
        }
        return next;
      } catch {
        if (!controller.signal.aborted) clearAccess();
        return null;
      } finally {
        if (pending.current?.controller === controller) pending.current = null;
      }
    })();
    pending.current = { controller, promise };
    return promise;
  }, [clearAccess]);

  useEffect(() => {
    void refreshAccess();
    const invalidate = () => { void refreshAccess(true); };
    const unsubscribe = subscribeToDesktopEvents(socket, on => {
      on('reconnect', invalidate);
      on('responder:status_changed', invalidate);
    });
    const onFocus = () => { void refreshAccess(); };
    window.addEventListener('focus', onFocus);
    return () => {
      pending.current?.controller.abort();
      pending.current = null;
      tierRef.current = null;
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [socket, clearAccess, refreshAccess]);

  const canUpdateStatus = useCallback((status: string) =>
    (tierRef.current === 'clinical' && ['acknowledged', 'dispatched', 'resolved', 'false_alarm'].includes(status)) ||
    (tierRef.current === 'community' && status === 'acknowledged'), []);
  const value = useMemo(() => ({ tier, refreshAccess, canUpdateStatus }), [tier, refreshAccess, canUpdateStatus]);
  return <ResponderAccessContext.Provider value={value}>{children}</ResponderAccessContext.Provider>;
}
