// desktop/src/services/interactionService.ts
//
// Client-side service for drug-drug interaction checking.
// Calls the backend /api/interactions/check endpoint.

import { API_BASE_URL } from '../config/api';

export interface InteractionMedicine {
  id: number;
  name: string;
  generic: string;
}

export interface DrugInteraction {
  interaction_id: number;
  severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
  interaction_type: string;
  description: string;
  recommendation: string | null;
  source: string | null;
  medicine_a: InteractionMedicine;
  medicine_b: InteractionMedicine;
}

export interface InteractionCheckResult {
  hasInteractions: boolean;
  blocking: boolean;
  totalInteractions: number;
  interactions: DrugInteraction[];
}

/**
 * Check drug-drug interactions for a list of medicine IDs.
 * Returns null if the request fails (network error).
 */
export async function checkDrugInteractions(
  medicineIds: number[]
): Promise<InteractionCheckResult | null> {
  if (medicineIds.length < 2) {
    return {
      hasInteractions: false,
      blocking: false,
      totalInteractions: 0,
      interactions: [],
    };
  }

  const token = localStorage.getItem('valetudo_token');
  try {
    const res = await fetch(`${API_BASE_URL}/api/interactions/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ medicine_ids: medicineIds }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[InteractionCheck] Server error:', err);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('[InteractionCheck] Network error:', err);
    return null;
  }
}

/**
 * Severity color mapping for UI display.
 */
export const SEVERITY_CONFIG: Record<
  string,
  { bg: string; color: string; border: string; label: string; icon: string }
> = {
  contraindicated: {
    bg: '#FDE8E8',
    color: '#7A2E26',
    border: '#F8B4B4',
    label: 'CONTRAINDICATED',
    icon: '🚫',
  },
  severe: {
    bg: '#FDE8E8',
    color: '#9B1C1C',
    border: '#F8B4B4',
    label: 'SEVERE',
    icon: '⚠️',
  },
  moderate: {
    bg: '#FEF3C7',
    color: '#92400E',
    border: '#FDE68A',
    label: 'MODERATE',
    icon: '⚡',
  },
  mild: {
    bg: '#E0F2FE',
    color: '#0369A1',
    border: '#BAE6FD',
    label: 'MILD',
    icon: 'ℹ️',
  },
};