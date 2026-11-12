import express from 'express';
import { registerPrescriptionIssuance } from './prescriptions/issuance.js';
import { registerPrescriptionHistory } from './prescriptions/history.js';
import { registerPrescriptionCancellation } from './prescriptions/cancellation.js';
import { registerClearanceRoutes } from './clearances.js';
import { registerVerificationRoutes } from './verification.js';
import { registerAttachmentRoutes } from './attachments.js';
import { registerPdfRoutes } from './pdfs.js';

export default function documentRoutes(io) {
  const router = express.Router();

  registerPrescriptionIssuance(router, io);
  registerPrescriptionHistory(router);
  registerPrescriptionCancellation(router, io);
  registerClearanceRoutes(router);
  registerVerificationRoutes(router);
  registerAttachmentRoutes(router);
  registerPdfRoutes(router);

  return router;
}
