// Mounts inventory reads, formulary changes, deliveries, and stock movement routes.

import express from 'express';
import { registerInventoryOverview } from './overview.js';
import { registerInventoryReceiving } from './receiving.js';
import { registerFormularyRoutes } from './formulary.js';
import { registerInventoryStock } from './stock.js';

export default function inventoryRoutes(io) {
  const router = express.Router();
  registerInventoryOverview(router);
  registerInventoryReceiving(router, io);
  registerFormularyRoutes(router, io);
  registerInventoryStock(router, io);
  return router;
}
