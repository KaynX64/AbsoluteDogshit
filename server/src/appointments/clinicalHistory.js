// Decodes stored dental charts and removes legacy inline chart data from encounter text.

import { decrypt } from '../utils/cryptoVault.js';

// Odontogram helpers
// Remove the legacy inline odontogram marker before displaying encounter text.
export function stripLegacyOdontogram(text) {
  return (text || '').replace(/\n*\[DENTAL ODONTOGRAM CHART\]:[^\n]*/g, '').trim();
}

// Decrypt and parse a saved chart, returning null for missing or unreadable data.
export function readDentalChart(cipher) {
  if (!cipher) return null;
  try { return JSON.parse(decrypt(cipher)); } catch { return null; }
}
