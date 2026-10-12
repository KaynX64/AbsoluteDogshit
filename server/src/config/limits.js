// server/src/config/limits.js
//
// Central place for tunable rate-limit and throttle constants.
// These are NOT secrets — they are documented, reviewable defaults that
// operations can override via environment variables when needed.

/**
 * Read an integer from an environment variable with a safe fallback.
 * Returns the fallback if the variable is missing, empty, or not a positive integer.
 */
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ─────────────────────────────────────────────────────────────────────────
// LOGIN — brute-force protection on POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────
export const LOGIN_LIMIT = {
  maxAttempts:   envInt('LOGIN_RATE_LIMIT_MAX',    5),
  windowSeconds: envInt('LOGIN_RATE_LIMIT_WINDOW', 60),
};

// ─────────────────────────────────────────────────────────────────────────
// SOS — panic-button throttle (wired in server/src/routes/emergency.js)
// ─────────────────────────────────────────────────────────────────────────
export const SOS_LIMIT = {
  maxAttempts:   envInt('SOS_RATE_LIMIT_MAX',    10),
  windowSeconds: envInt('SOS_RATE_LIMIT_WINDOW', 60),
};

// ─────────────────────────────────────────────────────────────────────────
// APPOINTMENT BOOKING — mobile patient self-booking throttle
// ─────────────────────────────────────────────────────────────────────────
export const BOOKING_LIMIT = {
  maxAttempts:   envInt('BOOKING_RATE_LIMIT_MAX',    10),
  windowSeconds: envInt('BOOKING_RATE_LIMIT_WINDOW', 60),
};

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC DOCUMENT VERIFICATION — per-IP throttle on unauthenticated QR checks
// ─────────────────────────────────────────────────────────────────────────
export const VERIFY_LIMIT = {
  maxAttempts:   envInt('VERIFY_RATE_LIMIT_MAX',    30),
  windowSeconds: envInt('VERIFY_RATE_LIMIT_WINDOW', 60),
};

// ─────────────────────────────────────────────────────────────────────────
// NO-SHOW GRACE PERIOD — how long past the appointment time the auto worker
// waits before flipping status from 'scheduled' to 'no_show'.
//
// Read by server/src/utils/reminderWorker.js. The worker runs every 60s, so
// a patient is marked no-show within ~1 minute of crossing this threshold.
//
// Default 20 minutes matches the original hardcoded value. Set it to 15 for
// a tighter clinic, 30 for a more forgiving one.
// ─────────────────────────────────────────────────────────────────────────
export const NOSHOW_LIMIT = {
  graceMinutes: envInt('NOSHOW_GRACE_MINUTES', 20),
};

// ─────────────────────────────────────────────────────────────────────────
// Startup log — confirms the active policy in the server console
// ─────────────────────────────────────────────────────────────────────────
export function logActiveLimits() {
  console.log(
    `🛡️  [Rate Limits] Login: ${LOGIN_LIMIT.maxAttempts} / ${LOGIN_LIMIT.windowSeconds}s · ` +
    `SOS: ${SOS_LIMIT.maxAttempts} / ${SOS_LIMIT.windowSeconds}s · ` +
    `Booking: ${BOOKING_LIMIT.maxAttempts} / ${BOOKING_LIMIT.windowSeconds}s`
  );
  console.log(
    `⏰ [No-Show] Grace period: ${NOSHOW_LIMIT.graceMinutes} minute(s) past appointment time`
  );
}