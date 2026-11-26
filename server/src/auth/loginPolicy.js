const LOOPBACK_DB_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

// Allow seeded-account passwords only on opted-in development servers with a loopback database host.
export function mobileDemoLoginEnabled(env = process.env) {
  return env.NODE_ENV === 'development' && env.ALLOW_MOBILE_DEMO_LOGIN === 'true' &&
    LOOPBACK_DB_HOSTS.has(env.DB_HOST || '127.0.0.1');
}

export const SESSION_PURPOSE = 'HEALTHLINK_SESSION';

// Check decoded JWT claims for the HealthLink session purpose and a supported sign-in method.
// Recheck the demo setting so turning it off also rejects existing demo sessions.
export function sessionAuthenticationAllowed(user) {
  if (user?.purpose !== SESSION_PURPOSE) return false;
  if (user.auth_method === 'mobile_demo' || user.auth_method === 'desktop_demo') return mobileDemoLoginEnabled();
  return user.auth_method === 'mobile_google' || user.auth_method === 'desktop_password';
}
