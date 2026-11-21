// Starts the API and realtime server, handles supervisor messages, and coordinates graceful shutdown.

import dotenv from 'dotenv';
import { createApp, createOriginCheck, mountApiRoutes } from './app.js';
import { createHttpServer } from './server.js';
import { attachRealtime } from './realtime/socket.js';
import { startServer } from './bootstrap/startup.js';
import { closeDependencies } from './bootstrap/dependencies.js';
import { drainServer } from './bootstrap/shutdown.js';

import { recordOperation } from './bootstrap/operations.js';

dotenv.config();

const isOriginAllowed = createOriginCheck();
const app = createApp({ isOriginAllowed });
const { server, isHttps } = createHttpServer(app);
export const io = attachRealtime(server, { isHttps, isOriginAllowed });

mountApiRoutes(app, io, { restart });
const startupController = new AbortController();
let stopping;
const startup = startServer(server, { io, isHttps, signal: startupController.signal });

// Send the supervisor a restart request, then start draining this process.
async function restart() {
  // Wait for the IPC restart request to be sent.
  await new Promise((resolve, reject) => process.send('restart-after-drain', /* Resolve or reject the restart request based on IPC delivery. */ error => error ? reject(error) : resolve()));
  await shutdown();
}

// Coordinate one shutdown across startup, network, workers, and shared clients.
function shutdown() {
  stopping ??= (/* Abort active startup work and drain resources within the shutdown deadline. */ async () => {
    startupController.abort();
    const timeout = setTimeout(/* Force process exit if graceful shutdown exceeds its deadline. */ () => {
      console.error('[shutdown] Grace period expired.');
      process.exit(1);
    }, 30_000).unref();

    try {
      // Allow the shutdown sequence to proceed when startup rejects.
      const stopWorkers = await startup.catch(() => undefined);
      await drainServer({ io, stopWorkers, closeDependencies });
    } catch (error) {
      process.exitCode = 1;
      console.error('[shutdown] Cleanup failed.', error?.code || error?.name);
    } finally {
      clearTimeout(timeout);
      if (process.connected) process.disconnect();
    }
  })();
  return stopping;
}

if (process.connected && process.env.VALETUDO_SUPERVISED === '1') {
  // Shut down when the supervising process disconnects.
  process.once('disconnect', () => { void shutdown(); });
  // Handle a shutdown message from the supervising process.
  process.on('message', message => { if (message === 'shutdown') void shutdown(); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
try {
  await startup;
  if (!startupController.signal.aborted) recordOperation('Server ready.');
} catch (error) {
  if (!startupController.signal.aborted || error !== startupController.signal.reason) {
    console.error('[startup] Server initialization failed.', error?.code || error?.name);
    process.exitCode = 1;
  }
  await shutdown();
}
