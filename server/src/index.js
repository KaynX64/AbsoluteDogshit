import dotenv from 'dotenv';
import { createApp, createOriginCheck, mountApiRoutes } from './app.js';
import { createHttpServer } from './server.js';
import { attachRealtime } from './realtime/socket.js';
import { startServer } from './bootstrap/startup.js';

dotenv.config();

const isOriginAllowed = createOriginCheck();
const app = createApp({ isOriginAllowed });
const { server, isHttps } = createHttpServer(app);
export const io = attachRealtime(server, { isHttps, isOriginAllowed });

mountApiRoutes(app, io);
await startServer(server, { io, isHttps });
