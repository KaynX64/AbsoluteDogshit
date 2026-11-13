import dotenv from 'dotenv';
import { createApp, createOriginCheck, mountApiRoutes } from './app.js';
import { createHttpServer } from './server.js';
import { attachRealtime } from './realtime/socket.js';
import { startServer } from './bootstrap/startup.js';
import { closeDependencies } from './bootstrap/dependencies.js';
import { drainServer } from './bootstrap/shutdown.js';

dotenv.config();

const isOriginAllowed = createOriginCheck();
const app = createApp({ isOriginAllowed });
const { server, isHttps } = createHttpServer(app);
export const io = attachRealtime(server, { isHttps, isOriginAllowed });

mountApiRoutes(app, io);
const startupController = new AbortController();
let stopping;
const startup = startServer(server, { io, isHttps, signal: startupController.signal });

function shutdown() {
  stopping ??= (async () => {
    startupController.abort();
    const timeout = setTimeout(() => {
      console.error('[shutdown] Grace period expired.');
      process.exit(1);
    }, 30_000).unref();

    try {
      const stopWorkers = await startup.catch(() => undefined);
      await drainServer({ io, stopWorkers, closeDependencies });
    } catch (error) {
      process.exitCode = 1;
      console.error('[shutdown] Cleanup failed.', error?.code || error?.name);
    } finally {
      clearTimeout(timeout);
    }
  })();
  return stopping;
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
try {
  await startup;
} catch (error) {
  if (!startupController.signal.aborted || error !== startupController.signal.reason) {
    console.error('[startup] Server initialization failed.', error?.code || error?.name);
    process.exitCode = 1;
  }
  await shutdown();
}
