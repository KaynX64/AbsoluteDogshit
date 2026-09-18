// desktop/electron/main.cjs
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 880,
    minWidth: 1024,
    minHeight: 720,
    show: false, // Don't show until ready to prevent white flash
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const devUrl = 'http://localhost:5173';
  win.loadURL(devUrl);

  // FIX: Force focus onto the window so input fields immediately capture keystrokes
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
}

// PRINT HANDLER (Native OS Print Spooler)
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});