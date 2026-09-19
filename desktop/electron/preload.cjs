// desktop/electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printDocument: (options) => ipcRenderer.invoke('print-document', options),
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),
});