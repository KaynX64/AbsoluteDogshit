// desktop/electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

/**
 * Window chrome resolved by the main process (title text, whether the app
 * must draw its own translucent title strip). Sandboxed preloads cannot require
 * local modules, hence the synchronous IPC read.
 */
function readWindowChrome() {
  try {
    return ipcRenderer.sendSync('window-chrome');
  } catch (_) {
    return { title: 'LeoVital HealthLink - PSU Lingayen Infirmary', customTitleBar: false, titleBarHeight: 0 };
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Window chrome
  windowChrome: readWindowChrome(),
  onFullScreenChange: (cb) => {
    const listener = (_e, isFullScreen) => cb(isFullScreen);
    ipcRenderer.on('window-fullscreen', listener);
    return () => ipcRenderer.removeListener('window-fullscreen', listener);
  },

  // Printing & Notifications
  printDocument: (options) => ipcRenderer.invoke('print-document', options),
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),

  // SQLite Client Offline Sync API
  offlineSetAccount: (id) => ipcRenderer.invoke('offline-set-account', id),
  offlineImportLegacy: (rows) => ipcRenderer.invoke('offline-import-legacy', rows),
  offlineUnassignedAppointments: () => ipcRenderer.invoke('offline-unassigned-appointments'),
  offlineAssignLegacy: (data) => ipcRenderer.invoke('offline-assign-legacy', data),
  offlinePendingCount: () => ipcRenderer.invoke('offline-pending-count'),
  offlineQueueMutation: (mutation) => ipcRenderer.invoke('offline-queue-mutation', mutation),
  offlineGetPendingMutations: (limit) => ipcRenderer.invoke('offline-get-pending-mutations', limit),
  offlineMarkSynced: (params) => ipcRenderer.invoke('offline-mark-synced', params),
  offlineMarkFailed: (params) => ipcRenderer.invoke('offline-mark-failed', params),
  offlineCacheBootstrap: (data) => ipcRenderer.invoke('offline-cache-bootstrap', data),
  offlineGetEmrHistory: (patientUserId) => ipcRenderer.invoke('offline-get-emr-history', patientUserId),
  offlineSearchPatients: (query) => ipcRenderer.invoke('offline-search-patients', query),
  
  // Auto-update
  onUpdateStatus: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});