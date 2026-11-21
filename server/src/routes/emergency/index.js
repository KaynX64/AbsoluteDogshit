// Mounts SOS, responder alert management, and incident report routes.

import express from 'express';
import { registerSosRoutes } from './sos.js';
import { registerAlertRoutes } from './alerts.js';
import { registerIncidentWorkflowRoutes } from './incidentReports/workflow.js';
import { registerIncidentArchiveRoutes } from './incidentReports/archive.js';

// Build the emergency router and pass realtime access to handlers that notify responders.
export default function emergencyRouter(io) {
  const router = express.Router();
  registerSosRoutes(router, io);
  registerAlertRoutes(router, io);
  registerIncidentWorkflowRoutes(router, io);
  registerIncidentArchiveRoutes(router);
  return router;
}
