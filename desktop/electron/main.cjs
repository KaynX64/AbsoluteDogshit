const { app, ipcMain } = require('electron');
const { sqliteDb, initLocalDatabase } = require('./offline/database.cjs');
const { registerOfflineHandlers } = require('./offline/registerHandlers.cjs');
const { registerUpdateHandlers } = require('./updates.cjs');
const { registerPrintHandler } = require('./printing.cjs');
const { registerNotificationHandler } = require('./notifications.cjs');
const { registerCertificatePolicy } = require('./certificatePolicy.cjs');
const { createWindow } = require('./window.cjs');

registerOfflineHandlers(ipcMain, sqliteDb);
registerUpdateHandlers(ipcMain);
registerPrintHandler(ipcMain);
registerNotificationHandler(ipcMain);
registerCertificatePolicy(app);

app.whenReady().then(() => {
  initLocalDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
