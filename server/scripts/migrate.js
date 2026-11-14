// Runs pending database migrations from the command line and closes the connection pool.

import { pool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';

try {
  const applied = await runMigrations(pool);
  console.log(applied ? '[migrate] Database is up to date.' : '[migrate] No pending migrations.');
} finally {
  await pool.end();
}
