// desktop/src/theme/themedLogo.ts
//
// Valetudo HealthLink — theme-aware logo rendering.
//
// The brand mark (assets/valetudo_logo.png) is a two-tone PNG: a darker
// sage tone (~#264B39) and a lighter sage tone (~#788F7B). Rather than
// shipping one PNG per theme (six variants that drift from the source
// asset), the mark is recolored at runtime:
//
//   1. The source is decoded once and downscaled to a 512×512 canvas —
//      plenty for every render size in the app (largest is the login
//      watermark at ~430 CSS px).
//   2. Each opaque pixel is projected onto the dark→light source axis,
//      giving a blend factor t ∈ [0,1] (0 = dark tone, 1 = light tone).
//      Anti-aliased edges blend naturally; alpha is preserved verbatim.
//   3. The pixel is re-composited between the active theme's logoDark
//      and logoLight anchors and cached as a PNG data-URL keyed by
//      `${preset}:${mode}`.
//
// Result: the logo keeps its exact shape and internal shading while its
// colors follow the theme — pink tones under Blossom, honey/navy under
// Sunrise, brighter greens in dark mode.
//
// Failure safety: if decoding ever fails (corrupt asset, CSP), callers
// fall back to the original PNG URL — the UI never renders a broken img.

import valetudoLogoUrl from '../assets/valetudo_logo.png';
import { resolveThemeColors } from './presets';
import type { ThemePreset, ThemeMode } from './presets';
import { normalizeThemeMode, normalizeThemePreset } from './presets';

/** Render size of the recolored raster. 512 covers the login watermark. */
const RENDER_SIZE = 512;

/** Source-tone anchors, measured from the original mark. */
const SRC_DARK: readonly [number, number, number] = [38, 75, 57];    // #264B39
const SRC_LIGHT: readonly [number, number, number] = [120, 143, 123]; // #788F7B

/** Blend-axis pre-computation: light − dark and its squared length. */
const AXIS = {
  dr: SRC_LIGHT[0] - SRC_DARK[0],
  dg: SRC_LIGHT[1] - SRC_DARK[1],
  db: SRC_LIGHT[2] - SRC_DARK[2],
};
const AXIS_LEN_SQ = AXIS.dr * AXIS.dr + AXIS.dg * AXIS.dg + AXIS.db * AXIS.db;

/* ── Source decode (once) ─────────────────────────────────────────── */

interface SourceRaster {
  /** Normalized blend factor per pixel (0 = dark tone, 1 = light tone). */
  t: Float32Array;
  /** Original alpha channel per pixel (0–255). */
  a: Uint8ClampedArray;
  width: number;
  height: number;
}

let sourcePromise: Promise<SourceRaster | null> | null = null;

function decodeSource(): Promise<SourceRaster | null> {
  if (sourcePromise) return sourcePromise;
  sourcePromise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        // Scale the square mark down; keep aspect for non-square assets.
        const scale = Math.min(1, RENDER_SIZE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);

        const t = new Float32Array(w * h);
        const a = new Uint8ClampedArray(w * h);
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          a[p] = data[i + 3];
          if (data[i + 3] === 0) { t[p] = 0; continue; }
          // Project the pixel onto the dark→light source axis.
          const pr = data[i] - SRC_DARK[0];
          const pg = data[i + 1] - SRC_DARK[1];
          const pb = data[i + 2] - SRC_DARK[2];
          const dot = pr * AXIS.dr + pg * AXIS.dg + pb * AXIS.db;
          t[p] = AXIS_LEN_SQ > 0 ? Math.min(1, Math.max(0, dot / AXIS_LEN_SQ)) : 0;
        }
        resolve({ t, a, width: w, height: h });
      } catch (_) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = valetudoLogoUrl;
  });
  return sourcePromise;
}

/* ── Recolor + cache ──────────────────────────────────────────────── */

/** data-URL cache keyed by `${preset}:${mode}`. */
const themedCache = new Map<string, string>();

function cacheKey(preset: ThemePreset, mode: ThemeMode): string {
  return `${preset}:${mode}`;
}

function hexToRgbTriplet(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function recolor(
  source: SourceRaster,
  logoDark: string,
  logoLight: string,
): string {
  const [dr, dg, db] = hexToRgbTriplet(logoDark);
  const [lr, lg, lb] = hexToRgbTriplet(logoLight);

  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return valetudoLogoUrl;

  const out = ctx.createImageData(source.width, source.height);
  const n = source.width * source.height;
  for (let p = 0; p < n; p++) {
    const t = source.t[p];
    const i = p * 4;
    out.data[i]     = dr + (lr - dr) * t;
    out.data[i + 1] = dg + (lg - dg) * t;
    out.data[i + 2] = db + (lb - db) * t;
    out.data[i + 3] = source.a[p];
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Resolve the themed logo URL for a (preset, mode) pair.
 *
 * Returns the original PNG while the recolored variant is still being
 * prepared (first call per theme), then the cached data-URL forever
 * after. Callers re-render through the returned promise resolving to
 * the themed URL — see <ThemedLogo />.
 */
export function getThemedLogoUrl(preset: ThemePreset, mode: ThemeMode): string {
  const p = normalizeThemePreset(preset);
  const m = normalizeThemeMode(mode);
  const cached = themedCache.get(cacheKey(p, m));
  return cached ?? valetudoLogoUrl;
}

/**
 * Produce (or fetch from cache) the themed logo for a (preset, mode)
 * pair. Never rejects — resolves with the original PNG on any failure.
 */
export async function loadThemedLogo(preset: ThemePreset, mode: ThemeMode): Promise<string> {
  const p = normalizeThemePreset(preset);
  const m = normalizeThemeMode(mode);
  const key = cacheKey(p, m);

  const cached = themedCache.get(key);
  if (cached) return cached;

  const source = await decodeSource();
  if (!source) return valetudoLogoUrl;

  const colors = resolveThemeColors(p, m);
  const url = recolor(source, colors.logoDark, colors.logoLight);
  themedCache.set(key, url);
  return url;
}

/**
 * Warm the cache for a theme (e.g. right after login, before the user
 * opens settings) so the first switch renders instantly.
 */
export function prefetchThemedLogo(preset: ThemePreset, mode: ThemeMode): void {
  void loadThemedLogo(preset, mode).catch(() => {});
}

/** The untouched original asset — also the universal fallback. */
export { valetudoLogoUrl as originalLogoUrl };
