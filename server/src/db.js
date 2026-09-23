// server/src/db.js
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: 'localhost',
  port: 3307,
  user: 'root',
  password: 'rootpassword',
  database: 'valetudo_healthlink',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});