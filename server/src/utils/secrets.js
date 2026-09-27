// ── server/src/utils/secrets.js (NEW) ───────────────────────────────

import 'dotenv/config';
function required(name, minLen = 32) {
const v = process.env[name];
if (!v || v.length < minLen) {
throw new Error(
`[secrets] Environment variable ${name} is missing or shorter than ${minLen} chars. ` +
`Generate one with: openssl rand -hex 32`
);
}
return v;
}
export const JWT_SECRET = required('JWT_SECRET', 32);
export const ENCRYPTION_KEY = required('ENCRYPTION_KEY', 32);