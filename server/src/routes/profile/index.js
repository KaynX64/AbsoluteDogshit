import express from 'express';
import { registerSelfProfileRead, registerSelfProfileUpdate } from './self.js';
import { registerClinicalHealthRoutes } from './clinicalHealth.js';
import { registerProfilePreferences } from './preferences.js';

const router = express.Router();
registerSelfProfileRead(router);
registerClinicalHealthRoutes(router);
registerSelfProfileUpdate(router);
registerProfilePreferences(router);

export default router;
