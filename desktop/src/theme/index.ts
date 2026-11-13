// desktop/src/theme/index.ts
//
// Valetudo HealthLink — design-system presets.
//
// LIVE THEMING (Stage 7):
// The token object `T` and every composite style export below are now a
// *live view* over the active theme. Color properties are getters backed
// by the module-level `active` ThemeColors map, and composite presets
// (buttons, cards, list rows…) use getter-backed `liveObject()` styles.
//
// Why: ~1,400 render-time `T.*` color references across the consoles stay
// untouched — a theme switch swaps the active map, the app re-renders, and
// every inline style resolves the new palette automatically. AppShell
// consumes the theme context so console trees render after palette changes.
//
// Non-color scales (spacing, type, radii, motion) are theme-invariant and
// remain plain static values, exactly as before.
//
// The active theme is set by ThemeProvider (see ./ThemeProvider.tsx) via
// `setActiveTheme()`. Before React mounts, the default — brand light —
// matches the static tokens in tokens.css verbatim.

import type { CSSProperties } from 'react';
import {
  resolveThemeColors,
  shadowRecipe,
  normalizeThemeMode,
  normalizeThemePreset,
} from './presets';
import type { ThemeColors, ThemeMode, ThemePreset } from './presets';

/* ═══════════════════════════════════════════════════════════════════
   ACTIVE THEME STATE
   ═══════════════════════════════════════════════════════════════════ */

let activePreset: ThemePreset = 'brand';
let activeMode: ThemeMode = 'light';
let active: ThemeColors = resolveThemeColors('brand', 'light');
let activeShadows = shadowRecipe(active);

/** Snapshot of the currently applied theme (colors + selection). */
export function getActiveTheme(): { preset: ThemePreset; mode: ThemeMode; colors: ThemeColors } {
  return { preset: activePreset, mode: activeMode, colors: active };
}

/**
 * Swap the active theme. Values are normalized (invalid input falls back
 * to brand / light) so no caller can push an unknown palette into the DOM.
 * ThemeProvider is the only intended caller.
 */
export function setActiveTheme(preset: ThemePreset, mode: ThemeMode): void {
  activePreset = normalizeThemePreset(preset);
  activeMode = normalizeThemeMode(mode);
  active = resolveThemeColors(activePreset, activeMode);
  activeShadows = shadowRecipe(active);
}

/* ═══════════════════════════════════════════════════════════════════
   LIVE OBJECT HELPER
   ═══════════════════════════════════════════════════════════════════ */

/**
 * A getter-backed object over `build()`. Every property read re-resolves
 * against the factory, so objects built from theme colors never go stale
 * after a theme swap. Using ordinary accessors instead of a Proxy keeps
 * React/devtools object freezing and key enumeration safe.
 *
 * Use for module-level composite styles — reading them at render time
 * always yields the active theme's values:
 *
 *   const card = liveObject(() => ({ background: T.surface, ... }));
 *   … <div style={card} />  or  <div style={{ ...card, padding: 8 }} />
 */
export function liveObject<T extends object>(build: () => T): T {
  const live = {} as T;
  for (const key of Reflect.ownKeys(build())) {
    Object.defineProperty(live, key, {
      configurable: true,
      enumerable: true,
      get: () => Reflect.get(build(), key),
    });
  }
  return live;
}

/* ═══════════════════════════════════════════════════════════════════
   DESIGN TOKENS — live color view + static scales
   ═══════════════════════════════════════════════════════════════════ */

