import { useEffect } from 'react';

export function useSessionTimeout(isActive: boolean, timeoutMinutes = 480) {
  useEffect(() => {
    if (!isActive) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        localStorage.removeItem('valetudo_token');
        localStorage.removeItem('token');
        alert('Session expired due to 8 hours of inactivity (R.A. 10173 Compliance). Please log in again.');
        window.location.reload();
      }, timeoutMinutes * 60 * 1000);
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isActive, timeoutMinutes]);
}
