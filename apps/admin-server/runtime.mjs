// Shared runtime helpers for the admin-server, mirrored from apps/server/server.mjs
// so the admin console behaves identically to the main app (cookie name, session
// hashing, origin checks, security headers). Kept in one module so server.mjs and
// future endpoint modules import a single source of truth.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'pv_session';
export const ADMIN_COOKIE_NAME = 'pv_admin_session';
export const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
export const MAX_BODY = 2_000_000;

export function verifyPassword(password, user) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 1024) return false;
  try {
    const actual = scryptSync(password, Buffer.from(user.password_salt, 'base64'), 32, { N: 32768, maxmem: 64 * 1024 * 1024 });
    const expected = Buffer.from(user.password_hash, 'base64');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
export const newAdminSession = () => randomBytes(32).toString('base64url');
export const adminCookie = (raw, maxAge = 28800) => `${ADMIN_COOKIE_NAME}=${raw}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

// Same session-id hashing as the main app: sha256 hex of the raw cookie value.
export const digest = x => createHash('sha256').update(x).digest('hex');

// Content-Security-Policy for the admin console. Mirrors the CF admin-worker CSP
// (script-src 'self' so the external /app.js loads; no inline scripts).
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': CSP
};

export const json = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(status === 204 ? '' : JSON.stringify(value));
};

// Origin derivation matches the main app: trust x-forwarded-proto from the reverse proxy.
export function requestOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  return `${proto}://${req.headers.host}`;
}
export function sameOrigin(req) {
  const expected = requestOrigin(req);
  if (typeof req.headers.origin === 'string' && req.headers.origin) return req.headers.origin === expected;
  if (typeof req.headers.referer === 'string' && req.headers.referer) {
    try { return new URL(req.headers.referer).origin === expected; } catch { return false; }
  }
  return req.headers['sec-fetch-site'] === 'same-origin';
}

export function readCookie(req, name) {
  return (req.headers.cookie || '').split(';').map(v => v.trim().split('=')).find(v => v[0] === name)?.[1];
}

export async function readJsonBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw Object.assign(new Error('too_large'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
  catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
}

// Parse ADMIN_USERNAMES ("alice,bob") as exact, case-sensitive usernames.
// Usernames are case-sensitive in the main service; folding case here could grant
// a distinct account administrative access. Falls back to ADMIN_USERNAME.
export function adminAllowlist(env) {
  return new Set((env.ADMIN_USERNAMES || env.ADMIN_USERNAME || '')
    .split(',').map(x => x.trim()).filter(Boolean));
}
