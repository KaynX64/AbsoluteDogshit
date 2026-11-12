// ─────────────────────────────────────────────────────────────────────────
// PER-ACCOUNT UI THEME (Stage 7) — single server-side whitelist.
// Mirrors desktop/src/theme/presets.ts (THEME_MODES / THEME_PRESETS).
// Every write path (routes/profile/preferences.js PUT /theme) and read path (login
// response below) validates against these sets.
// ─────────────────────────────────────────────────────────────────────────
export const THEME_MODES = new Set(['light', 'dark']);
export const THEME_PRESETS = new Set(['brand', 'blossom', 'sunrise']);
