import { decrypt } from '../../utils/cryptoVault.js';

// Odontogram helpers
export function stripLegacyOdontogram(text) {
  return (text || '').replace(/\n*\[DENTAL ODONTOGRAM CHART\]:[^\n]*/g, '').trim();
}

export function readDentalChart(cipher) {
  if (!cipher) return null;
  try { return JSON.parse(decrypt(cipher)); } catch { return null; }
}
