// desktop/electron/config.cjs
const appConfig = require('../app-config.json');

const API_BASE_URL = (appConfig.apiBaseUrl || 'https://localhost:5000').replace(/\/+$/, '');
const VITE_URL = 'https://127.0.0.1:5173';
const WINDOWS_APP_ID = 'com.psu.valetudo.desktop';

/** Native window title — also rendered by the app-drawn title strip. */
const WINDOW_TITLE = 'LeoVital HealthLink - PSU Lingayen Infirmary';

/** Height (DIP) of the app-drawn title strip; must match --titlebar-h in CSS. */
const TITLEBAR_HEIGHT = 34;

/**
 * The DWM system backdrop (Acrylic) needs Windows 11 22H2+, build 22621. Only
 * then can the title bar be drawn by the app with the wallpaper-tinted
 * material behind it; older builds keep the native caption.
 */
function supportsSystemBackdrop() {
  if (process.platform !== 'win32') return false;
  // Plain Node (unit tests) has no Electron process helpers.
  if (typeof process.getSystemVersion !== 'function') return false;
  const build = Number(String(process.getSystemVersion() || '').split('.')[2]);
  return Number.isFinite(build) && build >= 22621;
}

module.exports = {
  API_BASE_URL,
  VITE_URL,
  WINDOWS_APP_ID,
  WINDOW_TITLE,
  TITLEBAR_HEIGHT,
  CUSTOM_TITLE_BAR: supportsSystemBackdrop(),
};
