// desktop/electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Printing & Notifications
  printDocument: (options) => ipcRenderer.invoke('print-document', options),
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),

  // SQLite Client Offline Sync API
  offlineQueueMutation: (mutation) => ipcRenderer.invoke('offline-queue-mutation', mutation),
  offlineGetPendingMutations: () => ipcRenderer.invoke('offline-get-pending-mutations'),
  offlineMarkSynced: (params) => ipcRenderer.invoke('offline-mark-synced', params),
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