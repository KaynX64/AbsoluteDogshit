import express from 'express';
import { registerBookingReads } from './booking/reads.js';
import { registerBookingCreation } from './booking/create.js';
import { registerBookingCancellation } from './booking/cancellation.js';
import { registerDailyQueueRoutes } from './dailyQueue.js';
import { registerIntakeLookupRoutes, registerActiveTicket } from './intake/lookup.js';
import { registerBookedCheckIn } from './intake/checkIn.js';
import { registerWalkIn } from './intake/walkIn.js';
import { registerConsultationRoutes } from './consultations.js';
import { registerPatientHistoryRoutes } from './patientHistory.js';

export default function appointmentRoutes(io) {
  const router = express.Router();

  registerBookingReads(router);
  registerBookingCreation(router, io);
  registerBookingCancellation(router, io);
  registerDailyQueueRoutes(router, io);
  registerIntakeLookupRoutes(router);
  registerBookedCheckIn(router, io);
  registerWalkIn(router, io);
  registerActiveTicket(router);
  registerConsultationRoutes(router, io);
  registerPatientHistoryRoutes(router);

  return router;
}
