const { randomBytes } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const tables = ['LOCAL_SYNC_LOGS', 'CACHED_PATIENTS', 'CACHED_EMR_RECORDS'];

function initLocalDatabase(sqliteDb) {
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

async function readKey(dir, encryptedPath, safeStorage, platform) {
  const keyPath = path.join(dir, 'offline-storage.key');
  if (platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error('An operating system key store is required.');
  }
  const asyncStorage = typeof safeStorage.isAsyncEncryptionAvailable === 'function';
  const available = asyncStorage
    ? await safeStorage.isAsyncEncryptionAvailable()
    : safeStorage.isEncryptionAvailable();
  if (!available) throw new Error('Operating system encryption is unavailable.');

  if (fs.existsSync(keyPath)) {
    const wrapped = fs.readFileSync(keyPath);
    const key = asyncStorage
      ? (await safeStorage.decryptStringAsync(wrapped)).result
      : safeStorage.decryptString(wrapped);
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid offline database key.');
    return key;
  }
  if (fs.existsSync(encryptedPath)) throw new Error('The offline database key is missing.');

  const key = randomBytes(32).toString('hex');
  const wrapped = asyncStorage ? await safeStorage.encryptStringAsync(key) : safeStorage.encryptString(key);
  const tempKey = keyPath + '.tmp';
  const fd = fs.openSync(tempKey, 'w', 0o600);
  try {
    fs.writeFileSync(fd, wrapped);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempKey, keyPath);
  return key;
}

function openEncrypted(file, key, options) {
  const Database = require('better-sqlite3-multiple-ciphers');
  const db = new Database(file, options);
  try {
    db.pragma("cipher = 'sqlcipher'");
    db.pragma('legacy = 4');
    db.pragma('key = "x\'' + key + '\'"');
    db.prepare('SELECT count(*) AS total FROM sqlite_schema').get();
    db.pragma('temp_store = MEMORY');
    db.pragma('secure_delete = ON');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function removeDatabaseFiles(file) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(file + suffix, { force: true });
  }
}

function copyLegacyDatabase(file, target) {
  if (!fs.statSync(file).size) return;
  const { DatabaseSync } = require('node:sqlite');
  const source = new DatabaseSync(file, { readOnly: true });
  try {
    target.transaction(() => {
      for (const table of tables) {
        const original = source.prepare('SELECT * FROM ' + table);
        original.setReadBigInts(true);
        const columns = original.columns().map(column => column.name);
        const insert = target.prepare('INSERT INTO ' + table + ' (' +
          columns.map(name => '"' + name.replaceAll('"', '""') + '"').join(',') +
          ') VALUES (' + columns.map(() => '?').join(',') + ')');
        let copied = 0;
        for (const row of original.iterate()) {
          insert.run(...columns.map(name => row[name]));
          copied++;
        }
        if (target.prepare('SELECT COUNT(*) AS total FROM ' + table).get().total !== copied) {
          throw new Error('Offline migration did not copy all rows.');
        }
      }
    })();
  } finally {
    source.close();
  }
}

async function openOfflineDatabase(dir, safeStorage, platform = process.platform) {
  fs.mkdirSync(dir, { recursive: true });
  const legacy = path.join(dir, 'valetudo_offline.db');
  const encrypted = path.join(dir, 'valetudo_offline_encrypted.db');
  const key = await readKey(dir, encrypted, safeStorage, platform);
  if (!fs.existsSync(encrypted)) {
    const staging = encrypted + '.migrating';
    removeDatabaseFiles(staging);
    const target = openEncrypted(staging, key);
    try {
      initLocalDatabase(target);
      if (fs.existsSync(legacy)) copyLegacyDatabase(legacy, target);
    } finally {
      target.close();
    }
    const verified = openEncrypted(staging, key, { readonly: true, fileMustExist: true });
    try {
      if (verified.pragma('integrity_check', { simple: true }) !== 'ok') {
        throw new Error('Offline database integrity check failed.');
      }
    } finally {
      verified.close();
    }
    fs.renameSync(staging, encrypted);
  }

  const db = openEncrypted(encrypted, key, { fileMustExist: true });
  try {
    // A new filename keeps older desktop builds from trying to open this database.
    // This cleanup is retried if the app stopped after the encrypted file was published.
    removeDatabaseFiles(legacy);
    require('./queue.cjs').discardSyncedPayloads(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

module.exports = { openOfflineDatabase, initLocalDatabase };
