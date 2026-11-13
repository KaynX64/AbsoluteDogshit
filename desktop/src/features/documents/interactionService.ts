// desktop/src/features/documents/interactionService.ts
//
// Client-side service for drug-drug interaction checking.
// Calls the backend /api/interactions/check endpoint.

import { API_BASE_URL } from '../../config/api';

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
  { label: string; icon: string }
> = {
  contraindicated: {
    label: 'CONTRAINDICATED',
    icon: 'block',
  },
  severe: {
    label: 'SEVERE',
    icon: 'warning',
  },
  moderate: {
    label: 'MODERATE',
    icon: 'bolt',
  },
  mild: {
    label: 'MILD',
    icon: 'info',
  },
};