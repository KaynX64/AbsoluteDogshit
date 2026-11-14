export const events = [];

export function recordOperation(message) {
  if (events.length === 100) events.shift();
  events.push({ at: new Date().toISOString(), message });
}

