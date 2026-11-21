// Checks submitted medicines for interactions and serves the active medicine catalog.
//
// Drug-Drug Interaction Checking API
//
// POST /api/interactions/check
//   Body: { medicine_ids: [1, 2, 3] }
//   Returns: { hasInteractions: bool, interactions: [...], blocking: bool }
//
// GET /api/interactions/catalogue
//   Returns all active interaction rules (for admin management)

import express from 'express';
import { pool } from '../db/pool.js';
import { authenticateToken } from '../auth/middleware.js';
import { requireRoles } from '../middleware/rbac.js';
import { checkInteractionsStandalone } from '../utils/interactionChecker.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────
// POST /api/interactions/check
// Called by the frontend BEFORE submitting a prescription.
// Returns all interactions found among the selected medicines.
// ─────────────────────────────────────────────────────────────────────
// Validate medicine IDs and return known pairwise interactions.
router.post(
  '/check',
  authenticateToken,
  requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'),
  async (req, res) => {
    const { medicine_ids } = req.body;

    if (!Array.isArray(medicine_ids) || medicine_ids.length === 0 || medicine_ids.length > 20 ||
      medicine_ids.some(id => !['number', 'string'].includes(typeof id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
      return res.status(400).json({ error: 'Include 1 to 20 valid catalog medicine identifiers.' });
    }

    // Convert validated identifiers to numbers and remove duplicates before comparing pairs.
    const cleanIds = [...new Set(medicine_ids.map(Number))];

    if (cleanIds.length < 2) {
      return res.json({
        hasInteractions: false,
        interactions: [],
        blocking: false,
        coverage: 'not_checked', message: 'Fewer than two identified medicines; no pairwise check was performed.',
      });
    }

    try {
      const interactions = await checkInteractionsStandalone(cleanIds);

      // Contraindications block; severe findings require a recorded override.
      const hasBlocking = interactions.some(
        (i) => i.severity === 'contraindicated'
      );

      res.json({
        hasInteractions: interactions.length > 0,
        blocking: hasBlocking,
        requiresOverride: interactions.some(i => i.severity === 'severe'),
        coverage: interactions.length < cleanIds.length * (cleanIds.length - 1) / 2 ? 'partial' : 'local_rules_checked',
        scope: 'Draft medicine pairs in local rules only; not a complete safety assessment.',
        totalInteractions: interactions.length,
        interactions: interactions.map(/* Return each interaction with its severity, description, and medicine names. */ (i) => ({
          interaction_id: i.interaction_id,
          severity: i.severity,
          interaction_type: i.interaction_type,
          description: i.description,
          recommendation: i.recommendation,
          source: i.source,
          medicine_a: {
            id: i.medicine_id_a,
            name: i.medicine_a_name,
            generic: i.medicine_a_generic,
          },
          medicine_b: {
            id: i.medicine_id_b,
            name: i.medicine_b_name,
            generic: i.medicine_b_generic,
          },
        })),
      });
    } catch (error) {
      console.error('[Interactions] Check error:', error);
      res.status(500).json({ error: 'Failed to check drug interactions.' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────
// GET /api/interactions/catalogue
// Admin view: list all active interaction rules.
// ─────────────────────────────────────────────────────────────────────
// Return the medicine catalog used by the interaction checker.
router.get(
  '/catalogue',
  authenticateToken,
  requireRoles('ADMIN', 'DOCTOR'),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT
           di.interaction_id,
           di.medicine_id_a,
           di.medicine_id_b,
           ma.name AS medicine_a_name,
           mb.name AS medicine_b_name,
           di.severity,
           di.interaction_type,
           di.description,
           di.recommendation,
           di.source,
           di.is_active,
           di.created_at,
           di.updated_at
         FROM DRUG_INTERACTIONS di
         JOIN MEDICINES ma ON di.medicine_id_a = ma.medicine_id
         JOIN MEDICINES mb ON di.medicine_id_b = mb.medicine_id
         ORDER BY
           FIELD(di.severity, 'contraindicated', 'severe', 'moderate', 'mild'),
           ma.name ASC`
      );
      res.json(rows);
    } catch (error) {
      console.error('[Interactions] Catalogue error:', error);
      res.status(500).json({ error: 'Failed to fetch interaction catalogue.' });
    }
  }
);

export default router;
