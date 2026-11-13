const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

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

module.exports = { sqliteDb, initLocalDatabase };
