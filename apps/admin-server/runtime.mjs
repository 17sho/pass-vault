// Shared runtime helpers for the admin-server, mirrored from apps/server/server.mjs
// so the admin console behaves identically to the main app (cookie name, session
// hashing, origin checks, security headers). Kept in one module so server.mjs and
// future endpoint modules import a single source of truth.
import { createHash } from 'node:crypto';

export const COOKIE_NAME = 'pv_session';
export const MAX_BODY = 2_000_000;

// Same session-id hashing as the main app: sha256 hex of the raw cookie value.
export const digest = x => createHash('sha256').update(x).digest('hex');

// Content-Security-Policy for the admin console. Mirrors the CF admin-worker CSP
// (script-src 'self' so the external /app.js loads; no inline scripts).
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

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
export function sameOrigin(req) { return req.headers.origin === requestOrigin(req); }

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
