const { BrowserWindow } = require('electron');

function registerPrintHandler(ipcMain) {
  // 1. PRINT HANDLER
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
}

module.exports = { registerPrintHandler };
