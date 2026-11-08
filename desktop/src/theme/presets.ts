// desktop/src/theme/presets.ts
//
// Valetudo HealthLink — theme presets.
//
// The theme system separates two orthogonal axes:
//
//   • mode   — 'light' | 'dark'          (light is the default)
//   • preset — 'brand' | 'blossom' | 'sunrise'
//              brand   → the classic sage-green Valetudo identity
//              blossom → white-pink (soft rose on porcelain)
//              sunrise → yellow-blue (honey gold on warm cream / deep navy)
//
// Every (preset, mode) pair resolves to a complete ThemeColors map — one
// value for every design token in tokens.css plus the extra runtime keys
// the theme engine needs (logo anchors, rail veil, frosted glass).
// Seeds stay small: ramps and soft tints are *derived* with mix(), so a
// preset is described by a handful of anchor colors and stays readable.
//
// Validation is centralised here — every entry point (settings menu,
// localStorage boot, server responses) funnels through normalizeThemeMode /
// normalizeThemePreset so an unknown value can never reach the DOM.

/* ═══════════════════════════════════════════════════════════════════
   TYPES & WHITELISTS
   ═══════════════════════════════════════════════════════════════════ */

export type ThemeMode = 'light' | 'dark';
export type ThemePreset = 'brand' | 'blossom' | 'sunrise';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark'] as const;
export const THEME_PRESETS: readonly ThemePreset[] = ['brand', 'blossom', 'sunrise'] as const;

/** localStorage key for the locally cached theme selection. */
export const THEME_STORAGE_KEY = 'valetudo_theme';

/** Server column names kept in sync with server/src/db.js + schema.sql. */
export interface ThemeSelection {
  mode: ThemeMode;
  preset: ThemePreset;
}

/* ═══════════════════════════════════════════════════════════════════
   VALIDATORS — single source of truth for every entry point
   ═══════════════════════════════════════════════════════════════════ */

export function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === 'string' && (THEME_MODES as readonly string[]).includes(v);
}

export function isThemePreset(v: unknown): v is ThemePreset {
  return typeof v === 'string' && (THEME_PRESETS as readonly string[]).includes(v);
}

/** Clamp any unknown input to a legal mode (default light). */
export function normalizeThemeMode(v: unknown): ThemeMode {
  return isThemeMode(v) ? v : 'light';
}

/** Clamp any unknown input to a legal preset (default brand). */
export function normalizeThemePreset(v: unknown): ThemePreset {
  return isThemePreset(v) ? v : 'brand';
}

