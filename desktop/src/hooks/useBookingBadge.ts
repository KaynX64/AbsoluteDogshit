// desktop/src/hooks/useBookingBadge.ts
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';

/**
 * Returns how many bookings are still pending for the current role:
 *  - NURSE            -> /expected-today       (same list as the "Expected" tab)
 *  - DOCTOR / DENTIST -> /today?filter=scheduled (same list as the "Bookings" tab;
 *                        the server already limits it to that practitioner)
 * Refreshes automatically on socket events, so it behaves like a live notification.
 */
export function useBookingBadge(role: string, enabled: boolean): number {
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

    const socket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('valetudo_token') },
      transports: ['websocket', 'polling'],
    });

    [
      'appointment:booked',
      'appointment:cancelled',
      'appointment:status_changed',
      'queue:updated',
    ].forEach((evt) => socket.on(evt, refresh));

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [role, enabled]);

  return count;
}