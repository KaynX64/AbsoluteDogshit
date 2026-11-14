import { authenticateToken } from '../../../auth/middleware.js';
import { requireRoles } from '../../../middleware/rbac.js';
import { isCalendarDate } from '../../../config/appointmentRules.js';
import { SignerError } from '../../../documents/signing/signatory.js';
import { issuePrescription } from '../../../documents/prescriptions/issuePrescription.js';

function quantityInt(value, minimum = 1) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= 2147483647 ? number : null;
}

export function registerPrescriptionIssuance(router, io) {
  // =============================================================================
  // 1. PRESCRIPTIONS WITH AUTOMATED FEFO INVENTORY DEDUCTION
  // =============================================================================

  router.post('/prescriptions', authenticateToken, requireRoles('DOCTOR', 'DENTIST'), async (req, res) => {
    const { emr_id, patient_user_id, items, notes: rawNotes, appointment_id, expires_at } = req.body;
    const doctorUserId = req.user.user_id;

    if (!patient_user_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'patient_user_id and at least one medication item are required.' });
    }

    if (!isCalendarDate(expires_at)) {
      return res.status(400).json({ error: 'Enter a valid prescription expiry date.' });
    }
    if (rawNotes != null && typeof rawNotes !== 'string') {
      return res.status(400).json({ error: 'Prescription notes must be text.' });
    }
    const notes = rawNotes?.trim() || '';

    const formularyItems = [];
    const outsideItems = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ error: 'Each prescription item must contain its dosing details.' });
      }
      const { dosage, frequency, route, duration_days, instructions } = item;
      for (const [label, value, max] of [['Dosage', dosage, 100], ['Frequency', frequency, 100], ['Route', route, 50]]) {
        if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
          return res.status(400).json({ error: label + ' is required and must be at most ' + max + ' characters.' });
        }
      }
      const duration = quantityInt(duration_days);
      const quantity = quantityInt(item.quantity_prescribed ?? item.quantity_dispensed ?? item.quantity);
      if (!duration || !quantity) {
        return res.status(400).json({ error: 'Duration and quantity must be positive whole numbers.' });
      }
      if (instructions != null && typeof instructions !== 'string') {
        return res.status(400).json({ error: 'Prescription instructions must be text.' });
      }
      const normalized = {
        ...item,
        dosage: dosage.trim(),
        frequency: frequency.trim(),
        route: route.trim(),
        duration_days: duration,
        quantity_prescribed: quantity,
        instructions: instructions?.trim() || '',
      };
      if (item.medicine_id === null || item.medicine_id === undefined || item.medicine_id === '') {
        const name = item.outside_drug_name ?? item.outside_name;
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
          return res.status(400).json({ error: 'Outside drug name is required and must be at most 200 characters.' });
        }
        outsideItems.push({ ...normalized, outside_drug_name: name.trim() });
      } else {
        const dispensed = quantityInt(item.quantity_dispensed ?? quantity, 0);
        if (dispensed === null) {
          return res.status(400).json({ error: 'Dispensed quantity must be a non-negative whole number.' });
        }
        formularyItems.push({ ...normalized, quantity_dispensed: dispensed });
      }
    }

    const result = await issuePrescription({
      doctorUserId, patient_user_id, appointment_id, emr_id, expires_at, notes,
      formularyItems, outsideItems, itemCount: items.length, ipAddress: req.ip,
      onInventoryUpdated: () => io?.emit('inventory:updated'),
    });
    if (result.conflict) return res.status(409).json(result.conflict);
    if (result.issued) return res.status(201).json(result.issued);
    const error = result.failure;
    if (error instanceof SignerError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    if (error.code === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({
        error: 'Insufficient stock available.',
        medicine: error.medicine,
        available: error.available,
        requested: error.requested,
      });
    }
    return res.status(400).json({ error: error.message || 'Failed to issue prescription.' });
  });
}
