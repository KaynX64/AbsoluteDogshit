// Keeps a bounded in-memory list of timestamped server events for the Admin Terminal.

export const events = [];

export function recordOperation(message) {
  if (events.length === 100) events.shift();
  events.push({ at: new Date().toISOString(), message });
}

