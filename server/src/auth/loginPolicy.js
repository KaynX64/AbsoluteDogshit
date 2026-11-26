const LOOPBACK_DB_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function mobileDemoLoginEnabled(env = process.env) {
  return env.NODE_ENV === 'development' && env.ALLOW_MOBILE_DEMO_LOGIN === 'true' &&
    LOOPBACK_DB_HOSTS.has(env.DB_HOST || '127.0.0.1');
}

export const SESSION_PURPOSE = 'HEALTHLINK_SESSION';

export function sessionAuthenticationAllowed(user) {
  if (user?.purpose !== SESSION_PURPOSE) return false;
  if (user.auth_method === 'mobile_demo' || user.auth_method === 'desktop_demo') return mobileDemoLoginEnabled();
  return user.auth_method === 'mobile_google' || user.auth_method === 'desktop_password';
}
