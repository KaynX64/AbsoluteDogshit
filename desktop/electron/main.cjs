// desktop/electron/main.cjs
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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
// PRINT HANDLER (Works without physical printer)
// -----------------------------------------------------------------------------
ipcMain.handle('print-document', async (event, { htmlContent }) => {
  let workerWin = new BrowserWindow({ show: false });
  await workerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  return new Promise((resolve) => {
    // silent: false opens the OS Print Dialog
    // You and your evaluators can select "Microsoft Print to PDF" or "Save as PDF"
    workerWin.webContents.print({ silent: false }, (success, failureReason) => {
      workerWin.close();
      if (!success) {
        resolve({ success: false, error: failureReason });
      } else {
        resolve({ success: true });
      }
    });
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});