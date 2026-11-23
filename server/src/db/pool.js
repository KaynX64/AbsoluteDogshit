// Creates the shared MySQL connection pool from deployment settings.

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { beginDatabaseWork, isSosRequest, loadControlsEnabled } from '../bootstrap/admission.js';
import { recordLoadTiming } from '../bootstrap/loadMetrics.js';

dotenv.config();

// Helper to ensure critical DB credentials are never silently empty
function getDbPassword() {
  const pw = process.env.DB_PASSWORD || process.env.MYSQL_ROOT_PASSWORD;
  if (!pw) {
    throw new Error(
      '[db] Missing required environment variable: DB_PASSWORD (or MYSQL_ROOT_PASSWORD). ' +
      'Set it in server/.env before starting the server.'
    );
  }
  return pw;
}

export function createDbPool(connectionLimit) {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3307,
    user: process.env.DB_USER || 'root',
    password: getDbPassword(),
    database: process.env.DB_NAME || 'valetudo_healthlink',
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
    charset: 'utf8mb4_unicode_ci',
  });
}

export const pool = createDbPool(loadControlsEnabled() ? 8 : 10);
export const sosPool = createDbPool(1);

for (const target of [pool, sosPool]) {
  const originalAcquire = target.pool.getConnection;
  target.pool.getConnection = function trackedAcquire(callback) {
    const started = performance.now();
    return originalAcquire.call(this, (error, connection) => {
      recordLoadTiming('poolAcquire', performance.now() - started);
      callback(error, connection);
    });
  };
}

for (const method of ['query', 'execute']) {
  const invoke = pool[method].bind(pool);
  pool[method] = async (...args) => {
    const done = beginDatabaseWork();
    try { return await (isSosRequest() ? sosPool[method](...args) : invoke(...args)); }
    finally { done(); }
  };
}

const acquire = pool.getConnection.bind(pool);
pool.getConnection = async () => {
  const done = beginDatabaseWork();
  try {
    const connection = await (isSosRequest() ? sosPool.getConnection() : acquire());
    let returned = false;
    for (const method of ['release', 'destroy']) {
      const finish = connection[method].bind(connection);
      connection[method] = () => {
        if (returned) return;
        returned = true;
        try { finish(); }
        finally { done(); }
      };
    }
    return connection;
  } catch (error) {
    done();
    throw error;
  }
};
