// desktop/electron/main.cjs
const { app, BrowserWindow, ipcMain, Notification, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    title: 'Valetudo HealthLink', // Changes "desktop" to the actual app name
    width: 1300,
    height: 880,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,       // Hides the top menu bar
    show: false,                 // Prevent white flash before content loads
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Completely removes the "File", "Edit", "View", "Window" menu bar
  win.removeMenu();
  Menu.setApplicationMenu(null);

  // Use HTTPS on 127.0.0.1 to match Vite's host
  const devUrl = 'https://127.0.0.1:5173';
  win.loadURL(devUrl);

  // Focus window on startup and ensure clean title
  win.once('ready-to-show', () => {
    win.setTitle('Valetudo HealthLink - PSU Lingayen Infirmary');
    win.show();
    win.focus();
  });

  // Keep F12 and Ctrl + Shift + I available for DevTools anytime
  win.webContents.on('before-input-event', (event, input) => {
    if (
      input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i')
    ) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
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

// 3. ALLOW SELF-SIGNED CERTIFICATES (Backend Port 5000 & Vite Dev Port 5173)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (
    // Backend API (Express & Socket.IO)
    url.startsWith('https://localhost:5000') ||
    url.startsWith('https://127.0.0.1:5000') ||
    url.startsWith('wss://localhost:5000') ||
    url.startsWith('wss://127.0.0.1:5000') ||
    // Frontend Dev Server (Vite & HMR WebSocket)
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