export const T = {
  // ── Brand ramp (live) ────────────────────────────────────────────
  get ink()          { return active.ink; },
  get primary()      { return active.primary; },
  get primaryDark()  { return active.primaryDark; },
  get primaryMid()   { return active.primaryMid; },
  get primarySoft()  { return active.primarySoft; },
  get primaryTint()  { return active.primaryTint; },
  get primary50()    { return active.primary50; },
  get primary100()   { return active.primary100; },

  // ── Surface ramp (live) ──────────────────────────────────────────
  get sage50()       { return active.sage50; },
  get sage100()      { return active.sage100; },
  get sage200()      { return active.sage200; },
  get sage300()      { return active.sage300; },
  get sage400()      { return active.sage400; },

  get surface()      { return active.surface; },
  get surfaceMuted() { return active.surfaceMuted; },
  get surface2()     { return active.surface2; },
  get surface3()     { return active.surface3; },
  get border()       { return active.border; },
  get borderSoft()   { return active.borderSoft; },
  get borderStrong() { return active.borderStrong; },

  // ── Text ramp (live) ─────────────────────────────────────────────
  get text()         { return active.text; },
  get textSub()      { return active.textSub; },
  get textMuted()    { return active.textMuted; },
  get textFaint()    { return active.textFaint; },
  get textOnPrimary(){ return active.primaryOn; },

  // ── Semantics (live) ─────────────────────────────────────────────
  get danger()       { return active.danger; },
  get textOnDanger() { return active.dangerOn; },
  get dangerSoft()   { return active.dangerSoft; },
  get dangerBorder() { return active.dangerBorder; },

  get warning()      { return active.warning; },
  get textOnWarning(){ return active.warningOn; },
  get warningSoft()  { return active.warningSoft; },
  get warningBorder(){ return active.warningBorder; },

  get info()         { return active.info; },
  get textOnInfo()   { return active.infoOn; },
  get infoSoft()     { return active.infoSoft; },
  get infoBorder()   { return active.infoBorder; },

  get success()      { return active.success; },
  get textOnSuccess(){ return active.successOn; },
  get successSoft()  { return active.successSoft; },
  get successBorder(){ return active.successBorder; },

  // ── Tonal accents (live) ─────────────────────────────────────────
  get tonalGreenBg() { return active.tonalGreenBg; }, get tonalGreenFg() { return active.tonalGreenFg; },
  get tonalBlueBg()  { return active.tonalBlueBg; },  get tonalBlueFg()  { return active.tonalBlueFg; },
  get tonalCreamBg() { return active.tonalCreamBg; }, get tonalCreamFg() { return active.tonalCreamFg; },
  get tonalLilacBg() { return active.tonalLilacBg; }, get tonalLilacFg() { return active.tonalLilacFg; },
  get tonalRoseBg()  { return active.tonalRoseBg; },  get tonalRoseFg()  { return active.tonalRoseFg; },
  get tonalTealBg()  { return active.tonalTealBg; },  get tonalTealFg()  { return active.tonalTealFg; },
  get tonalAmberBg() { return active.tonalAmberBg; }, get tonalAmberFg() { return active.tonalAmberFg; },

  // ── Spacing scale (static — theme-invariant) ─────────────────────
  sp: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40, 9: 48, 10: 64, 11: 80 },

  // ── Type scale (static) ──────────────────────────────────────────
  fs: {
    caption:  10.5, meta: 11.5, body: 13, bodyLg: 14, subtitle: 15,
    title:    17, titleLg: 20, h2: 22, h1: 26, display: 34, hero: 44,
  },
  lh: { tight: 1.1, snug: 1.3, normal: 1.5, relaxed: 1.65 },
  fw: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 },
  ls: { tight: -0.3, normal: 0, wide: 0.3, wider: 0.6, widest: 1.4 },

  radius: {
    xs: 6, sm: 9, md: 12, lg: 16, xl: 20, xxl: 26, pill: 999, circle: '50%',
  },

  // ── Elevation (live — ink + primary tints follow the theme) ──────
  get shadow() { return activeShadows; },

  // ── Motion primitives (static) ───────────────────────────────────
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

export const cardStyle: CSSProperties = liveObject(() => ({
  background: T.surface,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: T.borderSoft,
  borderRadius: T.radius.lg,
  boxShadow: T.shadow.xs,
}));

/** Card with slightly stronger elevation for primary content panels. */
export const cardElevated: CSSProperties = liveObject(() => ({
  background: T.surface,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: T.borderSoft,
  borderRadius: T.radius.xl,
  boxShadow: T.shadow.card,
}));

/** Inset panel inside a card (e.g. a stat block inside a section card). */
export const cardInset: CSSProperties = liveObject(() => ({
  background: T.surface2,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: T.borderSoft,
  borderRadius: T.radius.md,
}));

/** Page wrapper used by every console for consistent gutters. */
export const pageWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: T.sp[5],
};

/* ── Dividers ───────────────────────────────────────────────────── */

export const divider: CSSProperties = liveObject(() => ({
  height: 1,
  background: T.borderSoft,
  border: 'none',
  margin: 0,
}));

