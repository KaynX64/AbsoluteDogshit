// desktop/src/theme/ThemeProvider.tsx
//
// Valetudo HealthLink — theme provider (Stage 7).
//
// Owns the (mode × preset) selection and applies it everywhere:
//
//   • desktop/src/theme/index.ts  → setActiveTheme() makes every live
//     `T.*` token + composite style resolve the new palette.
//   • documentElement CSS vars    → every `var(--token)` in index.css
//     (sidebar rail, login screen, cards, chips…) follows instantly.
//   • <ThemedLogo />              → the brand mark recolors per theme.
//
// Persistence is per account and offline-first:
//   • Every selection is written to localStorage immediately.
//   • When a session token exists the selection is also PUT to
//     /api/profile/theme (debounced) so it follows the account to any
//     machine. Server values arriving at login override the local copy
//     (the account is the source of truth).
//
// Validation: every external value (localStorage, server response,
// settings menu clicks) passes through the preset whitelist normalizers
// in ./presets.ts — an unknown value can never reach the DOM.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { API_BASE_URL } from '../config/api';
import { setActiveTheme } from './index';
import {
  THEME_STORAGE_KEY,
  normalizeThemeSelection,
  normalizeThemeMode,
  normalizeThemePreset,
  resolveThemeColors,
  themeCssVars,
} from './presets';
import type { ThemeMode, ThemePreset, ThemeSelection } from './presets';
import { prefetchThemedLogo } from './themedLogo';

export const DEFAULT_THEME_SELECTION: ThemeSelection = { mode: 'light', preset: 'brand' };

/* ═══════════════════════════════════════════════════════════════════
   PERSISTENCE — localStorage (offline-first cache)
   ═══════════════════════════════════════════════════════════════════ */

/** Read + validate the locally cached selection. Corrupt → defaults. */
export function readCachedTheme(): ThemeSelection {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME_SELECTION };
    return normalizeThemeSelection(JSON.parse(raw));
  } catch (_) {
    return { ...DEFAULT_THEME_SELECTION };
  }
}

function writeCachedTheme(sel: ThemeSelection): boolean {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(sel));
    return true;
  } catch (_) {
    return false;
  }
}

