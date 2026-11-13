const { Notification } = require('electron');

function registerNotificationHandler(ipcMain) {
  // 2. NOTIFICATION HANDLER
  ipcMain.handle('show-notification', (event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({
        title: title || 'LeoVital Alert',
        body: body || 'Notification from LeoVital HealthLink',
        urgency: 'critical',
      }).show();
      return { success: true };
    }
    return { success: false, error: 'Notifications not supported' };
  });
}

module.exports = { registerNotificationHandler };
