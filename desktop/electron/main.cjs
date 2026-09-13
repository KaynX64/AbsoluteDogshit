// desktop/electron/main.cjs (Line 1)
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'), // <-- LOAD PRELOAD
    },
  });

  const devUrl = 'http://localhost:5173';
  win.loadURL(devUrl);
}

// -----------------------------------------------------------------------------
// PRINT HANDLER (Opens OS Print Preview Dialog)
// -----------------------------------------------------------------------------
ipcMain.handle('print-document', async (event, { htmlContent }) => {
  let workerWin = new BrowserWindow({ show: false });
  await workerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  return new Promise((resolve) => {
    // silent: false opens the native OS print preview dialog window
    workerWin.webContents.print({ silent: false }, (success, failureReason) => {
      if (!success) {
        resolve({ success: false, error: failureReason });
      } else {
        resolve({ success: true });
      }
      
      // Safely close the hidden worker window after a tiny delay to prevent freezing
      setTimeout(() => {
        if (!workerWin.isDestroyed()) {
          workerWin.close();
        }
      }, 500);
    });
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