function readThemeSessionToken(): string | null {
  try {
    return localStorage.getItem('valetudo_token');
  } catch (_) {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   APPLICATION — CSS vars + live tokens + html attributes
   ═══════════════════════════════════════════════════════════════════ */

/** Apply a selection to the document + live token module (no React). */
function applyThemeToDocument(sel: ThemeSelection): void {
  const colors = resolveThemeColors(sel.preset, sel.mode);

  // 1. Live inline-style tokens (T.* getters) + shadow recipe.
  setActiveTheme(sel.preset, sel.mode);

  // 2. CSS custom properties for every class-based consumer.
  const root = document.documentElement;
  const vars = themeCssVars(colors);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }

  // 3. Attributes for attribute-scoped CSS (dark-mode blend tweaks) and
  //    native form control rendering.
  root.dataset.themeMode = colors.colorScheme;
  root.dataset.themePreset = sel.preset;
  root.style.colorScheme = colors.colorScheme;
}

/**
 * Synchronous bootstrap — unauthenticated screens always start in the
 * default theme; account preferences are applied only after login.
 */
export function bootstrapTheme(): void {
  applyThemeToDocument(DEFAULT_THEME_SELECTION);
}

/* ═══════════════════════════════════════════════════════════════════
   SERVER SYNC — PUT /api/profile/theme (per-account persistence)
   ═══════════════════════════════════════════════════════════════════ */

export type ThemeSyncState = 'idle' | 'device' | 'saving' | 'saved' | 'offline' | 'error' | 'local-error';

interface ThemeSyncResult {
  state: ThemeSyncState;
  /** Present when the server rejected the request (should not happen —
   *  values are whitelisted client-side before sending). */
  error?: string;
}

async function pushThemeToServer(sel: ThemeSelection, token: string): Promise<ThemeSyncResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/profile/theme`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ theme_mode: sel.mode, theme_preset: sel.preset }),
    });
    if (!res.ok) {
      // Transient server/network failures can be retried; rejected requests
      // need user attention instead of being mislabeled as an outage.
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) detail = body.error;
      } catch (_) { /* non-JSON body */ }
      return res.status >= 500 || res.status === 408 || res.status === 429
        ? { state: 'offline', error: detail }
        : { state: 'error', error: detail };
    }
    return { state: 'saved' };
  } catch (_) {
    return { state: 'offline' };
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CONTEXT
   ═══════════════════════════════════════════════════════════════════ */

export interface ThemeContextValue {
  mode: ThemeMode;
  preset: ThemePreset;
  /** Server-sync status for the settings menu's save indicator. */
  sync: ThemeSyncState;
  setMode: (mode: ThemeMode) => void;
  setPreset: (preset: ThemePreset) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Consume the theme. The app root calls this so the whole tree
 *  re-renders (and re-resolves live tokens) on every theme change. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() must be used inside <ThemeProvider>.');
  return ctx;
}

/* ── Module bridge — lets App.applyThemeFromAccount(user) reach the
   provider after login without prop-drilling through LoginScreen. ── */

type RegisterFn = (apply: ((sel: ThemeSelection, fromServer: boolean) => void) | null) => void;
let registeredApply: ((sel: ThemeSelection, fromServer: boolean) => void) | null = null;

/**
 * Apply the theme stored on a freshly-authenticated account.
 * Values are validated; invalid/missing server data falls back to the
 * current local selection instead of guessing.
 */
export function applyThemeFromAccount(user: unknown): void {
  const src = (user && typeof user === 'object' ? user : {}) as Record<string, unknown>;
  const hasMode = typeof src.theme_mode === 'string';
  const hasPreset = typeof src.theme_preset === 'string';
  if (!hasMode && !hasPreset) return; // older server — keep local theme

  const sel: ThemeSelection = {
    mode: hasMode ? normalizeThemeMode(src.theme_mode) : DEFAULT_THEME_SELECTION.mode,
    preset: hasPreset ? normalizeThemePreset(src.theme_preset) : DEFAULT_THEME_SELECTION.preset,
  };
  registeredApply?.(sel, true);
}

/** Reset the local UI theme after logout without changing the saved account preference. */
export function resetThemeAfterLogout(): void {
  registeredApply?.({ ...DEFAULT_THEME_SELECTION }, true);
}

/* ═══════════════════════════════════════════════════════════════════
   PROVIDER
   ═══════════════════════════════════════════════════════════════════ */

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [selection, setSelection] = useState<ThemeSelection>(() => ({ ...DEFAULT_THEME_SELECTION }));
  const [sync, setSync] = useState<ThemeSyncState>('idle');

  /** Debounce timer for the server PUT (rapid mode toggles coalesce). */
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const pushQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingPushes = useRef(0);
  const syncRevision = useRef(0);
  const localWriteFailed = useRef(false);

  const enqueuePush = useCallback((target: ThemeSelection, token: string, revision: number) => {
    pendingPushes.current += 1;
    const request = pushQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (
          revision !== syncRevision.current ||
          token !== readThemeSessionToken()
        ) return;

        const result = await pushThemeToServer(target, token);
        if (
          revision === syncRevision.current &&
          token === readThemeSessionToken()
        ) {
          setSync(localWriteFailed.current ? 'local-error' : result.state);
        }
      })
      .catch((error: unknown) => {
        if (revision === syncRevision.current) {
          setSync(localWriteFailed.current ? 'local-error' : 'error');
        }
        console.error('[Theme Preference Error]:', error);
      })
      .finally(() => {
        pendingPushes.current -= 1;
      });
    pushQueue.current = request;
    return request;
  }, []);

  /** Apply + persist (local) + schedule the server PUT. */
  const commit = useCallback((next: ThemeSelection, fromServer: boolean) => {
    selectionRef.current = next;
    applyThemeToDocument(next);
    localWriteFailed.current = !writeCachedTheme(next);
    setSelection(next);
    // The logo recolor is async — warm the cache so the next paint of
    // <ThemedLogo/> has the themed variant ready.
    prefetchThemedLogo(next.preset, next.mode);

    const token = readThemeSessionToken();
    if (pushTimer.current) {
      clearTimeout(pushTimer.current);
      pushTimer.current = null;
    }

    if (fromServer) {
      // Ignore older queued writes; if one is already in flight, queue the
      // server value after it so an old response cannot become persistent.
      const needsCorrection = pendingPushes.current > 0 && Boolean(token);
      const revision = ++syncRevision.current;
      setSync(localWriteFailed.current ? 'local-error' : token ? (needsCorrection ? 'saving' : 'saved') : 'device');
      if (needsCorrection && token) enqueuePush(next, token, revision);
      return;
    }

    const revision = ++syncRevision.current;
    if (!token) {
      setSync(localWriteFailed.current ? 'local-error' : 'device');
      return;
    }

    setSync('saving');
    pushTimer.current = setTimeout(() => {
      pushTimer.current = null;
      enqueuePush(next, token, revision);
    }, 450);
  }, [enqueuePush]);

  // Register the module bridge while mounted.
  useEffect(() => {
    const previous = registeredApply;
    registeredApply = (sel, fromServer) => commit(sel, fromServer);
    return () => { registeredApply = previous; };
  }, [commit]);

  // Keep the document in sync if the selection is swapped out from
  // under us (dev hot reload safety).
  useEffect(() => {
    applyThemeToDocument(selection);
  }, [selection]);

  // Never leave a dangling timer on unmount.
  useEffect(() => () => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
  }, []);

  useEffect(() => {
    const syncWhenOnline = () => {
      const token = readThemeSessionToken();
      if (!token || sync !== 'offline') return;
      if (pushTimer.current) {
        clearTimeout(pushTimer.current);
        pushTimer.current = null;
      }
      const revision = ++syncRevision.current;
      setSync('saving');
      enqueuePush(selectionRef.current, token, revision);
    };
    window.addEventListener('online', syncWhenOnline);
    return () => window.removeEventListener('online', syncWhenOnline);
  }, [enqueuePush, sync]);

  const setMode = useCallback((mode: ThemeMode) => {
    const m = normalizeThemeMode(mode);
    commit({ ...selectionRef.current, mode: m }, false);
  }, [commit]);

  const setPreset = useCallback((preset: ThemePreset) => {
    const p = normalizeThemePreset(preset);
    commit({ ...selectionRef.current, preset: p }, false);
  }, [commit]);

  const value = useMemo<ThemeContextValue>(() => ({
    mode: selection.mode,
    preset: selection.preset,
    sync,
    setMode,
    setPreset,
  }), [selection, sync, setMode, setPreset]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
