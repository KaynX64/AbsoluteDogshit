const { app } = require('electron');

function setupAutoUpdater(win) {
  if (!app.isPackaged) return; // updater only runs in installed builds

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (payload) => {
    if (!win.isDestroyed()) win.webContents.send('update-status', payload);
  };

  const listeners = [];
  const listen = (event, callback) => {
    listeners.push([event, callback]);
    autoUpdater.on(event, callback);
  };
  listen('checking-for-update', () => send({ state: 'checking' }));
  listen('update-available', (i) => send({ state: 'available', version: i.version }));
  listen('update-not-available', () => send({ state: 'none' }));
  listen('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  listen('update-downloaded', (i) => send({ state: 'downloaded', version: i.version }));
  listen('error', (e) => send({ state: 'error', message: String((e && e.message) || e) }));

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  const interval = setInterval(check, 4 * 60 * 60 * 1000); // re-check every 4 hours
  win.once('closed', () => {
    clearInterval(interval);
    for (const [event, callback] of listeners) autoUpdater.removeListener(event, callback);
  });
}

function registerUpdateHandlers(ipcMain) {
  ipcMain.handle('install-update', () => { if (app.isPackaged) require('electron-updater').autoUpdater.quitAndInstall(true, true); });
  ipcMain.handle('get-app-version', () => app.getVersion());
}

module.exports = { setupAutoUpdater, registerUpdateHandlers };
