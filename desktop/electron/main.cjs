const { app, ipcMain, safeStorage } = require('electron');
const { openOfflineDatabase } = require('./offline/database.cjs');
const { registerOfflineHandlers } = require('./offline/registerHandlers.cjs');
const { registerUpdateHandlers } = require('./updates.cjs');
const { registerPrintHandler } = require('./printing.cjs');
const { registerNotificationHandler } = require('./notifications.cjs');
const { registerCertificatePolicy } = require('./certificatePolicy.cjs');
const { createWindow } = require('./window.cjs');

const path = require('node:path');

if (!app.requestSingleInstanceLock()) app.exit(0);
registerUpdateHandlers(ipcMain);
registerPrintHandler(ipcMain);
registerNotificationHandler(ipcMain);
registerCertificatePolicy(app);

app.whenReady().then(() => {
  registerOfflineHandlers(ipcMain, () =>
    openOfflineDatabase(path.join(app.getPath('userData'), 'valetudo_data'), safeStorage));
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
