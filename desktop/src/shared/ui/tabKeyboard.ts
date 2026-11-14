import type { KeyboardEvent } from 'react';

export function navigateTabs(event: KeyboardEvent<HTMLElement>, activateOnFocus: boolean) {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
  if (!target || target.closest('[role="tablist"]') !== event.currentTarget) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
    .filter(button => button.closest('[role="tablist"]') === event.currentTarget);
  const index = tabs.indexOf(target);
  const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
  const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1)
    : offsets[event.key] ? tabs[(index + offsets[event.key] + tabs.length) % tabs.length] : undefined;
  if (!next) return;
  event.preventDefault();
  next.focus();
  if (activateOnFocus) next.click();
}