export const dividerVertical: CSSProperties = liveObject(() => ({
  width: 1,
  alignSelf: 'stretch',
  background: T.borderSoft,
  border: 'none',
}));

/* ═══════════════════════════════════════════════════════════════════
   TYPOGRAPHY PRESETS
   ═══════════════════════════════════════════════════════════════════ */

export const eyebrow: CSSProperties = liveObject(() => ({
  fontSize: T.fs.caption,
  fontWeight: T.fw.bold,
  letterSpacing: T.ls.widest,
  textTransform: 'uppercase',
  color: T.primarySoft,
  margin: 0,
}));

export const sectionTitle: CSSProperties = liveObject(() => ({
  fontSize: T.fs.caption,
  fontWeight: T.fw.bold,
  letterSpacing: T.ls.widest,
  textTransform: 'uppercase',
  color: T.textSub,
  margin: 0,
}));

export const sectionHeading: CSSProperties = liveObject(() => ({
  fontSize: T.fs.titleLg,
  fontWeight: T.fw.extrabold,
  letterSpacing: T.ls.tight,
  color: T.text,
  margin: 0,
}));

export const pageTitle: CSSProperties = liveObject(() => ({
  fontSize: T.fs.h1,
  fontWeight: T.fw.extrabold,
  letterSpacing: T.ls.tight,
  color: T.text,
  margin: 0,
}));

export const pageSub: CSSProperties = liveObject(() => ({
  fontSize: T.fs.subtitle,
  color: T.textSub,
  margin: '4px 0 0',
  lineHeight: T.lh.normal,
}));

export const bodyText: CSSProperties = liveObject(() => ({
  fontSize: T.fs.body,
  color: T.text,
  lineHeight: T.lh.normal,
  margin: 0,
}));

export const caption: CSSProperties = liveObject(() => ({
  fontSize: T.fs.caption,
  color: T.textMuted,
  lineHeight: T.lh.normal,
  margin: 0,
}));

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
    case 'DENTIST':             return pill(T.tonalTealBg, T.tonalTealFg);
    case 'NURSE':               return pill(T.tonalGreenBg, T.tonalGreenFg);
    case 'EMERGENCY_RESPONDER': return pill(T.tonalRoseBg, T.tonalRoseFg);
    case 'FACULTY':             return pill(T.tonalAmberBg, T.tonalAmberFg);
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

export const inputStyle: CSSProperties = liveObject(() => ({
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  fontSize: T.fs.body,
  color: T.text,
  background: T.surface,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: T.border,
  borderRadius: T.radius.md,
  outline: 'none',
  fontFamily: T.font,
  transition: `border-color ${T.durBase} ${T.ease}, box-shadow ${T.durBase} ${T.ease}`,
}));

/** Focus ring for inputs — resolved live so it tracks the active primary. */
export function getInputFocusRing(): string {
  return `0 0 0 4px ${rgba(T.primary, 0.10)}`;
}

/** Search input — pill shape, slightly smaller. */
export const searchInput: CSSProperties = liveObject(() => ({
  ...inputStyle,
  padding: '9px 16px 9px 36px',
  borderRadius: T.radius.pill,
  fontSize: T.fs.meta,
}));

/** Textarea variant. */
export const textareaStyle: CSSProperties = liveObject(() => ({
  ...inputStyle,
  padding: '12px 14px',
  minHeight: 88,
  resize: 'vertical',
  lineHeight: T.lh.normal,
  fontFamily: T.font,
}));

/* ═══════════════════════════════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════════════════════════════ */

const btnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: T.radius.pill,
  borderWidth: 0,
  borderStyle: 'none',
  borderColor: 'transparent',
  fontSize: T.fs.body,
  fontWeight: T.fw.bold,
  cursor: 'pointer',
  fontFamily: T.font,
  whiteSpace: 'nowrap',
  transition: `background ${T.durBase} ${T.ease}, box-shadow ${T.durBase} ${T.ease}, transform ${T.durFast} ${T.ease}, border-color ${T.durBase} ${T.ease}`,
};

export const btnPrimary: CSSProperties = liveObject(() => ({
  ...btnBase,
  padding: '10px 18px',
  background: T.primary,
  color: T.textOnPrimary,
  boxShadow: T.shadow.glowPrimary,
}));

