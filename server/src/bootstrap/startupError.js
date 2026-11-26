// Only explicitly trusted operational messages may appear in startup diagnostics.
export class StartupError extends Error {}

export function describeStartupError(error) {
  const parts = [];
  const seen = new Set();
  while (error && !seen.has(error) && parts.length < 5) {
    seen.add(error);
    // Driver messages can contain SQL values, credentials, or patient data.
    const code = typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code : 'Error';
    parts.push(error instanceof StartupError ? error.message : code);
    error = error.cause;
  }
  return parts.join(' Caused by: ') || 'Unknown startup failure.';
}
