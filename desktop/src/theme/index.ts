// desktop/src/theme/index.ts
import type { CSSProperties } from 'react';

export const T = {
  ink: '#0F1E17',
  primary: '#1F4A34',
  primaryDark: '#153627',
  primaryMid: '#2E5C43',
  primarySoft: '#4A7A5E',
  primaryTint: '#E2EBE1',

  sage50: '#F7F9F6',
  sage100: '#EEF3EC',
  sage200: '#E2EBE1',
  sage300: '#C9D9C7',
  sage400: '#A3B3A1',

  surface: '#FFFFFF',
  surfaceMuted: '#FBFCFA',
  border: '#DCE4DA',
  borderSoft: '#E8EDE6',

  text: '#191C1A',
  textSub: '#5A635B',
  textMuted: '#94A396',
  textFaint: '#B7C0B5',

  danger: '#7A2E26',
  dangerSoft: '#FDE8E8',
  dangerBorder: '#F8B4B4',

  warning: '#8C6826',
  warningSoft: '#FEF3C7',
  warningBorder: '#FDE68A',

  info: '#0369A1',
  infoSoft: '#E0F2FE',
  infoBorder: '#BAE6FD',

  success: '#15803D',
  successSoft: '#DCFCE7',
  successBorder: '#BBF7D0',

  radius: {
    xs: 6, sm: 10, md: 14, lg: 18, xl: 22, xxl: 28, pill: 999,
  },

  shadow: {
    xs: '0 1px 2px rgba(15,30,23,0.04)',
    sm: '0 2px 6px rgba(15,30,23,0.05)',
    md: '0 6px 16px rgba(15,30,23,0.06)',
    lg: '0 12px 32px rgba(15,30,23,0.08)',
  },

  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace",
};

/* ── Reusable style objects ──────────────────────────────────────── */

export const cardStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: T.radius.lg,
  boxShadow: T.shadow.xs,
};

export const sectionTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.6,
  textTransform: 'uppercase',
  color: T.textSub,
  margin: 0,
};

export const pageTitle: CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: -0.5,
  color: T.text,
  margin: '4px 0 0',
};

export const pageSub: CSSProperties = {
  fontSize: 13,
  color: T.textSub,
  margin: '4px 0 0',
};

export const pill = (bg: string, color: string, border?: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: T.radius.pill,
  background: bg,
  color,
  border: border ? `1px solid ${border}` : 'none',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.3,
  textTransform: 'uppercase',
});

/** Pill colors keyed by role — used by User & Role tables */
export const rolePill = (role: string): CSSProperties => {
  switch (role) {
    case 'ADMIN':               return pill('#EDE9FE', '#6D28D9');
    case 'DOCTOR':              return pill(T.infoSoft, T.info);
    case 'DENTIST':             return pill('#ECFEFF', '#0E7490');
    case 'NURSE':               return pill('#F0FDFA', '#0F766E');
    case 'EMERGENCY_RESPONDER': return pill('#FEE2E2', '#B91C1C');
    case 'FACULTY':             return pill('#FFF7ED', '#C2410C');
    case 'STUDENT':             return pill(T.successSoft, T.success);
    default:                    return pill(T.sage100, T.textSub);
  }
};

export const statusPill = (active: boolean): CSSProperties =>
  active
    ? pill(T.successSoft, T.success, T.successBorder)
    : pill(T.dangerSoft, T.danger, T.dangerBorder);

/* ── Inputs ──────────────────────────────────────────────────────── */

export const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 14px',
  fontSize: 13,
  color: T.text,
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: T.radius.md,
  outline: 'none',
  fontFamily: T.font,
  transition: 'border-color 120ms ease, box-shadow 120ms ease',
};

export const inputFocusRing = `0 0 0 3px ${T.primaryTint}`;

/* ── Buttons ─────────────────────────────────────────────────────── */

export const btnPrimary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '10px 18px',
  borderRadius: T.radius.pill,
  background: T.primary,
  color: '#FFFFFF',
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: T.font,
  transition: 'background 120ms ease',
};

export const btnGhost: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '9px 16px',
  borderRadius: T.radius.pill,
  background: T.surface,
  color: T.text,
  border: `1px solid ${T.border}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: T.font,
};

export const btnSubtle: CSSProperties = {
  ...btnGhost,
  background: T.sage100,
  border: '1px solid transparent',
};