import express from 'express';
import { registerPrescriptionRoutes } from './prescriptions.js';
import { registerClearanceRoutes } from './clearances.js';
import { registerVerificationRoutes } from './verification.js';
import { registerAttachmentRoutes } from './attachments.js';
import { registerPdfRoutes } from './pdfs.js';

export default function documentRoutes(io) {
  const router = express.Router();

  registerPrescriptionRoutes(router, io);
  registerClearanceRoutes(router);
  registerVerificationRoutes(router);
  registerAttachmentRoutes(router);
  registerPdfRoutes(router);

  return router;
}
