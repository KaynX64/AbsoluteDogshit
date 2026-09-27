// server/src/db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

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

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'root',
  password: getDbPassword(),
  database: process.env.DB_NAME || 'valetudo_healthlink',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
});