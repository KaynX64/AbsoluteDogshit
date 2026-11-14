const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('node:path');
const { VITE_URL } = require('./config.cjs');
const { setupAutoUpdater } = require('./updates.cjs');

function createWindow() {
  const isDev = !app.isPackaged;

  const win = new BrowserWindow({
    title: 'LeoVital HealthLink',
    width: 1300,
    height: 880,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: isDev,
    },
  });

  win.removeMenu();
  Menu.setApplicationMenu(null);

  // Camera permissions for QR intake scanner
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'camera') return callback(true);
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media';
  });

  if (isDev) {
    win.loadURL(VITE_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => {
    win.setTitle('LeoVital HealthLink - PSU Lingayen Infirmary');
    win.show();
    win.focus();
    setupAutoUpdater(win);
  });

  win.webContents.on('before-input-event', (event, input) => {
    const key = (input.key || '').toLowerCase();
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
      return;
    }
    const isDevTools = input.key === 'F12' || (input.control && input.shift && key === 'i');
    if (isDevTools) {
      if (isDev) win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.webContents.on('devtools-opened', () => {
    if (!isDev) win.webContents.closeDevTools();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

    // Auto-download PDFs straight to the user's Downloads folder
  win.webContents.session.on('will-download', (event, item, webContents) => {
    const suggested = item.getFilename() || 'valetudo-document.pdf';
    const savePath = path.join(app.getPath('downloads'), suggested);
    item.setSavePath(savePath);

    item.once('done', (evt, state) => {
      if (state === 'completed') {
        shell.showItemInFolder(savePath);
      }
    });
  });
}

module.exports = { createWindow };
