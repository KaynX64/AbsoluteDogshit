import { useEffect, useLayoutEffect, useRef } from 'react';

const reducedMotion = '(prefers-reduced-motion: reduce), print';

function animateSelection(elements: ArrayLike<HTMLElement>, offset: number, duration: number) {
  const media = window.matchMedia(reducedMotion);
  if (media.matches) return;
  const animations = Array.from(elements, element => {
    const from: Keyframe = { opacity: .7 };
    if (offset) from.translate = `${offset}px 0`;
    return element.animate([from, { opacity: 1, ...(offset ? { translate: '0 0' } : {}) }], {
      duration, easing: 'cubic-bezier(.2,.75,.25,1)',
    });
  });
  const cancel = () => animations.forEach(animation => animation.cancel());
  const onMediaChange = () => { if (media.matches) cancel(); };
  media.addEventListener('change', onMediaChange);
  return () => { cancel(); media.removeEventListener('change', onMediaChange); };
}

export function useTabMotion<T extends string>(
  active: T, order: readonly T[], getPanelId: (tab: T) => string, enabled = true,
) {
  const previous = useRef(active);
  // Keep callbacks current without restarting the animation on data refresh.
  const config = useRef({ order, getPanelId, enabled });
  useLayoutEffect(() => { config.current = { order, getPanelId, enabled }; });
  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = active;
    const { order, getPanelId, enabled } = config.current;
    if (last === active || !enabled || !order.includes(last) || !order.includes(active)) return;
    const panel = document.getElementById(getPanelId(active));
    if (!panel?.getClientRects().length) return;
    return animateSelection([panel], order.indexOf(active) > order.indexOf(last) ? 4 : -4, 220);
  }, [active]);
}

export function useWorkspaceMotion(role: string, destination: string, order: readonly string[]) {
  const workspace = useRef<HTMLElement>(null);
  const previous = useRef({ role, destination });
  const requested = useRef<{ role: string; destination: string } | null>(null);
  const orderRef = useRef(order);
  useLayoutEffect(() => { orderRef.current = order; });
  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { role, destination };
    const request = requested.current;
    requested.current = null;
    if (request?.role !== role || request.destination !== destination || !workspace.current) return;
    if (last.role === role && last.destination === destination) return;

    const sections = Array.from(workspace.current.querySelectorAll<HTMLElement>('[data-workspace-view]'))
      .filter(section => section.getClientRects().length && !section.parentElement?.closest('[data-workspace-view]'));
    const routeOrder = orderRef.current;
    const offset = role === last.role && routeOrder.includes(last.destination) && routeOrder.includes(destination)
      ? (routeOrder.indexOf(destination) > routeOrder.indexOf(last.destination) ? 8 : -8)
      : 0;
    return animateSelection(sections, offset, 240);
  }, [role, destination]);

  function requestWorkspace(nextRole: string, nextDestination: string) {
    if (nextRole !== role || nextDestination !== destination) {
      requested.current = { role: nextRole, destination: nextDestination };
    }
  }

  return { workspace, requestWorkspace };
}

export function useKeyboardPressFeedback() {
  useEffect(() => {
    let pressed: HTMLElement | null = null;
    const release = () => {
      pressed?.removeAttribute('data-key-pressed');
      pressed = null;
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.repeat || !['Enter', ' '].includes(event.key) || !(event.target instanceof HTMLElement)) return;
      if (!event.target.matches('button:not(:disabled), summary, [role="button"]')) return;
      release();
      pressed = event.target;
      pressed.setAttribute('data-key-pressed', '');
    };
    document.addEventListener('keydown', keyDown);
    document.addEventListener('keyup', release);
    document.addEventListener('focusout', release);
    window.addEventListener('blur', release);
    return () => {
      release();
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('keyup', release);
      document.removeEventListener('focusout', release);
      window.removeEventListener('blur', release);
    };
  }, []);
}
