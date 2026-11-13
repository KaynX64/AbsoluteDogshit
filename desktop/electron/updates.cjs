const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

function setupAutoUpdater(win) {
  if (!app.isPackaged) return; // updater only runs in installed builds

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (payload) => {
    if (!win.isDestroyed()) win.webContents.send('update-status', payload);
  };

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => send({ state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => send({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => send({ state: 'downloaded', version: i.version }));
  autoUpdater.on('error', (e) => send({ state: 'error', message: String((e && e.message) || e) }));

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 60 * 60 * 1000); // re-check every 4 hours
}

function registerUpdateHandlers(ipcMain) {
  ipcMain.handle('install-update', () => { autoUpdater.quitAndInstall(true, true); });
  ipcMain.handle('get-app-version', () => app.getVersion());
}

module.exports = { setupAutoUpdater, registerUpdateHandlers };
