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
        sessionStorage.setItem('valetudo_session_expired', 'true');
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
