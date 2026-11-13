import express from 'express';
import { registerPrescriptionIssuance } from './prescriptions/issuance.js';
import { registerPrescriptionHistory } from './prescriptions/history.js';
import { registerPrescriptionCancellation } from './prescriptions/cancellation.js';
import { registerClearanceRoutes } from './clearances.js';
import { registerPublicVerificationRoutes } from './verification/public.js';
import { registerVerificationDetailsRoute } from './verification/details.js';
import { registerAttachmentRoutes } from './attachments.js';
import { registerPdfRoutes } from './pdfs.js';

export default function documentRoutes(io) {
  const router = express.Router();

  registerPrescriptionIssuance(router, io);
  registerPrescriptionHistory(router);
  registerPrescriptionCancellation(router, io);
  registerClearanceRoutes(router);
  registerPublicVerificationRoutes(router);
  registerVerificationDetailsRoute(router);
  registerAttachmentRoutes(router);
  registerPdfRoutes(router);

  return router;
}