/** Validate + normalize an arbitrary { mode, preset } payload. */
export function normalizeThemeSelection(raw: unknown): ThemeSelection {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    mode: normalizeThemeMode(src.mode),
    preset: normalizeThemePreset(src.preset),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   COLOR MATH
   ═══════════════════════════════════════════════════════════════════ */

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/** Linear blend a → b by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/** Push a color toward white (t > 0) — used for soft fills on light mode. */
function tint(color: string, t: number): string {
  return mix(color, '#FFFFFF', t);
}

/** Push a color toward black (t > 0) — used to deepen accents. */
function shade(color: string, t: number): string {
  return mix(color, '#0A0A0A', t);
}

/* ═══════════════════════════════════════════════════════════════════
   THEME COLORS — full token map
   ═══════════════════════════════════════════════════════════════════ */

export interface ThemeColors {
  /* brand ramp */
  ink: string;
  primary: string;
  primaryOn: string;
  primaryDark: string;
  primaryMid: string;
  primarySoft: string;
  primaryTint: string;
  primary50: string;
  primary100: string;
  primaryRgb: string;         // "31,74,52" — for rgba() composition

  /* surface ramp (sage in brand, rose-tinted / cream-tinted elsewhere) */
  sage50: string;
  sage100: string;
  sage200: string;
  sage300: string;
  sage400: string;

  /* neutrals */
  surface: string;
  surfaceMuted: string;
  surface2: string;
  surface3: string;
  border: string;
  borderSoft: string;
  borderStrong: string;

  /* text */
  text: string;
  textSub: string;
  textMuted: string;
  textFaint: string;

  /* semantics (fg / soft bg / border) */
  danger: string;  dangerOn: string;  dangerSoft: string;  dangerBorder: string;
  warning: string; warningOn: string; warningSoft: string; warningBorder: string;
  info: string;    infoOn: string;    infoSoft: string;    infoBorder: string;
  success: string; successOn: string; successSoft: string; successBorder: string;

  /* tonal accents */
  tonalGreenBg: string;  tonalGreenFg: string;
  tonalBlueBg: string;   tonalBlueFg: string;
  tonalCreamBg: string;  tonalCreamFg: string;
  tonalLilacBg: string;  tonalLilacFg: string;
  tonalRoseBg: string;   tonalRoseFg: string;
  tonalTealBg: string;   tonalTealFg: string;
  tonalAmberBg: string;  tonalAmberFg: string;

  /* runtime extras (not part of the classic T token set) */
  logoDark: string;        // logo anchor for the mark's darker tone
  logoLight: string;       // logo anchor for the mark's lighter tone
  veilRgb: string;         // "226,235,225" — soft overlay on the dark rail
  glass: string;           // frosted-glass surface (top bar)
  glassStrong: string;     // frosted-glass surface (sticky headers, menus)
  bloom: string;           // soft light halo above the page canvas
  inkRgb: string;          // shadow ink as "r,g,b"
  colorScheme: 'light' | 'dark';
}

/* ═══════════════════════════════════════════════════════════════════
   PRESET SEEDS
   ═══════════════════════════════════════════════════════════════════ */

interface PresetSeed {
  /** Display name shown in the settings menu. */
  label: string;
  /** One-line description shown in the settings menu. */
  hint: string;
  /** Swatch pair for the preset picker (dark dot, light dot). */
  swatch: [string, string];
  light: {
    primary: string; ink: string;
    canvas: string;      // app background (sage-50 equivalent)
    canvasAlt: string;   // deeper canvas (sage-100 equivalent)
    surfaceTint: string;
    text: string;
    logoDark: string; logoLight: string;
  };
  dark: {
    primary: string; ink: string;
    canvas: string;      // dark app background
    canvasAlt: string;   // slightly lifted dark canvas
    surfaceTint: string; // hue for layered surfaces, coordinated to the preset
    text: string;
    logoDark: string; logoLight: string;
  };
}

export const PRESET_META: Record<ThemePreset, Omit<PresetSeed, 'light' | 'dark'>> = {
  brand: {
    label: 'Valetudo',
    hint: 'Classic sage green',
    swatch: ['#1F4A34', '#788F7B'],
  },
  blossom: {
    label: 'Blossom',
    hint: 'White & pink',
    swatch: ['#B44371', '#E7A7C4'],
  },
  sunrise: {
    label: 'Sunrise',
    hint: 'Yellow & blue',
    swatch: ['#B17D23', '#3E6FB0'],
  },
};

const PRESET_SEEDS: Record<ThemePreset, PresetSeed> = {
  /* ── Valetudo — the incumbent sage identity, values verbatim ── */
  brand: {
    ...PRESET_META.brand,
    light: {
      primary: '#1F4A34', ink: '#0F1E17',
      canvas: '#FAFBF9', canvasAlt: '#F2F5F0',
      surfaceTint: '#E8EFE6',
      text: '#1A1F1B',
      logoDark: '#264B39', logoLight: '#788F7B',
    },
    dark: {
      primary: '#82B49A', ink: '#E8EFE9',
      canvas: '#101813', canvasAlt: '#17221B',
      surfaceTint: '#294838',
      text: '#E4ECE6',
      logoDark: '#47745A', logoLight: '#A6C7AF',
    },
  },

  /* ── Blossom — porcelain white with a soft rose primary ── */
  blossom: {
    ...PRESET_META.blossom,
    light: {
      primary: '#B4437B', ink: '#200F18',
      canvas: '#FDF9FB', canvasAlt: '#FBF3F7',
      surfaceTint: '#F2E6ED',
      text: '#231118',
      logoDark: '#A63D70', logoLight: '#DE9CBE',
    },
    dark: {
      primary: '#D38BAF', ink: '#F3E8EE',
      canvas: '#171016', canvasAlt: '#211720',
      surfaceTint: '#462638',
      text: '#F0E7ED',
      logoDark: '#985875', logoLight: '#D9A5BD',
    },
  },

  /* ── Sunrise — honey gold on warm cream (light) / deep navy (dark),
       with a calm blue counter-accent ── */
  sunrise: {
    ...PRESET_META.sunrise,
    light: {
      primary: '#B17D23', ink: '#1D1608',
      canvas: '#FDFAF1', canvasAlt: '#F8F2E2',
      surfaceTint: '#F1EAD8',
      text: '#211A0D',
      logoDark: '#96721F', logoLight: '#E0C377',
    },
    dark: {
      primary: '#D6B05B', ink: '#EDF0F8',
      canvas: '#111722', canvasAlt: '#192231',
      surfaceTint: '#283E5B',
      text: '#E9EDF5',
      logoDark: '#94743B', logoLight: '#D9C17D',
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════
   BRAND LIGHT — exact incumbent tokens (tokens.css parity)
   ═══════════════════════════════════════════════════════════════════ */

const BRAND_LIGHT_EXACT: ThemeColors = {
  ink: '#0F1E17',
  primary: '#1F4A34',
  primaryOn: '#FFFFFF',
  primaryDark: '#153627',
  primaryMid: '#2E5C43',
  primarySoft: '#4A7A5E',
  primaryTint: '#E2EBE1',
  primary50: '#F4F7F2',
  primary100: '#E2EBE1',
  primaryRgb: '31,74,52',

  sage50: '#FAFBF9',
  sage100: '#F2F5F0',
  sage200: '#E5EBE3',
  sage300: '#C9D9C7',
  sage400: '#A3B3A1',

  surface: '#FFFFFF',
  surfaceMuted: '#FAFBF9',
  surface2: '#F4F7F2',
  surface3: '#EDF2EB',
  border: '#E1E6DF',
  borderSoft: '#EDEFE9',
  borderStrong: '#C5D0C0',

  text: '#1A1F1B',
  textSub: '#4A5A4D',
  textMuted: '#8A9990',
  textFaint: '#B7C0B5',

  danger: '#B43E32',  dangerOn: '#FFFFFF', dangerSoft: '#FCEBEA', dangerBorder: '#F0C5C0',
  warning: '#B8762A', warningOn: '#0F1E17', warningSoft: '#FBF1DD', warningBorder: '#F0D9A8',
  info: '#2A6FA8',    infoOn: '#FFFFFF', infoSoft: '#E6F0F8',    infoBorder: '#B5D2E8',
  success: '#2D7A4A', successOn: '#FFFFFF', successSoft: '#E0F0E5', successBorder: '#B5DCC1',

  tonalGreenBg: '#E5EFE2',  tonalGreenFg: '#2E5C43',
  tonalBlueBg: '#E0EAF2',   tonalBlueFg: '#2A5A75',
  tonalCreamBg: '#F2EBDA',  tonalCreamFg: '#7A6533',
  tonalLilacBg: '#E6E1EF',  tonalLilacFg: '#4F4170',
  tonalRoseBg: '#F2E0DC',   tonalRoseFg: '#8A4035',
  tonalTealBg: '#DDECE7',   tonalTealFg: '#2A6052',
  tonalAmberBg: '#F4E5C2',  tonalAmberFg: '#7A5A1E',

  logoDark: '#264B39',
  logoLight: '#788F7B',
  veilRgb: '226,235,225',
  glass: 'rgba(255, 255, 255, 0.82)',
  glassStrong: 'rgba(255, 255, 255, 0.96)',
  bloom: 'rgba(255, 255, 255, 0.85)',
  inkRgb: '15,30,23',
  colorScheme: 'light',
};

/* ═══════════════════════════════════════════════════════════════════
   DERIVATION — soft fills, borders and readable accents per mode
   ═══════════════════════════════════════════════════════════════════ */

/** Semantic pair derivation that adapts to the mode canvas. */
function semantic(
  base: string,
  canvas: string,
  dark: boolean,
): { fg: string; soft: string; border: string } {
  if (!dark) {
    return {
      fg: base,
      soft: tint(base, 0.9),
      border: tint(base, 0.72),
    };
  }
  // Dark mode: lift the foreground for contrast on dark surfaces and mix
  // the soft fill toward the dark canvas so chips stay muted, not neon.
  return {
    fg: tint(base, 0.58),
    soft: mix(tint(base, 0.18), canvas, 0.72),
    border: mix(tint(base, 0.30), canvas, 0.45),
  };
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Choose whichever of white or deep ink gives stronger text contrast. */
function onColor(background: string): string {
  const luminance = relativeLuminance(background);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const inkContrast = (luminance + 0.05) / (relativeLuminance('#0F1E17') + 0.05);
  return whiteContrast >= inkContrast ? '#FFFFFF' : '#0F1E17';
}

export function getTextColorOn(background: string): string {
  return onColor(background);
}

/** Resolve the complete token map for a (preset, mode) pair. */
export function resolveThemeColors(preset: ThemePreset, mode: ThemeMode): ThemeColors {
  const seed = PRESET_SEEDS[normalizeThemePreset(preset)];
  const dark = normalizeThemeMode(mode) === 'dark';
  const s = dark ? seed.dark : seed.light;

  // ── Brand light is the incumbent look — returned VERBATIM so the
  //    default theme is pixel-identical to the pre-theme token set.
  //    Derivation only runs for the other five (preset × mode) pairs.
  if (!dark && seed === PRESET_SEEDS.brand) {
    return { ...BRAND_LIGHT_EXACT };
  }

  const primary = s.primary;
  const canvas = s.canvas;
  const surfaceTint = s.surfaceTint;
  const darkSurface = (tintStrength: number, lift: number): string =>
    mix(mix(canvas, surfaceTint, tintStrength), '#FFFFFF', lift);
  const surface = dark ? darkSurface(0.30, 0.035) : '#FFFFFF';

  // Dark mode uses deep preset-tinted rails and surfaces instead of simply
  // shading the light accent toward black or lifting it toward white.
  const primaryDark = dark ? darkSurface(0.78, 0.015) : shade(primary, 0.22);
  const primaryMid = dark ? mix(surfaceTint, primary, 0.52) : tint(primary, 0.14);
  const primarySoft = dark ? tint(primary, 0.22) : tint(primary, 0.38);
  const primaryTint = dark ? darkSurface(0.42, 0.025) : tint(primary, 0.88);
  const [pr, pg, pb] = hexToRgb(primary);

  // Surface ramp — softly hue-tinted layers in dark mode, canvas-stepped
  // neutrals in light mode.
  const sage50 = canvas;
  const sage100 = dark ? darkSurface(0.38, 0.025) : s.canvasAlt;
  const sage200 = dark ? darkSurface(0.48, 0.055) : mix(s.canvasAlt, '#FFFFFF', 0.55);
  const sage300 = dark ? darkSurface(0.58, 0.09) : mix(s.canvasAlt, '#FFFFFF', 0.35);
  const sage400 = dark ? darkSurface(0.68, 0.14) : mix(s.canvasAlt, '#000000', 0.18);

  const surface2 = dark ? darkSurface(0.38, 0.04) : mix(s.canvasAlt, '#FFFFFF', 0.62);
  const surface3 = dark ? darkSurface(0.52, 0.065) : s.canvasAlt;

  const borderBase = dark ? darkSurface(0.64, 0.10) : mix(s.ink, canvas, 0.84);
  const border = borderBase;
  const borderSoft = dark ? darkSurface(0.42, 0.065) : mix(borderBase, canvas, 0.5);
  const borderStrong = dark ? darkSurface(0.76, 0.15) : mix(borderBase, s.ink, 0.28);

  // Text ramp.
  const text = s.text;
  const textSub = dark ? mix(text, canvas, 0.32) : mix(text, canvas, 0.34);
  const textMuted = dark ? mix(text, canvas, 0.52) : mix(text, canvas, 0.52);
  const textFaint = dark ? mix(text, canvas, 0.70) : mix(text, canvas, 0.72);

  // Semantics — anchored per preset family so chips keep their identity.
  const dangerAnchor = dark ? '#E58076' : '#B43E32';
  const warningAnchor = dark ? '#E0AC6A' : '#B8762A';
  const infoAnchor = seed === PRESET_SEEDS.sunrise && !dark ? '#2E5FA8' : dark ? '#7FADE0' : '#2A6FA8';
  const successAnchor = dark ? '#7CC49A' : '#2D7A4A';

  const d = semantic(dangerAnchor, canvas, dark);
  const w = semantic(warningAnchor, canvas, dark);
  const i = semantic(infoAnchor, canvas, dark);
  const g = semantic(successAnchor, canvas, dark);

  // Tonal accents — low-saturation chips, derived per mode.
  const tonal = (anchor: string): { bg: string; fg: string } => dark
    ? { bg: mix(tint(anchor, 0.16), canvas, 0.72), fg: tint(anchor, 0.52) }
    : { bg: tint(anchor, 0.88), fg: shade(anchor, 0.10) };

  const tGreen = tonal(dark ? '#6FA98A' : '#4C8A66');
  const tBlue = tonal(dark ? '#6E9CC9' : '#4A7FA8');
  const tCream = tonal(dark ? '#C9A96A' : '#A8873F');
  const tLilac = tonal(dark ? '#9D8FC4' : '#7A6BA8');
  const tRose = tonal(dark ? '#C97B8F' : '#A85A6B');
  const tTeal = tonal(dark ? '#6FB3A4' : '#3E8577');
  const tAmber = tonal(dark ? '#D0A959' : '#9A7420');

  const [vr, vg, vb] = hexToRgb(tint(primary, dark ? 0.66 : 0.88));
  const [ir, ig, ib] = hexToRgb(s.ink);

  return {
    ink: s.ink,
    primary,
    primaryOn: onColor(primary),
    primaryDark,
    primaryMid,
    primarySoft,
    primaryTint,
    primary50: dark ? darkSurface(0.24, 0.015) : tint(primary, 0.945),
    primary100: primaryTint,
    primaryRgb: `${pr},${pg},${pb}`,

    sage50, sage100, sage200, sage300, sage400,

    surface,
    surfaceMuted: dark ? mix(surface, canvas, 0.5) : mix(surface, canvas, 0.5),
    surface2,
    surface3,
    border,
    borderSoft,
    borderStrong,

    text, textSub, textMuted, textFaint,

    danger: d.fg, dangerOn: onColor(d.fg), dangerSoft: d.soft, dangerBorder: d.border,
    warning: w.fg, warningOn: onColor(w.fg), warningSoft: w.soft, warningBorder: w.border,
    info: i.fg, infoOn: onColor(i.fg), infoSoft: i.soft, infoBorder: i.border,
    success: g.fg, successOn: onColor(g.fg), successSoft: g.soft, successBorder: g.border,

    tonalGreenBg: tGreen.bg, tonalGreenFg: tGreen.fg,
    tonalBlueBg: tBlue.bg, tonalBlueFg: tBlue.fg,
    tonalCreamBg: tCream.bg, tonalCreamFg: tCream.fg,
    tonalLilacBg: tLilac.bg, tonalLilacFg: tLilac.fg,
    tonalRoseBg: tRose.bg, tonalRoseFg: tRose.fg,
    tonalTealBg: tTeal.bg, tonalTealFg: tTeal.fg,
    tonalAmberBg: tAmber.bg, tonalAmberFg: tAmber.fg,

    logoDark: s.logoDark,
    logoLight: s.logoLight,
    veilRgb: `${vr},${vg},${vb}`,
    glass: dark
      ? `rgba(${hexToRgb(darkSurface(0.34, 0.04)).join(',')}, 0.78)`
      : 'rgba(255, 255, 255, 0.82)',
    glassStrong: dark
      ? `rgba(${hexToRgb(darkSurface(0.48, 0.07)).join(',')}, 0.92)`
      : 'rgba(255, 255, 255, 0.96)',
    bloom: dark ? `rgba(${hexToRgb(surfaceTint).join(',')}, 0.16)` : 'rgba(255, 255, 255, 0.85)',
    inkRgb: `${ir},${ig},${ib}`,
    colorScheme: dark ? 'dark' : 'light',
  };
}

/* ═══════════════════════════════════════════════════════════════════
   CSS VARIABLE MAP — how ThemeColors lands on :root
   ═══════════════════════════════════════════════════════════════════ */

/** Token name → CSS custom property on documentElement. */
const CSS_VAR_MAP: Array<[keyof ThemeColors, string]> = [
  ['ink', '--ink'],
  ['primary', '--primary'],
  ['primaryOn', '--text-on-primary'],
  ['primaryDark', '--primary-dark'],
  ['primaryMid', '--primary-mid'],
  ['primarySoft', '--primary-soft'],
  ['primaryTint', '--primary-tint'],
  ['primary50', '--primary-50'],
  ['primary100', '--primary-100'],
  ['primaryRgb', '--primary-rgb'],

  ['sage50', '--sage-50'],
  ['sage100', '--sage-100'],
  ['sage200', '--sage-200'],
  ['sage300', '--sage-300'],
  ['sage400', '--sage-400'],

  ['surface', '--surface'],
  ['surfaceMuted', '--surface-muted'],
  ['surface2', '--surface-2'],
  ['surface3', '--surface-3'],
  ['border', '--border'],
  ['borderSoft', '--border-soft'],
  ['borderStrong', '--border-strong'],

  ['text', '--text'],
  ['textSub', '--text-sub'],
  ['textMuted', '--text-muted'],
  ['textFaint', '--text-faint'],

  ['danger', '--danger'],
  ['dangerOn', '--text-on-danger'],
  ['dangerSoft', '--danger-soft'],
  ['dangerBorder', '--danger-border'],
  ['warning', '--warning'],
  ['warningOn', '--text-on-warning'],
  ['warningSoft', '--warning-soft'],
  ['warningBorder', '--warning-border'],
  ['info', '--info'],
  ['infoOn', '--text-on-info'],
  ['infoSoft', '--info-soft'],
  ['infoBorder', '--info-border'],
  ['success', '--success'],
  ['successOn', '--text-on-success'],
  ['successSoft', '--success-soft'],
  ['successBorder', '--success-border'],

  ['tonalGreenBg', '--tonal-green'],
  ['tonalGreenFg', '--tonal-green-fg'],
  ['tonalBlueBg', '--tonal-blue'],
  ['tonalBlueFg', '--tonal-blue-fg'],
  ['tonalCreamBg', '--tonal-cream'],
  ['tonalCreamFg', '--tonal-cream-fg'],
  ['tonalLilacBg', '--tonal-lilac'],
  ['tonalLilacFg', '--tonal-lilac-fg'],
  ['tonalRoseBg', '--tonal-rose'],
  ['tonalRoseFg', '--tonal-rose-fg'],
  ['tonalTealBg', '--tonal-teal'],
  ['tonalTealFg', '--tonal-teal-fg'],
  ['tonalAmberBg', '--tonal-amber'],
  ['tonalAmberFg', '--tonal-amber-fg'],

  ['veilRgb', '--veil-rgb'],
  ['glass', '--glass'],
  ['glassStrong', '--glass-strong'],
  ['bloom', '--bloom'],
  ['inkRgb', '--ink-rgb'],
];

/** Build the style object applied to documentElement for a theme. */
export function themeCssVars(c: ThemeColors): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, cssVar] of CSS_VAR_MAP) {
    vars[cssVar] = c[key] as string;
  }
  // Derived composite: the soft brand tone as an rgb triplet so CSS can
  // build low-alpha tints (login card hover glow, card hairline) that
  // track the active preset/mode instead of a hard-coded sage.
  vars['--primary-soft-rgb'] = hexToRgb(c.primarySoft).join(',');
  return vars;
}

/** rgb anchors used to rebuild shadow tokens per theme. */
export function shadowRecipe(c: ThemeColors) {
  return {
    xs: `0 1px 2px rgba(${c.inkRgb}, 0.03)`,
    sm: `0 1px 2px rgba(${c.inkRgb}, 0.03), 0 1px 3px rgba(${c.inkRgb}, 0.04)`,
    md: `0 2px 6px rgba(${c.inkRgb}, 0.04), 0 4px 12px rgba(${c.inkRgb}, 0.05)`,
    lg: `0 4px 12px rgba(${c.inkRgb}, 0.06), 0 12px 24px rgba(${c.inkRgb}, 0.08)`,
    xl: `0 8px 20px rgba(${c.inkRgb}, 0.08), 0 24px 48px rgba(${c.inkRgb}, 0.10)`,
    primary: `0 2px 6px rgba(${c.primaryRgb}, 0.10), 0 6px 14px rgba(${c.primaryRgb}, 0.08)`,
    card: `0 1px 2px rgba(${c.inkRgb}, 0.03), 0 14px 32px -24px rgba(${c.inkRgb}, 0.28), 0 8px 18px -14px rgba(${c.inkRgb}, 0.12)`,
    modal: `0 1px 2px rgba(${c.inkRgb}, 0.03), 0 20px 44px -26px rgba(${c.inkRgb}, 0.42), 0 10px 22px -16px rgba(${c.inkRgb}, 0.16)`,
    glowPrimary: `0 12px 26px -16px rgba(${c.primaryRgb}, 0.65)`,
    glowPrimaryHover: `0 6px 18px rgba(${c.primaryRgb}, 0.22)`,
  };
}
