const LOOPBACK_DB_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function mobileDemoLoginEnabled(env = process.env) {
  return env.NODE_ENV === 'development' && env.ALLOW_MOBILE_DEMO_LOGIN === 'true' &&
    LOOPBACK_DB_HOSTS.has(env.DB_HOST || '127.0.0.1');
}

export function sessionAuthenticationAllowed(user) {
  return (user.auth_method !== 'mobile_demo' && user.auth_method !== 'desktop_demo') || mobileDemoLoginEnabled();
}
