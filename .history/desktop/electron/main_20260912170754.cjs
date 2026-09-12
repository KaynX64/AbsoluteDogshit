const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true, // As specified in SADD Page 29
    },
  });

  // Load Vite Dev Server URL or Production Build
  const devUrl = 'http://localhost:5173';
  win.loadURL(devUrl);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});