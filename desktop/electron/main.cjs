// desktop/electron/main.cjs
const { app, BrowserWindow, ipcMain, Notification, Menu, shell, session } = require('electron');
const path = require('path');

// ── Unified backend configuration ───────────────────────────────────
// Reads desktop/app-config.json — the SINGLE source of truth for the
// backend host across the entire Electron app.
const appConfig = require('../app-config.json');

const API_BASE_URL = (appConfig.apiBaseUrl || 'https://localhost:5000').replace(/\/+$/, '');

// Derive WebSocket origin from the API URL scheme (https → wss, http → ws)
const API_WS_URL = API_BASE_URL
  .replace(/^https:/, 'wss:')
  .replace(/^http:/, 'ws:');

// Vite dev server origin (hardcoded — only used in development)
const VITE_URL = 'https://127.0.0.1:5173';
const VITE_WS_URL = 'wss://127.0.0.1:5173';

function createWindow() {
  const isDev = !app.isPackaged; // true during `npm run dev`, false in packaged .exe

  const win = new BrowserWindow({
    title: 'Valetudo HealthLink',
    width: 1300,
    height: 880,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true, // Hides the top menu bar
    show: false,           // Prevent white flash before content loads
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Hard-disable DevTools in packaged/production builds.
      // Still allowed during development so you can inspect state.
      devTools: isDev,
    },
  });

  // Completely removes the "File", "Edit", "View", "Window" menu bar
  win.removeMenu();
  Menu.setApplicationMenu(null);

  // ── Camera permission handlers (infirmary QR intake scanner) ────────────
  // Electron denies media permissions by default. The QrIntakeScanner uses
  // navigator.mediaDevices.getUserMedia, which will silently fail without
  // these two handlers. Windows Privacy settings must also allow camera
  // access for desktop apps.
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission === 'media' || permission === 'camera' || permission === 'mediaKeySystem') {
        return callback(true);
      }
      callback(false);
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => {
      if (permission === 'media') return true;
      return false;
    }
  );

  if (isDev) {
    // Development: load from the Vite dev server (HTTPS + HMR)
    win.loadURL(VITE_URL);
  } else {
    // Production: load the built static bundle
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Focus window on startup and ensure clean title
  win.once('ready-to-show', () => {
    win.setTitle('Valetudo HealthLink - PSU Lingayen Infirmary');
    win.show();
    win.focus();
  });

  // ── DevTools Shortcut Guard ──────────────────────────────────────────────
  // In development:  allow F12 / Ctrl+Shift+I to toggle DevTools (helpful).
  // In production:   swallow every known DevTools shortcut.
  win.webContents.on('before-input-event', (event, input) => {
    const key = (input.key || '').toLowerCase();

    const isDevToolsShortcut =
      input.key === 'F12' ||                            // Windows/Linux
      (input.control && input.shift && key === 'i') ||  // Ctrl+Shift+I
      (input.control && input.shift && key === 'j') ||  // Ctrl+Shift+J (console)
      (input.control && input.shift && key === 'c') ||  // Ctrl+Shift+C (inspect)
      (input.meta && input.alt && key === 'i') ||       // Cmd+Opt+I (macOS)
      (input.meta && input.alt && key === 'j') ||       // Cmd+Opt+J (macOS)
      (input.meta && input.alt && key === 'c');         // Cmd+Opt+C (macOS)

    if (!isDevToolsShortcut) return;

    if (isDev) {
      // Toggle DevTools normally during development
      win.webContents.toggleDevTools();
    }
    // Always prevent the shortcut from bubbling further.
    event.preventDefault();
  });

  // Belt-and-braces: if DevTools somehow opens, close it in production
  win.webContents.on('devtools-opened', () => {
    if (!isDev) {
      win.webContents.closeDevTools();
    }
  });

  // Security hardening: never spawn new Electron windows from arbitrary URLs.
  // BUT — allow http(s) links to open in the OS default browser
  // (Google Maps, doc verification URLs, external tools).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url).catch((err) => {
        console.error('[main.cjs] Failed to open external URL:', err.message);
      });
    }
    return { action: 'deny' };
  });
}

// 1. PRINT HANDLER (Native OS Print Spooler)
ipcMain.handle('print-document', async (event, { htmlContent }) => {
  let workerWin = new BrowserWindow({ show: false });
  await workerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  return new Promise((resolve) => {
    workerWin.webContents.print({ silent: false }, (success, failureReason) => {
      if (!success) {
        resolve({ success: false, error: failureReason });
      } else {
        resolve({ success: true });
      }
      setTimeout(() => {
        if (!workerWin.isDestroyed()) workerWin.close();
      }, 500);
    });
  });
});

// 2. NATIVE OS NOTIFICATION HANDLER
ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'Valetudo Alert',
      body: body || 'Notification from Valetudo HealthLink',
      urgency: 'critical',
    }).show();
    return { success: true };
  }
  return { success: false, error: 'Notifications not supported on this OS' };
});

// 3. ALLOW SELF-SIGNED CERTIFICATES (Backend API + Vite Dev Server)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (
    // Backend API (Express & Socket.IO) — origin from app-config.json
    url.startsWith(API_BASE_URL) ||
    url.startsWith(API_WS_URL) ||
    // Frontend Dev Server (Vite & HMR WebSocket)
    url.startsWith(VITE_URL) ||
    url.startsWith(VITE_WS_URL) ||
    // Fallback: localhost variants (helps with mixed http/https schemes)
    url.startsWith('https://localhost:5173') ||
    url.startsWith('https://127.0.0.1:5173') ||
    url.startsWith('wss://localhost:5173') ||
    url.startsWith('wss://127.0.0.1:5173')
  ) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});