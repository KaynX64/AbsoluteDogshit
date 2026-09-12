// desktop/electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printDocument: (options) => ipcRenderer.invoke('print-document', options),
});