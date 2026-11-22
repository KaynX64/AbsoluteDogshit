const { app, ipcMain, safeStorage } = require('electron');
const { openOfflineDatabase } = require('./offline/database.cjs');
const { registerOfflineHandlers } = require('./offline/registerHandlers.cjs');
const { registerUpdateHandlers } = require('./updates.cjs');
const { registerPrintHandler } = require('./printing.cjs');
const { registerNotificationHandler } = require('./notifications.cjs');
const { registerCertificatePolicy } = require('./certificatePolicy.cjs');
const { createWindow } = require('./window.cjs');

const path = require('node:path');
const { getWindowsAppId } = require('./config.cjs');

// Keep Chromium's hardware path available before it initializes the GPU.
for (const flag of ['disable-gpu', 'disable-gpu-compositing', 'disable-gpu-rasterization']) {
  app.commandLine.removeSwitch(flag);
}

if (!app.requestSingleInstanceLock()) app.exit(0);

let lastCompositingStatus;
app.on('gpu-info-update', () => {
  const status = app.getGPUFeatureStatus().gpu_compositing;
  if (status === lastCompositingStatus) return;
  lastCompositingStatus = status;
  if (!status?.startsWith('enabled')) {
    console.warn(`[graphics] Hardware compositing unavailable (${status ?? 'unknown'}).`);
  }
});

if (process.platform === 'win32') app.setAppUserModelId(getWindowsAppId(app.isPackaged));
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