export const btnGhost: CSSProperties = liveObject(() => ({
  ...btnBase,
  padding: '9px 16px',
  background: T.surface,
  color: T.text,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: T.border,
  fontWeight: T.fw.semibold,
}));

export const btnSubtle: CSSProperties = liveObject(() => ({
  ...btnGhost,
  background: T.sage100,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'transparent',
}));

/** Danger / destructive action button. */
export const btnDanger: CSSProperties = liveObject(() => ({
  ...btnBase,
  padding: '10px 18px',
  background: T.danger,
  color: T.textOnDanger,
  boxShadow: `0 10px 22px -14px ${rgba(T.danger, 0.55)}`,
}));

/** Success confirmation button. */
export const btnSuccess: CSSProperties = liveObject(() => ({
  ...btnBase,
  padding: '10px 18px',
  background: T.success,
  color: T.textOnSuccess,
  boxShadow: `0 10px 22px -14px ${rgba(T.success, 0.55)}`,
}));

/** Warning / caution button (used by emergency acknowledge). */
export const btnWarning: CSSProperties = liveObject(() => ({
  ...btnBase,
  padding: '10px 18px',
  background: T.warning,
  color: T.textOnWarning,
  boxShadow: `0 10px 22px -14px ${rgba(T.warning, 0.55)}`,
}));

/** Soft danger outline — secondary destructive action. */
export const btnGhostDanger: CSSProperties = liveObject(() => ({
  ...btnGhost,
  background: T.dangerSoft,
  color: T.danger,
  border: `1px solid ${T.dangerBorder}`,
}));

/** Soft success outline — secondary positive action. */
export const btnGhostSuccess: CSSProperties = liveObject(() => ({
  ...btnGhost,
  background: T.successSoft,
  color: T.success,
  border: `1px solid ${T.successBorder}`,
}));

/** Icon-only square button (38×38 default). */
export const iconBtn: CSSProperties = liveObject(() => ({
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
}));

/* ═══════════════════════════════════════════════════════════════════
   TABLES
   ═══════════════════════════════════════════════════════════════════ */

export const tableHeaderStyle: CSSProperties = liveObject(() => ({
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
}));

export const tableCellStyle: CSSProperties = liveObject(() => ({
  padding: '14px',
  fontSize: T.fs.body,
  color: T.text,
  borderBottom: `1px solid ${T.borderSoft}`,
  verticalAlign: 'middle',
}));

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

export const emptyState: CSSProperties = liveObject(() => ({
  padding: '48px 24px',
  textAlign: 'center',
  background: T.sage50,
  borderRadius: T.radius.xl,
  border: `1px dashed ${T.sage300}`,
  color: T.textSub,
}));

export const emptyStateIcon: CSSProperties = liveObject(() => ({
  width: 48,
  height: 48,
  margin: '0 auto 14px',
  borderRadius: T.radius.lg,
  background: T.sage100,
  color: T.textMuted,
  display: 'grid',
  placeItems: 'center',
  fontSize: 22,
}));

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

export const sectionCard: CSSProperties = liveObject(() => ({
  background: T.surface,
  border: `1px solid ${T.borderSoft}`,
  borderRadius: T.radius.xl,
  padding: T.sp[5],
  boxShadow: T.shadow.card,
  display: 'flex',
  flexDirection: 'column',
  gap: T.sp[4],
}));

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

export const sectionCardIcon: CSSProperties = liveObject(() => ({
  width: 40,
  height: 40,
  borderRadius: T.radius.md,
  background: T.primaryTint,
  color: T.primary,
  display: 'grid',
  placeItems: 'center',
  fontSize: 18,
  flexShrink: 0,
}));

/* ═══════════════════════════════════════════════════════════════════
   LIST ITEM (queue row, search result, audit log entry, etc.)
   ═══════════════════════════════════════════════════════════════════ */

export const listItem: CSSProperties = liveObject(() => ({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  gap: T.sp[3],
  alignItems: 'center',
  padding: '14px 16px',
  borderRadius: T.radius.lg,
  background: T.sage50,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'transparent',
  transition: `background ${T.durBase} ${T.ease}, border-color ${T.durBase} ${T.ease}`,
}));

export const listItemActive: CSSProperties = liveObject(() => ({
  ...listItem,
  background: T.primaryTint,
  borderColor: T.sage300,
}));
