import { parentPort } from 'node:worker_threads';
import { createDbPool } from '../db/pool.js';
import { computeAnalyticsAggregates } from './summary.js';

const database = createDbPool(1);

parentPort.on('message', async () => {
  let connection;
  try {
    connection = await database.getConnection();
    const asOf = Date.now();
    await connection.query('SET timestamp = ?', [asOf / 1000]);
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const data = await computeAnalyticsAggregates(connection);
    await connection.commit();
    await connection.query('SET timestamp = DEFAULT');
    connection.release();
    parentPort.postMessage({ asOf, data });
  } catch (error) {
    connection?.destroy();
    parentPort.postMessage({ error: error.code ?? error.name });
  }
});
