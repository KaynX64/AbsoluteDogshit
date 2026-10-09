// desktop/electron/main.cjs
const { app, BrowserWindow, ipcMain, Notification, Menu, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// ── Unified backend configuration ───────────────────────────────────
const appConfig = require('../app-config.json');

const API_BASE_URL = (appConfig.apiBaseUrl || 'https://localhost:5000').replace(/\/+$/, '');
const API_WS_URL = API_BASE_URL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
const VITE_URL = 'https://127.0.0.1:5173';
const VITE_WS_URL = 'wss://127.0.0.1:5173';

// =====================================================================
// EMBEDDED SQLITE STORAGE LAYER (Local Clinic Workstation DB)
// =====================================================================
let sqliteDb = null;
const dbDir = path.join(app.getPath('userData'), 'valetudo_data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, 'valetudo_offline.db');

try {
  // Use Node.js native embedded SQLite (Node 22+ / Electron 32+)
  const { DatabaseSync } = require('node:sqlite');
  sqliteDb = new DatabaseSync(dbPath);
  console.log('✅ [SQLite] Embedded database initialized at:', dbPath);
} catch (err) {
  console.warn('⚠️ [SQLite] node:sqlite unavailable; using persistent fallback storage:', err.message);
}

// Initialize SQLite Schema
function initLocalDatabase() {
  if (!sqliteDb) return;

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS LOCAL_SYNC_LOGS (
      sync_id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_mutation_id TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      device_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      record_uuid TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      local_version INTEGER NOT NULL DEFAULT 1,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS CACHED_PATIENTS (
      user_id INTEGER PRIMARY KEY,
      student_no TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      course TEXT,
      year_level INTEGER,
      blood_type TEXT,
      allergies TEXT,
      chronic_conditions TEXT,
      cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS CACHED_EMR_RECORDS (
      record_uuid TEXT PRIMARY KEY,
      emr_id INTEGER,
      patient_user_id INTEGER NOT NULL,
      doctor_user_id INTEGER NOT NULL,
      doctor_name TEXT,
      encounter_date TEXT NOT NULL,
      chief_complaint TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      treatment_plan TEXT,
      notes TEXT,
      vitals_json TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      is_draft INTEGER NOT NULL DEFAULT 0,
      cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sync_status ON LOCAL_SYNC_LOGS (sync_status);
    CREATE INDEX IF NOT EXISTS idx_emr_patient ON CACHED_EMR_RECORDS (patient_user_id);
  `);
}

// ── IPC Handlers for SQLite Offline Sync ──────────────────────────────
ipcMain.handle('offline-queue-mutation', async (event, mutation) => {
  if (!sqliteDb) return { success: false, error: 'Database not initialized' };
  try {
    const stmt = sqliteDb.prepare(`
      INSERT INTO LOCAL_SYNC_LOGS 
        (client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    stmt.run(
      mutation.client_mutation_id,
      mutation.user_id || 0,
      mutation.device_id || 'CLINIC-DESKTOP',
      mutation.table_name,
      mutation.record_uuid,
      mutation.action,
      JSON.stringify(mutation.payload),
      mutation.local_version || 1
    );

    // If writing an EMR encounter offline, store locally in EMR cache as an offline draft
    if (mutation.table_name === 'EMR_RECORDS' && mutation.action === 'CREATE') {
      const p = mutation.payload;
      const emrStmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO CACHED_EMR_RECORDS
          (record_uuid, patient_user_id, doctor_user_id, doctor_name, encounter_date, chief_complaint, diagnosis, treatment_plan, notes, vitals_json, is_draft)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 1)
      `);
      emrStmt.run(
        mutation.record_uuid,
        p.patient_user_id,
        mutation.user_id || 0,
        'Attending Physician (Offline)',
        p.chief_complaint,
        p.diagnosis,
        p.treatment_plan || '',
        p.notes || '',
        JSON.stringify(p.vitals || {})
      );
    }

    return { success: true };
  } catch (err) {
    console.error('[SQLite Queue Error]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('offline-get-pending-mutations', async () => {
  if (!sqliteDb) return [];
  try {
    const stmt = sqliteDb.prepare(`
      SELECT client_mutation_id, user_id, device_id, table_name, record_uuid, action, payload, local_version, created_at
      FROM LOCAL_SYNC_LOGS 
      WHERE sync_status = 'pending'
      ORDER BY sync_id ASC
    `);
    const rows = stmt.all();
    return rows.map((r) => ({
      ...r,
      payload: JSON.parse(r.payload),
    }));
  } catch (err) {
    console.error('[SQLite Pending Error]:', err);
    return [];
  }
});

ipcMain.handle('offline-mark-synced', async (event, { client_mutation_id, server_record_id }) => {
  if (!sqliteDb) return { success: false };
  try {
    const stmt = sqliteDb.prepare(`
      UPDATE LOCAL_SYNC_LOGS 
      SET sync_status = 'synced', record_id = ?, synced_at = CURRENT_TIMESTAMP
      WHERE client_mutation_id = ?
    `);
    stmt.run(server_record_id || null, client_mutation_id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('offline-cache-bootstrap', async (event, { patients, emrRecords }) => {
  if (!sqliteDb) return { success: false };
  try {
    if (Array.isArray(patients)) {
      const pStmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO CACHED_PATIENTS
          (user_id, student_no, first_name, last_name, email, phone, course, year_level, blood_type, allergies, chronic_conditions, cached_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      for (const p of patients) {
        pStmt.run(
          p.user_id, p.student_no, p.first_name, p.last_name, p.email,
          p.phone, p.course, p.year_level, p.blood_type, p.allergies, p.chronic_conditions
        );
      }
    }

    if (Array.isArray(emrRecords)) {
      const eStmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO CACHED_EMR_RECORDS
          (record_uuid, emr_id, patient_user_id, doctor_user_id, doctor_name, encounter_date, chief_complaint, diagnosis, treatment_plan, notes, vitals_json, is_draft, cached_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
      `);
      for (const e of emrRecords) {
        eStmt.run(
          e.record_uuid || `SRV-${e.emr_id}`,
          e.emr_id,
          e.patient_user_id,
          e.doctor_user_id,
          e.doctor_name || 'Clinic Physician',
          e.encounter_date,
          e.chief_complaint,
          e.diagnosis,
          e.treatment_plan || '',
          e.notes || '',
          JSON.stringify(e.vitals || {})
        );
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[SQLite Bootstrap Error]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('offline-get-emr-history', async (event, patientUserId) => {
  if (!sqliteDb) return [];
  try {
    const stmt = sqliteDb.prepare(`
      SELECT record_uuid, emr_id, patient_user_id, doctor_name, encounter_date, chief_complaint, diagnosis, treatment_plan, notes, vitals_json, is_draft
      FROM CACHED_EMR_RECORDS
      WHERE patient_user_id = ?
      ORDER BY encounter_date DESC
    `);
    const rows = stmt.all(Number(patientUserId));
    return rows.map((r) => ({
      ...r,
      vitals: r.vitals_json ? JSON.parse(r.vitals_json) : {},
    }));
  } catch (err) {
    console.error('[SQLite EMR Fetch Error]:', err);
    return [];
  }
});

ipcMain.handle('offline-search-patients', async (event, query) => {
  if (!sqliteDb) return [];
  try {
    const q = `%${(query || '').trim()}%`;
    const stmt = sqliteDb.prepare(`
      SELECT user_id, student_no, first_name, last_name, email, phone, course, blood_type, allergies, chronic_conditions
      FROM CACHED_PATIENTS
      WHERE student_no LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
      LIMIT 25
    `);
    return stmt.all(q, q, q, q);
  } catch (err) {
    return [];
  }
});

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

ipcMain.handle('install-update', () => { autoUpdater.quitAndInstall(true, true); });
ipcMain.handle('get-app-version', () => app.getVersion());

function createWindow() {
  const isDev = !app.isPackaged;

  initLocalDatabase();

  const win = new BrowserWindow({
    title: 'Valetudo HealthLink',
    width: 1300,
    height: 880,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: isDev,
    },
  });

  win.removeMenu();
  Menu.setApplicationMenu(null);

  // Camera permissions for QR intake scanner
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'camera') return callback(true);
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media';
  });

  if (isDev) {
    win.loadURL(VITE_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => {
    win.setTitle('Valetudo HealthLink - PSU Lingayen Infirmary');
    win.show();
    win.focus();
    setupAutoUpdater(win);
  });

  win.webContents.on('before-input-event', (event, input) => {
    const key = (input.key || '').toLowerCase();
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
      return;
    }
    const isDevTools = input.key === 'F12' || (input.control && input.shift && key === 'i');
    if (isDevTools) {
      if (isDev) win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.webContents.on('devtools-opened', () => {
    if (!isDev) win.webContents.closeDevTools();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

    // Auto-download PDFs straight to the user's Downloads folder
  win.webContents.session.on('will-download', (event, item, webContents) => {
    const suggested = item.getFilename() || 'valetudo-document.pdf';
    const savePath = path.join(app.getPath('downloads'), suggested);
    item.setSavePath(savePath);

    item.once('done', (evt, state) => {
      if (state === 'completed') {
        shell.showItemInFolder(savePath);
      }
    });
  });
}

// 1. PRINT HANDLER
ipcMain.handle('print-document', async (event, { htmlContent }) => {
  let workerWin = new BrowserWindow({ show: false });
  await workerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  return new Promise((resolve) => {
    workerWin.webContents.print({ silent: false }, (success, failureReason) => {
      if (!success) {
        resolve({ success: false, error: failureReason });
      } else {
        resolve({ success: true });
      }
      setTimeout(() => {
        if (!workerWin.isDestroyed()) workerWin.close();
      }, 500);
    });
  });
});

// 2. NOTIFICATION HANDLER
ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'Valetudo Alert',
      body: body || 'Notification from Valetudo HealthLink',
      urgency: 'critical',
    }).show();
    return { success: true };
  }
  return { success: false, error: 'Notifications not supported' };
});

// 3. ALLOW SELF-SIGNED CERTS (RESTRICTED TO LOCAL DEVELOPMENT ONLY)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Security Enforcement: Enforce strict TLS validation in packaged production builds
  if (!app.isPackaged) {
    if (
      url.startsWith(API_BASE_URL) ||
      url.startsWith(API_WS_URL) ||
      url.startsWith(VITE_URL) ||
      url.startsWith(VITE_WS_URL) ||
      url.startsWith('https://localhost:5173') ||
      url.startsWith('https://127.0.0.1:5173')
    ) {
      event.preventDefault();
      callback(true);
      return;
    }
  }
  callback(false);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});