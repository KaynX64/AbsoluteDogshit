// desktop/src/theme/index.ts
//
// Valetudo HealthLink — design-system presets.
// Stage 5 — clean / calm / minimal overhaul (per Overhaul.pdf reference).
//
// Every export from earlier stages is preserved verbatim. The additions
// below give the rest of the app one consistent place to pull styles from,
// so components stop re-hardcoding the same hex / shadow / radius values.

import type { CSSProperties } from 'react';

export const T = {
  ink: '#0F1E17',
  primary: '#1F4A34',
  primaryDark: '#153627',
  primaryMid: '#2E5C43',
  primarySoft: '#4A7A5E',
  primaryTint: '#E2EBE1',
  primary50: '#F2F6F0',
  primary100: '#E2EBE1',

  sage50: '#FAFBF9',
  sage100: '#F2F5F0',
  sage200: '#E5EBE3',
  sage300: '#C9D9C7',
  sage400: '#A3B3A1',

  surface: '#FFFFFF',
  surfaceMuted: '#FBFCFA',
  surface2: '#F4F7F2',
  surface3: '#EDF2EB',
  border: '#E1E6DF',
  borderSoft: '#EDEFE9',
  borderStrong: '#C5D0C0',

  text: '#1A1F1B',
  textSub: '#4A5A4D',
  textMuted: '#8A9990',
  textFaint: '#B7C0B5',
  textOnPrimary: '#FFFFFF',

  danger: '#B43E32',
  dangerSoft: '#FCEBEA',
  dangerBorder: '#F0C5C0',

  warning: '#B8762A',
  warningSoft: '#FBF1DD',
  warningBorder: '#F0D9A8',

  info: '#2A6FA8',
  infoSoft: '#E6F0F8',
  infoBorder: '#B5D2E8',

  success: '#2D7A4A',
  successSoft: '#E0F0E5',
  successBorder: '#B5DCC1',

  // Tonal accents (cohesive with sage seed — calmer low-saturation)
  tonalGreenBg: '#E5EFE2', tonalGreenFg: '#2E5C43',
  tonalBlueBg:  '#E0EAF2', tonalBlueFg:  '#2A5A75',
  tonalCreamBg: '#F2EBDA', tonalCreamFg: '#7A6533',
  tonalLilacBg: '#E6E1EF', tonalLilacFg: '#4F4170',
  tonalRoseBg:  '#F2E0DC', tonalRoseFg:  '#8A4035',
  tonalTealBg:  '#DDECE7', tonalTealFg:  '#2A6052',
  tonalAmberBg: '#F4E5C2', tonalAmberFg: '#7A5A1E',

  // Spacing scale
  sp: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40, 9: 48, 10: 64, 11: 80 },

  // Type scale
  fs: {
    caption:  10.5, meta: 11.5, body: 13, bodyLg: 14, subtitle: 15,
    title:    17, titleLg: 20, h2: 22, h1: 26, display: 34, hero: 44,
  },
  lh: { tight: 1.1, snug: 1.3, normal: 1.5, relaxed: 1.65 },
  fw: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 },
  ls: { tight: -0.3, normal: 0, wide: 0.3, wider: 0.6, widest: 1.4 },

  radius: {
    xs: 5, sm: 8, md: 10, lg: 14, xl: 18, xxl: 22, pill: 999, circle: '50%',
  },

  shadow: {
    xs:  '0 1px 2px rgba(15,30,23,0.03)',
    sm:  '0 1px 2px rgba(15,30,23,0.03), 0 1px 3px rgba(15,30,23,0.04)',
    md:  '0 2px 6px rgba(15,30,23,0.04), 0 4px 12px rgba(15,30,23,0.05)',
    lg:  '0 4px 12px rgba(15,30,23,0.06), 0 12px 24px rgba(15,30,23,0.08)',
    xl:  '0 8px 20px rgba(15,30,23,0.08), 0 24px 48px rgba(15,30,23,0.10)',
    primary: '0 2px 6px rgba(31, 74, 52, 0.10), 0 6px 14px rgba(31, 74, 52, 0.08)',
  },

  // Motion primitives
  ease:        'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut:     'cubic-bezier(0.16, 1, 0.3, 1)',
  easeSpring:  'cubic-bezier(0.4, 0, 0.2, 1)',
  durFast:     '100ms',
  durBase:     '150ms',
  durSlow:     '220ms',
  durSlower:   '320ms',

  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace",
};

