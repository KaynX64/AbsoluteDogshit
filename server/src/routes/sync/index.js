import express from 'express';
import { registerSyncBootstrap } from './bootstrap.js';
import { registerSyncReplay } from './replay.js';
import { registerSyncStatus } from './status.js';

const router = express.Router();
registerSyncBootstrap(router);
registerSyncReplay(router);
registerSyncStatus(router);

export default router;
