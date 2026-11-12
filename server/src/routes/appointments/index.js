import express from 'express';
import { registerBookingRoutes } from './booking.js';
import { registerDailyQueueRoutes } from './dailyQueue.js';
import { registerIntakeRoutes } from './intake.js';
import { registerConsultationRoutes } from './consultations.js';
import { registerPatientHistoryRoutes } from './patientHistory.js';

export default function appointmentRoutes(io) {
  const router = express.Router();

  registerBookingRoutes(router, io);
  registerDailyQueueRoutes(router, io);
  registerIntakeRoutes(router, io);
  registerConsultationRoutes(router, io);
  registerPatientHistoryRoutes(router);

  return router;
}
