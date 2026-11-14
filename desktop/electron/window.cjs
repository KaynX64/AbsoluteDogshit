const { app, BrowserWindow, Menu, shell, session, nativeTheme, ipcMain } = require('electron');
const path = require('node:path');
const { VITE_URL, WINDOW_TITLE, TITLEBAR_HEIGHT, CUSTOM_TITLE_BAR } = require('./config.cjs');
const { setupAutoUpdater } = require('./updates.cjs');

/** Caption glyph color for the native window buttons, per Windows theme. */
function titleBarSymbolColor() {
  return nativeTheme.shouldUseDarkColors ? '#eef3ef' : '#1b2b22';
}

/**
 * App-drawn title strip. Windows never paints the system backdrop into the
 * native caption, so the caption is hidden and the renderer draws the title
 * text itself; Windows keeps drawing minimize/maximize/close over a
 * transparent overlay on top of that strip.
 */
const customTitleBarOptions = CUSTOM_TITLE_BAR
  ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: titleBarSymbolColor(),
        height: TITLEBAR_HEIGHT,
      },
      backgroundMaterial: 'acrylic',
      // Transparent window canvas so the acrylic backdrop shows through the
      // title strip (the renderer paints everything below it).
      backgroundColor: '#00000000',
    }
  : {};

function createWindow() {
  const isDev = !app.isPackaged;

  // The renderer needs the window chrome (title text + app-drawn title bar?)
  // before its first paint, so answer synchronously from the preload.
  ipcMain.on('window-chrome', (event) => {
    event.returnValue = {
      title: WINDOW_TITLE,
      customTitleBar: CUSTOM_TITLE_BAR,
      titleBarHeight: TITLEBAR_HEIGHT,
    };
  });

  const win = new BrowserWindow({
    title: WINDOW_TITLE,
    width: 1300,
    height: 880,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    show: false,
    ...customTitleBarOptions,
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
    win.setTitle(WINDOW_TITLE);
    win.show();
    win.focus();
    setupAutoUpdater(win);
  });

  if (CUSTOM_TITLE_BAR) {
    // Keep the native caption buttons readable when Windows flips theme.
    const syncTitleBarOverlay = () => {
      if (win.isDestroyed()) return;
      win.setTitleBarOverlay({
        color: '#00000000',
        symbolColor: titleBarSymbolColor(),
        height: TITLEBAR_HEIGHT,
      });
    };
    nativeTheme.on('updated', syncTitleBarOverlay);
    win.on('closed', () => nativeTheme.removeListener('updated', syncTitleBarOverlay));

    // Fullscreen hides the caption buttons, so the renderer drops the strip
    // to give the workspace the whole screen.
    const reportFullscreen = (isFullScreen) => win.webContents.send('window-fullscreen', isFullScreen);
    win.on('enter-full-screen', () => reportFullscreen(true));
    win.on('leave-full-screen', () => reportFullscreen(false));
  }

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