/* ── Color helpers ──────────────────────────────────────────────── */

/** Convert "#1F4A34" → "31,74,52" for use in rgba() compositions. */
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

/** rgba('#1F4A34', 0.08) → 'rgba(31,74,52,0.08)' — soft tints on the fly. */
export function rgba(hex: string, alpha: number): string {
  return `rgba(${hexToRgb(hex)},${alpha})`;
}

/* ═══════════════════════════════════════════════════════════════════
   LAYOUT PRIMITIVES
   ═══════════════════════════════════════════════════════════════════ */

export const cardStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: T.radius.lg,
  boxShadow: T.shadow.xs,
};

/** Card with slightly stronger elevation for primary content panels. */
export const cardElevated: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.borderSoft}`,
  borderRadius: T.radius.xl,
  boxShadow: T.shadow.sm,
};

/** Inset panel inside a card (e.g. a stat block inside a section card). */
export const cardInset: CSSProperties = {
  background: T.surface2,
  border: `1px solid ${T.borderSoft}`,
  borderRadius: T.radius.md,
};

/** Page wrapper used by every console for consistent gutters. */
export const pageWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: T.sp[5],
};

/* ── Dividers ───────────────────────────────────────────────────── */

export const divider: CSSProperties = {
  height: 1,
  background: T.borderSoft,
  border: 'none',
  margin: 0,
};

export const dividerVertical: CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  background: T.borderSoft,
  border: 'none',
};

/* ═══════════════════════════════════════════════════════════════════
   TYPOGRAPHY PRESETS
   ═══════════════════════════════════════════════════════════════════ */

export const eyebrow: CSSProperties = {
  fontSize: T.fs.caption,
  fontWeight: T.fw.bold,
  letterSpacing: T.ls.widest,
  textTransform: 'uppercase',
  color: T.textMuted,
  margin: 0,
};

export const sectionTitle: CSSProperties = {
  fontSize: T.fs.caption,
  fontWeight: T.fw.bold,
  letterSpacing: T.ls.widest,
  textTransform: 'uppercase',
  color: T.textSub,
  margin: 0,
};

export const sectionHeading: CSSProperties = {
  fontSize: T.fs.titleLg,
  fontWeight: T.fw.extrabold,
  letterSpacing: T.ls.tight,
  color: T.text,
  margin: 0,
};

export const pageTitle: CSSProperties = {
  fontSize: T.fs.h1,
  fontWeight: T.fw.extrabold,
  letterSpacing: T.ls.tight,
  color: T.text,
  margin: 0,
};

export const pageSub: CSSProperties = {
  fontSize: T.fs.subtitle,
  color: T.textSub,
  margin: '4px 0 0',
  lineHeight: T.lh.normal,
};

export const bodyText: CSSProperties = {
  fontSize: T.fs.body,
  color: T.text,
  lineHeight: T.lh.normal,
  margin: 0,
};

export const caption: CSSProperties = {
  fontSize: T.fs.caption,
  color: T.textMuted,
  lineHeight: T.lh.normal,
  margin: 0,
};

export const monoNumerals: CSSProperties = {
  fontFamily: T.mono,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: 0.2,
};

/* ═══════════════════════════════════════════════════════════════════
   PILLS & BADGES
   ═══════════════════════════════════════════════════════════════════ */

export const pill = (bg: string, color: string, border?: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: T.radius.pill,
  background: bg,
  color,
  border: border ? `1px solid ${border}` : 'none',
  fontSize: T.fs.caption,
  fontWeight: T.fw.bold,
  letterSpacing: T.ls.wide,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
});

/** Soft pill — lowercase, sentence-case, larger padding (status badges). */
export const softBadge = (bg: string, color: string, border?: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 12px',
  borderRadius: T.radius.pill,
  background: bg,
  color,
  border: border ? `1px solid ${border}` : 'none',
  fontSize: T.fs.meta,
  fontWeight: T.fw.semibold,
  whiteSpace: 'nowrap',
});

/** Pill colors keyed by role — used by User & Role tables */
export const rolePill = (role: string): CSSProperties => {
  switch (role) {
    case 'ADMIN':               return pill(T.tonalLilacBg, T.tonalLilacFg);
    case 'DOCTOR':              return pill(T.infoSoft, T.info);
    case 'DENTIST':             return pill('#ECFEFF', '#0E7490');
    case 'NURSE':               return pill(T.tonalGreenBg, T.tonalGreenFg);
    case 'EMERGENCY_RESPONDER': return pill(T.tonalRoseBg, T.tonalRoseFg);
    case 'FACULTY':             return pill('#FFF7ED', '#C2410C');
    case 'NON_TEACHING':        return pill(T.tonalCreamBg, T.tonalCreamFg);
    case 'STUDENT':             return pill(T.successSoft, T.success);
    default:                    return pill(T.sage100, T.textSub);
  }
};

export const statusPill = (active: boolean): CSSProperties =>
  active
    ? pill(T.successSoft, T.success, T.successBorder)
    : pill(T.dangerSoft, T.danger, T.dangerBorder);

/** Status pill keyed by appointment/queue status string. */
export const queueStatusPill = (status: string): CSSProperties => {
  switch ((status || '').toLowerCase()) {
    case 'scheduled':    return softBadge(T.sage100, T.textSub, T.border);
    case 'checked_in':   return softBadge(T.infoSoft, T.info, T.infoBorder);
    case 'serving':      return softBadge(T.primaryTint, T.primary, T.sage300);
    case 'completed':    return softBadge(T.successSoft, T.success, T.successBorder);
    case 'cancelled':    return softBadge(T.dangerSoft, T.danger, T.dangerBorder);
    case 'no_show':      return softBadge(T.warningSoft, T.warning, T.warningBorder);
    case 'waiting':      return softBadge(T.tonalAmberBg, T.tonalAmberFg);
    case 'triggered':    return softBadge(T.dangerSoft, T.danger, T.dangerBorder);
    case 'acknowledged': return softBadge(T.warningSoft, T.warning, T.warningBorder);
    case 'dispatched':   return softBadge(T.infoSoft, T.info, T.infoBorder);
    case 'resolved':     return softBadge(T.successSoft, T.success, T.successBorder);
    case 'false_alarm':  return softBadge(T.sage100, T.textSub, T.border);
    default:             return softBadge(T.sage100, T.textSub, T.border);
  }
};

/* ═══════════════════════════════════════════════════════════════════
   INPUTS
   ═══════════════════════════════════════════════════════════════════ */

export const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 14px',
  fontSize: T.fs.body,
  color: T.text,
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: T.radius.md,
  outline: 'none',
  fontFamily: T.font,
  transition: `border-color ${T.durBase} ${T.ease}, box-shadow ${T.durBase} ${T.ease}`,
};

export const inputFocusRing = `0 0 0 3px ${rgba(T.primary, 0.14)}`;

/** Search input — pill shape, slightly smaller. */
export const searchInput: CSSProperties = {
  ...inputStyle,
  padding: '9px 16px 9px 36px',
  borderRadius: T.radius.pill,
  fontSize: T.fs.meta,
};

/** Textarea variant. */
export const textareaStyle: CSSProperties = {
  ...inputStyle,
  padding: '12px 14px',
  minHeight: 88,
  resize: 'vertical',
  lineHeight: T.lh.normal,
  fontFamily: T.font,
};

/* ═══════════════════════════════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════════════════════════════ */

export const btnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: T.radius.pill,
  border: 'none',
  fontSize: T.fs.body,
  fontWeight: T.fw.bold,
  cursor: 'pointer',
  fontFamily: T.font,
  whiteSpace: 'nowrap',
  transition: `background ${T.durBase} ${T.ease}, box-shadow ${T.durBase} ${T.ease}, transform ${T.durFast} ${T.ease}, border-color ${T.durBase} ${T.ease}`,
};

export const btnPrimary: CSSProperties = {
  ...btnBase,
  padding: '10px 18px',
  background: T.primary,
  color: '#FFFFFF',
  boxShadow: `0 1px 2px ${rgba(T.primary, 0.18)}`,
};

export const btnGhost: CSSProperties = {
  ...btnBase,
  padding: '9px 16px',
  background: T.surface,
  color: T.text,
  border: `1px solid ${T.border}`,
  fontWeight: T.fw.semibold,
};

export const btnSubtle: CSSProperties = {
  ...btnGhost,
  background: T.sage100,
  border: '1px solid transparent',
};

/** NEW: danger / destructive action button. */
export const btnDanger: CSSProperties = {
  ...btnBase,
  padding: '10px 18px',
  background: T.danger,
  color: '#FFFFFF',
  boxShadow: `0 1px 2px ${rgba(T.danger, 0.20)}`,
};

/** NEW: success confirmation button. */
export const btnSuccess: CSSProperties = {
  ...btnBase,
  padding: '10px 18px',
  background: T.success,
  color: '#FFFFFF',
  boxShadow: `0 1px 2px ${rgba(T.success, 0.20)}`,
};

/** NEW: warning / caution button (used by emergency acknowledge). */
export const btnWarning: CSSProperties = {
  ...btnBase,
  padding: '10px 18px',
  background: T.warning,
  color: '#FFFFFF',
  boxShadow: `0 1px 2px ${rgba(T.warning, 0.20)}`,
};

/** NEW: soft danger outline — secondary destructive action. */
export const btnGhostDanger: CSSProperties = {
  ...btnGhost,
  background: T.dangerSoft,
  color: T.danger,
  border: `1px solid ${T.dangerBorder}`,
};

/** NEW: soft success outline — secondary positive action. */
export const btnGhostSuccess: CSSProperties = {
  ...btnGhost,
  background: T.successSoft,
  color: T.success,
  border: `1px solid ${T.successBorder}`,
};

/** NEW: icon-only square button (38×38 default). */
export const iconBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: T.radius.md,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.textSub,
  cursor: 'pointer',
  transition: `background ${T.durBase} ${T.ease}, color ${T.durBase} ${T.ease}, transform ${T.durFast} ${T.ease}`,
  padding: 0,
};

/* ═══════════════════════════════════════════════════════════════════
   TABLES
   ═══════════════════════════════════════════════════════════════════ */

export const tableHeaderStyle: CSSProperties = {
  fontSize: T.fs.caption,
  fontWeight: T.fw.extrabold,
  letterSpacing: T.ls.wider,
  textTransform: 'uppercase',
  color: T.textMuted,
  textAlign: 'left',
  padding: '12px 14px',
  background: T.sage100,
  borderBottom: `1px solid ${T.border}`,
  whiteSpace: 'nowrap',
};

export const tableCellStyle: CSSProperties = {
  padding: '14px',
  fontSize: T.fs.body,
  color: T.text,
  borderBottom: `1px solid ${T.borderSoft}`,
  verticalAlign: 'middle',
};

/* ═══════════════════════════════════════════════════════════════════
   KPI / STAT CARDS
   ═══════════════════════════════════════════════════════════════════ */

export const kpiCard = (bg: string, fg: string): CSSProperties => ({
  background: bg,
  color: fg,
  borderRadius: T.radius.xl,
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  border: '1px solid transparent',
});

export const kpiLabel: CSSProperties = {
  fontSize: T.fs.caption,
  fontWeight: T.fw.semibold,
  letterSpacing: T.ls.wide,
  textTransform: 'uppercase',
  opacity: 0.8,
};

export const kpiValue: CSSProperties = {
  fontSize: 28,
  fontWeight: T.fw.extrabold,
  letterSpacing: T.ls.tight,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
};

export const kpiHint: CSSProperties = {
  fontSize: T.fs.meta,
  fontWeight: T.fw.medium,
  opacity: 0.7,
  marginTop: 2,
};

/* ═══════════════════════════════════════════════════════════════════
   EMPTY STATES
   ═══════════════════════════════════════════════════════════════════ */

export const emptyState: CSSProperties = {
  padding: '48px 24px',
  textAlign: 'center',
  background: T.sage50,
  borderRadius: T.radius.xl,
  border: `1px dashed ${T.sage300}`,
  color: T.textSub,
};

export const emptyStateIcon: CSSProperties = {
  width: 48,
  height: 48,
  margin: '0 auto 14px',
  borderRadius: T.radius.lg,
  background: T.sage100,
  color: T.textMuted,
  display: 'grid',
  placeItems: 'center',
  fontSize: 22,
};

/* ═══════════════════════════════════════════════════════════════════
   ALERT / CALLOUT BLOCKS
   ═══════════════════════════════════════════════════════════════════ */

export const callout = (
  bg: string,
  color: string,
  border: string,
): CSSProperties => ({
  padding: '12px 16px',
  borderRadius: T.radius.md,
  background: bg,
  color,
  border: `1px solid ${border}`,
  fontSize: T.fs.body,
  fontWeight: T.fw.medium,
  lineHeight: T.lh.normal,
});

export const calloutDanger  = (text?: string): CSSProperties =>
  text ? { ...callout(T.dangerSoft, T.danger, T.dangerBorder) } : callout(T.dangerSoft, T.danger, T.dangerBorder);
export const calloutWarning = (): CSSProperties => callout(T.warningSoft, T.warning, T.warningBorder);
export const calloutInfo    = (): CSSProperties => callout(T.infoSoft, T.info, T.infoBorder);
export const calloutSuccess = (): CSSProperties => callout(T.successSoft, T.success, T.successBorder);

/* ═══════════════════════════════════════════════════════════════════
   PAGE-LEVEL PATTERNS
   ═══════════════════════════════════════════════════════════════════ */

/** Console page header — eyebrow + title + subtitle + actions row. */
export const pageHeader: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: T.sp[1],
  marginBottom: T.sp[5],
};

/** Console page header with right-aligned actions. */
export const pageHeaderRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: T.sp[4],
  marginBottom: T.sp[5],
  flexWrap: 'wrap',
};

/** Toolbar — pill-shaped action row above a list/table. */
export const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: T.sp[2],
  flexWrap: 'wrap',
};

/* ═══════════════════════════════════════════════════════════════════
   SECTION CARD (titled container)
   ═══════════════════════════════════════════════════════════════════ */

export const sectionCard: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: T.radius.xl,
  padding: T.sp[5],
  boxShadow: T.shadow.xs,
  display: 'flex',
  flexDirection: 'column',
  gap: T.sp[4],
};

export const sectionCardHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: T.sp[3],
  flexWrap: 'wrap',
};

export const sectionCardTitleGroup: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: T.sp[3],
  minWidth: 0,
};

export const sectionCardIcon: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: T.radius.md,
  background: T.primaryTint,
  color: T.primary,
  display: 'grid',
  placeItems: 'center',
  fontSize: 18,
  flexShrink: 0,
};

/* ═══════════════════════════════════════════════════════════════════
   LIST ITEM (queue row, search result, audit log entry, etc.)
   ═══════════════════════════════════════════════════════════════════ */

export const listItem: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  gap: T.sp[3],
  alignItems: 'center',
  padding: '14px 16px',
  borderRadius: T.radius.lg,
  background: T.sage50,
  border: `1px solid transparent`,
  transition: `background ${T.durBase} ${T.ease}, border-color ${T.durBase} ${T.ease}`,
};

export const listItemActive: CSSProperties = {
  ...listItem,
  background: T.primaryTint,
  borderColor: T.sage300,
};
