// desktop/src/hooks/useBookingBadge.ts
import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/api';
import { subscribeToDesktopEvents } from '../services/desktopRealtime';

/**
 * Returns how many bookings are still pending for the current role:
 *  - NURSE            -> /expected-today       (same list as the "Expected" tab)
 *  - DOCTOR / DENTIST -> /today?filter=scheduled (same list as the "Bookings" tab;
 *                        the server already limits it to that practitioner)
 * Refreshes automatically on socket events, so it behaves like a live notification.
 */
export function useBookingBadge(role: string, enabled: boolean, socket: Socket | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let url: string | null = null;
    if (role === 'NURSE') {
      url = `${API_BASE_URL}/api/appointments/expected-today`;
    } else if (role === 'DOCTOR' || role === 'DENTIST') {
      url = `${API_BASE_URL}/api/appointments/today?filter=scheduled`;
    }

    if (!enabled || !url) {
      setCount(0);
      return;
    }

    let cancelled = false;
    const endpoint = url;

    const refresh = async () => {
      const token = localStorage.getItem('valetudo_token');
      try {
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setCount(data.length);
      } catch {
        /* keep the last known count if the request fails */
      }
    };

    refresh();

    const unsubscribe = subscribeToDesktopEvents(socket, (on) => {
      for (const event of ['appointment:booked', 'appointment:cancelled', 'appointment:status_changed', 'queue:updated', 'reconnect']) {
        on(event, refresh);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [role, enabled, socket]);

  return count;
}
