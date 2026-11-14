// desktop/src/app/SettingsMenu.tsx
//
// Valetudo HealthLink — settings menu (sidebar, bottom-left).
//
// A gear button pinned to the bottom of the sidebar rail opens a
// popover panel (growing upward, away from the screen edge) with the
// account's system settings:
//
//   Appearance
//   • Mode — Light / Dark segmented toggle (light is the default).
//   • Preset — Valetudo (sage), Blossom (white-pink), Sunrise
//     (yellow-blue). Switching also recolors the brand logo.
//   • A save indicator reflects per-account persistence (the selection
//     is stored on the signed-in account and cached locally).
//
//   Account
//   • Reset password — opens the existing change-password modal.
//
// Implementation notes:
//   • The panel renders through a React portal with fixed positioning —
//     the sidebar is a scroll container (overflow-y: auto), which would
//     clip a 300px-wide absolutely-positioned child.
//   • Closes on outside pointer-down, Escape, or window resize that
//     pushes it off-screen; the trigger carries aria-expanded/haspopup.
//   • Every selection is validated inside the theme provider before it
//     reaches the DOM — unknown values can never be applied.
//
// All colors come from live tokens / CSS vars, so the menu itself
// re-themes while it is open.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../shared/ui/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { PRESET_META, THEME_MODES, THEME_PRESETS } from '../theme/presets';
import type { ThemeMode } from '../theme/presets';

export interface SettingsMenuProps {
  /** Opens the account's reset-password modal (owned by App). */
  onResetPassword: () => void;
}

const MODE_META: Record<ThemeMode, { label: string; icon: string }> = {
  light: { label: 'Light', icon: 'light_mode' },
  dark:  { label: 'Dark',  icon: 'dark_mode' },
};

const PANEL_WIDTH = 300;

interface PanelStyle {
  left: number;
  top: number;
  width: number;
}

export default function SettingsMenu({ onResetPassword }: SettingsMenuProps) {
  const { mode, preset, sync, setMode, setPreset } = useTheme();
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<PanelStyle | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ── Position: anchor the panel's bottom-left to the trigger, clamped
     to the viewport. Runs before paint — the panel is measured first
     (rendered hidden), then placed, so nothing flashes. ─────────── */
  const measure = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const panelH = panelRef.current?.offsetHeight ?? 0;
    const desiredBottom = rect.top - 10; // panel bottom sits just above the trigger
    const visualTop = Math.max(
      12,
      Math.min(desiredBottom - panelH, window.innerHeight - 12 - panelH),
    );
    // translateY(-100%) lifts the panel by its own height, so the style
    // top is the visual top + height.
    setPanelStyle({ left, top: visualTop + panelH, width });
  };

  useLayoutEffect(() => {
    if (open) measure();
    else setPanelStyle(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Dismiss: outside click, Escape, resize; keep anchored on scroll ── */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return; // click inside the trigger or panel — not a dismissal
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onResize = () => measure();

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncView =
    sync === 'saving'
      ? { icon: 'sync', className: 'is-saving', text: 'Saving to your account…' }
      : sync === 'offline'
      ? { icon: 'cloud_off', className: 'is-offline', text: 'Saved on this device — syncs when back online' }
      : sync === 'error'
      ? { icon: 'error', className: 'is-offline', text: 'Could not sync theme — sign in again or try later' }
      : sync === 'local-error'
      ? { icon: 'error', className: 'is-offline', text: 'Theme changed, but could not be saved on this device' }
      : sync === 'saved'
      ? { icon: 'cloud_done', className: 'is-saved', text: 'Saved to your account' }
      : { icon: 'palette', className: 'is-saved', text: 'Using this device’s theme' };

  const panel = open && (
    <div
      ref={panelRef}
      className="settings-pop"
      role="dialog"
      aria-label="Settings"
      style={{
        position: 'fixed',
        // First paint before measuring: park invisibly, then place.
        visibility: panelStyle ? 'visible' : 'hidden',
        left: panelStyle?.left ?? 12,
        top: panelStyle?.top ?? 0,
        width: panelStyle?.width ?? Math.min(PANEL_WIDTH, window.innerWidth - 24),
        transform: 'translateY(-100%)',
      }}
    >
      <header className="settings-head">
        <div>
          <h3 className="settings-title">Settings</h3>
          <p className="settings-sub">Appearance &amp; account preferences</p>
        </div>
        <button
          type="button"
          className="settings-close"
          onClick={() => setOpen(false)}
          aria-label="Close settings"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      {/* ── Appearance ─────────────────────────────────────────── */}
      <section className="settings-section">
        <p className="settings-label">Appearance</p>

        {/* Mode — Light / Dark */}
        <div className="settings-seg" role="radiogroup" aria-label="Color mode">
          {THEME_MODES.map((m) => {
            const isActive = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`settings-seg-btn${isActive ? ' is-active' : ''}`}
                onClick={() => setMode(m)}
              >
                <Icon name={MODE_META[m].icon} size={17} />
                <span>{MODE_META[m].label}</span>
              </button>
            );
          })}
        </div>

        {/* Presets */}
        <p className="settings-label settings-label--gap">Theme preset</p>
        <div className="settings-presets" role="radiogroup" aria-label="Theme preset">
          {THEME_PRESETS.map((p) => {
            const isActive = preset === p;
            const meta = PRESET_META[p];
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`settings-preset${isActive ? ' is-active' : ''}`}
                onClick={() => setPreset(p)}
              >
                <span className="settings-swatch" aria-hidden="true">
                  <i style={{ background: meta.swatch[0] }} />
                  <i style={{ background: meta.swatch[1] }} />
                </span>
                <span className="settings-preset-copy">
                  <strong>{meta.label}</strong>
                  <small>{meta.hint}</small>
                </span>
                {isActive && <Icon name="check_circle" size={18} className="settings-check" />}
              </button>
            );
          })}
        </div>

        <p className={`settings-sync ${syncView.className}`}>
          <Icon name={syncView.icon} size={14} />
          <span>{syncView.text}</span>
        </p>
      </section>

      {/* ── Account ────────────────────────────────────────────── */}
      <section className="settings-section">
        <p className="settings-label">Account</p>
        <button
          type="button"
          className="settings-row"
          onClick={() => {
            setOpen(false);
            onResetPassword();
          }}
        >
          <Icon name="key" size={18} />
          <span>Reset password</span>
          <Icon name="chevron_right" size={16} className="settings-row-chevron" />
        </button>
      </section>

      <footer className="settings-foot">
        <Icon name="palette" size={14} />
        <span>Theme follows your account on every device</span>
      </footer>
    </div>
  );

  return (
    <>
      {panel && createPortal(panel, document.body)}

      {/* Trigger — pinned at the bottom of the sidebar rail */}
      <button
        ref={triggerRef}
        type="button"
        className={`sb-link${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Settings"
      >
        <Icon name="settings" size={20} />
        <span>Settings</span>
      </button>
    </>
  );
}
