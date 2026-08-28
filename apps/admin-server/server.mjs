// Pass Vault — Admin console server (Linux/SQLite build).
// Server-build counterpart to the Cloudflare admin-worker (admin.pass.23cm.me).
//
// This is the phase-1 skeleton: DB bootstrap + admin migrations + auth middleware
// + health endpoint. Later phases add the overview/users/maintenance/etc. handlers.
//
// Auth model (replaces Cloudflare Access):
//   1. A visitor may authenticate directly with an allowlisted vault account; the
//      Admin issues a host-only pv_admin_session. Existing shared pv_session
//      cookies remain supported for compatibility, but are not required.
//   2. The resolved username must exactly match ADMIN_USERNAMES.
//   Both checks must pass or the request is rejected (401 unauthenticated / 403
//   not-an-admin). Mutations additionally require same-origin.
import { createServer } from 'node:http';
import { resolve, join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { normalizeSessionIp } from '../../shared/session-metadata.mjs';
import { runAdminMigrations } from './migrations-admin.mjs';
import { json, requestOrigin, sameOrigin, readCookie, digest, adminAllowlist, COOKIE_NAME, ADMIN_COOKIE_NAME, ADMIN_SESSION_MS, adminCookie, newAdminSession, verifyPassword, SECURITY_HEADERS } from './runtime.mjs';
import { overview } from './overview.mjs';
import { pagedUsers, pagedAudit, updateUserQuota, resetUserQuota, setSuspension, revokeSessions, deleteUser, exportUser } from './users.mjs';
import { scanMaintenance, repairMaintenance, retryMaintenance } from './maintenance.mjs';
import { updateRegistration, createInvite, deleteInvite, revealInvite, reviewSecurityEvent } from './settings.mjs';
import { refreshDiskStats, refreshNotifications } from './refresh.mjs';
import { adminPage, adminLoginPage } from './ui/page.mjs';
import { ADMIN_SCRIPT } from './ui/script.mjs';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.ADMIN_PORT || 8110);
const DB_PATH = resolve(process.env.DB_PATH || join(process.cwd(), 'data', 'pass-vault.sqlite'));
const ATTACHMENTS_DIR = resolve(process.env.ATTACHMENTS_DIR || join(dirname(DB_PATH), 'attachments'));
const SHARES_DIR = resolve(process.env.SHARES_DIR || join(dirname(DB_PATH), 'shares'));
const MAIN_SITE_URL = process.env.MAIN_SITE_URL || '';
const ADMINS = adminAllowlist(process.env);
const TRUSTED_IP_HEADER = (process.env.CLIENT_IP_HEADER || '').trim().toLowerCase();
const APP_VERSION = process.env.APP_VERSION || 'unknown';
// Env bag passed to endpoint modules (keeps them free of process.env coupling).
const env = { DB_PATH, ATTACHMENTS_DIR, SHARES_DIR, MAIN_SITE_URL, APP_VERSION, INVITE_CODE_PEPPER: process.env.INVITE_CODE_PEPPER || '', INVITE_CODE_ENCRYPTION_KEY: process.env.INVITE_CODE_ENCRYPTION_KEY || '' };

// readBody parses a JSON request body (bounded). Mirrors the main app's body().
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 2_000_000) throw Object.assign(new Error('too_large'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
  catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
}

await mkdir(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');

// Ensure admin schema exists (idempotent). The admin-server owns these migrations
// so the console works even if the main app hasn't been restarted.
const applied = runAdminMigrations(db);
db.exec(`CREATE TABLE IF NOT EXISTS admin_sessions(
  id_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);`);
if (applied.length) console.log(`[admin] applied migrations: ${applied.join(', ')}`);

// Resolve the current admin identity, or null. Mirrors the main app's auth():
// expired sessions are swept, the cookie is hashed, and we join to users.
function adminIdentity(req) {
  const now = Date.now();
  db.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').run(now);
  const own = readCookie(req, ADMIN_COOKIE_NAME);
  if (own) {
    const row = db.prepare('SELECT s.user_id,s.id_hash,u.username FROM admin_sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.expires_at>? AND (u.banned_until IS NULL OR (u.banned_until<>-1 AND u.banned_until<?))').get(digest(own), now, now);
    if (row) return { userId: row.user_id, username: String(row.username || ''), sessionHash: row.id_hash, own: true };
  }
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
  const raw = readCookie(req, COOKIE_NAME);
  if (!raw) return null;
  const row = db.prepare('SELECT s.user_id,s.id_hash,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.expires_at>? AND (u.banned_until IS NULL OR (u.banned_until<>-1 AND u.banned_until<?))').get(digest(raw), now, now);
  if (!row) return null;
  return { userId: row.user_id, username: String(row.username || ''), sessionHash: row.id_hash, own: false };
}

function adminClientIp(req) {
  if (TRUSTED_IP_HEADER) {
    const raw = req.headers[TRUSTED_IP_HEADER], value = Array.isArray(raw) ? '' : raw;
    const normalized = normalizeSessionIp(value);
    if (normalized !== 'unknown') return normalized;
  }
  return req.socket.remoteAddress || 'unknown';
}

function attemptAdminLogin(req, username, password) {
  const now = Date.now(), key = `admin-login:${adminClientIp(req)}`;
  db.prepare('DELETE FROM auth_attempts WHERE attempted_at<?').run(now - 60_000);
  const attempts = db.prepare('SELECT COUNT(*) count FROM auth_attempts WHERE key=? AND attempted_at>?').get(key, now - 60_000).count;
  if (attempts >= 10) return { status: 429 };
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  const verifier = user || { password_salt: 'YWRtaW4tbG9naW4tZHVtbQ==', password_hash: 'vBbk9d107EZJVUMR5I4Ym426nc9INhq3vFrD+D+UNlY=' };
  const passwordOk = verifyPassword(password, verifier);
  if (!user || !ADMINS.has(username) || !passwordOk || user.banned_until === -1 || (Number.isFinite(user.banned_until) && user.banned_until > now)) {
    let slot = now; while (db.prepare('SELECT 1 FROM auth_attempts WHERE key=? AND attempted_at=?').get(key, slot)) slot++;
    db.prepare('INSERT INTO auth_attempts VALUES(?,?)').run(key, slot);
    return { status: 401 };
  }
  const raw = newAdminSession();
  db.prepare('INSERT INTO admin_sessions(id_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(digest(raw), user.id, now + ADMIN_SESSION_MS, now);
  return { status: 200, raw };
}

async function readForm(req) {
  let size = 0, text = '';
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw Object.assign(new Error('too_large'), { status: 413 }); text += chunk; }
  return new URLSearchParams(text);
}

async function fetchMainHealth(base) {
  if (!base) return { ok: false, appVersion: 'unknown' };
  try {
    const response = await fetch(new URL('/api/health', base), { headers: { accept: 'application/json' } });
    if (!response.ok) return { ok: false, appVersion: 'unknown' };
    const data = await response.json();
    return { ok: data.ok === true, appVersion: typeof data.appVersion === 'string' && data.appVersion ? data.appVersion : 'unknown' };
  } catch { return { ok: false, appVersion: 'unknown' }; }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname;

    // --- Static console shell (public: contains no data; all data is behind /api gate) ---
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, max-age=0', ...SECURITY_HEADERS });
      const identity = adminIdentity(req);
      return res.end(identity && ADMINS.has(identity.username) ? adminPage() : adminLoginPage(url.searchParams.get('error') === '1'));
    }
    if (req.method === 'GET' && path === '/app.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store, max-age=0', ...SECURITY_HEADERS });
      return res.end(ADMIN_SCRIPT);
    }
    // Independent Admin login: verifies the vault account directly and issues a
    // host-only cookie, avoiding cross-subdomain cookie-container dependencies.
    if (req.method === 'POST' && path === '/api/admin-login') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'invalid_origin' });
      const body = await readBody(req), result = attemptAdminLogin(req, typeof body.username === 'string' ? body.username : '', body.password);
      if (result.status !== 200) return json(res, result.status, { error: result.status === 429 ? 'rate_limited' : 'invalid_credentials' });
      return json(res, 200, { ok: true }, { 'set-cookie': adminCookie(result.raw) });
    }
    if (req.method === 'POST' && path === '/login') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'invalid_origin' });
      const form = await readForm(req), result = attemptAdminLogin(req, form.get('username') || '', form.get('password') || '');
      res.writeHead(303, { location: result.status === 200 ? '/' : '/?error=1', ...(result.status === 200 ? { 'set-cookie': adminCookie(result.raw) } : {}), ...SECURITY_HEADERS });
      return res.end();
    }

    // Logout: revoke the current session (if any) and clear the cookie, then redirect home.
    if (path === '/logout') {
      if (req.method !== 'POST' || !sameOrigin(req)) return json(res, 403, { error: 'invalid_origin' });
      const own = readCookie(req, ADMIN_COOKIE_NAME), raw = readCookie(req, COOKIE_NAME);
      if (own) db.prepare('DELETE FROM admin_sessions WHERE id_hash=?').run(digest(own));
      else if (raw) db.prepare('DELETE FROM sessions WHERE id_hash=?').run(digest(raw));
      res.writeHead(302, { location: '/', 'set-cookie': adminCookie('', 0), ...SECURITY_HEADERS });
      return res.end();
    }

    // --- Auth gate: valid session + admin allowlist membership ---
    const identity = adminIdentity(req);
    if (!identity) return json(res, 401, { error: 'auth_required' });
    if (!ADMINS.size || !ADMINS.has(identity.username)) return json(res, 403, { error: 'forbidden' });

    // Health endpoint (read-only).
    if (req.method === 'GET' && path === '/api/health') {
      const main = await fetchMainHealth(MAIN_SITE_URL);
      return json(res, 200, { ok: true, admin: identity.username, main });
    }

    // Overview dashboard (read-only). compact=1 skips the heavy per-user scans.
    if (req.method === 'GET' && path === '/api/overview') {
      return json(res, 200, await overview(db, env, url.searchParams.get('compact') === '1'));
    }

    // GET /api/users — paginated list.
    if (req.method === 'GET' && path === '/api/users') {
      const result = pagedUsers(db, url);
      return result ? json(res, 200, result) : json(res, 400, { error: 'invalid_request' });
    }

    // GET /api/audit — paginated audit log.
    if (req.method === 'GET' && path === '/api/audit') {
      const result = pagedAudit(db, url);
      return result ? json(res, 200, result) : json(res, 400, { error: 'invalid_request' });
    }

    // GET /api/users/:u/export
    const userExport = path.match(/^\/api\/users\/([^/]+)\/export$/);
    if (req.method === 'GET' && userExport) {
      const result = exportUser(db, identity.username, decodeURIComponent(userExport[1]), url.searchParams.get('format') || 'json');
      if (result.error === 'invalid') return json(res, 400, { error: 'invalid_request' });
      if (result.error === 'not_found') return json(res, 404, { error: 'not_found' });
      res.writeHead(200, { 'content-type': result.contentType, 'cache-control': 'no-store', 'content-disposition': `attachment; filename="${result.filename}"`, ...SECURITY_HEADERS });
      return res.end(result.body);
    }

    // --- Mutations below require same-origin (CSRF defense) ---
    if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) return json(res, 403, { error: 'invalid_origin' });

    const quotaRoute = path.match(/^\/api\/users\/([^/]+)\/quota$/);
    const suspensionRoute = path.match(/^\/api\/users\/([^/]+)\/suspension$/);
    const sessionsRoute = path.match(/^\/api\/users\/([^/]+)\/sessions$/);
    const userRoute = path.match(/^\/api\/users\/([^/]+)$/);

    // PUT /api/users/:u/quota — set override (CF-canonical method).
    if (req.method === 'PUT' && quotaRoute) {
      const username = decodeURIComponent(quotaRoute[1]);
      const result = updateUserQuota(db, identity.username, username, await readBody(req));
      if (result === null) return json(res, 400, { error: 'invalid_request' });
      if (result === undefined) return json(res, 404, { error: 'not_found' });
      return json(res, 200, result);
    }

    // DELETE /api/users/:u/quota — reset to defaults.
    if (req.method === 'DELETE' && quotaRoute) {
      const username = decodeURIComponent(quotaRoute[1]);
      const result = resetUserQuota(db, identity.username, username);
      if (result === undefined) return json(res, 404, { error: 'not_found' });
      if (result === null) return json(res, 409, { error: 'no_override' });
      return json(res, 200, result);
    }

    // PUT /api/users/:u/suspension — suspend (CF-canonical method).
    if (req.method === 'PUT' && suspensionRoute) {
      const username = decodeURIComponent(suspensionRoute[1]);
      const result = setSuspension(db, identity.username, username, await readBody(req), false);
      if (result === null) return json(res, 400, { error: 'invalid_request' });
      if (result === undefined) return json(res, 404, { error: 'not_found' });
      return json(res, 200, result);
    }

    // DELETE /api/users/:u/suspension — unsuspend.
    if (req.method === 'DELETE' && suspensionRoute) {
      const username = decodeURIComponent(suspensionRoute[1]);
      const result = setSuspension(db, identity.username, username, await readBody(req), true);
      if (result === null) return json(res, 400, { error: 'invalid_request' });
      if (result === undefined) return json(res, 404, { error: 'not_found' });
      return json(res, 200, result);
    }

    // DELETE /api/users/:u/sessions — revoke all sessions.
    if (req.method === 'DELETE' && sessionsRoute) {
      const username = decodeURIComponent(sessionsRoute[1]);
      const revoked = revokeSessions(db, identity.username, username);
      if (revoked === null) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { revoked });
    }

    // DELETE /api/users/:u — delete user (requires x-confirm-username header).
    if (req.method === 'DELETE' && userRoute) {
      const username = decodeURIComponent(userRoute[1]);
      if (!username || username.length > 80 || req.headers['x-confirm-username'] !== username) return json(res, 400, { error: 'confirmation_required' });
      const result = await deleteUser(db, env, identity.username, username);
      if (!result) return json(res, 404, { error: 'not_found' });
      return json(res, 200, result);
    }

    // POST /api/maintenance/scan — orphan-file scan.
    if (req.method === 'POST' && path === '/api/maintenance/scan') {
      return json(res, 200, await scanMaintenance(db, env, identity.username));
    }

    // POST /api/maintenance/:id/repair — queue a report's orphans.
    const repairRoute = path.match(/^\/api\/maintenance\/(\d+)\/repair$/);
    if (req.method === 'POST' && repairRoute) {
      const result = await repairMaintenance(db, env, identity.username, Number(repairRoute[1]), await readBody(req));
      if (result === null) return json(res, 400, { error: 'invalid_request' });
      if (result === undefined) return json(res, 404, { error: 'not_found' });
      return json(res, 200, result);
    }

    // POST /api/maintenance/retry — process the deletion queue.
    if (req.method === 'POST' && path === '/api/maintenance/retry') {
      return json(res, 200, await retryMaintenance(db, env, identity.username));
    }

    // PUT /api/registration — toggle + closed message.
    if (req.method === 'PUT' && path === '/api/registration') {
      const result = updateRegistration(db, identity.username, await readBody(req));
      return result ? json(res, 200, result) : json(res, 400, { error: 'invalid_request' });
    }

    // POST /api/invite-codes — create.
    if (req.method === 'POST' && path === '/api/invite-codes') {
      const result = createInvite(db, env, identity.username, await readBody(req));
      if (result.error === 'secret_unavailable') return json(res, 503, { error: 'invite_code_secret_unavailable' });
      if (result.error === 'duplicate') return json(res, 409, { error: 'duplicate_code' });
      if (result.error) return json(res, 400, { error: 'invalid_request' });
      return json(res, 201, result.value);
    }

    const inviteRoute = path.match(/^\/api\/invite-codes\/([^/]+)$/);
    const inviteReveal = path.match(/^\/api\/invite-codes\/([^/]+)\/reveal$/);

    // GET /api/invite-codes/:id/reveal — decrypt plaintext (read-only; auth already enforced).
    if (req.method === 'GET' && inviteReveal) {
      const result = revealInvite(db, env, identity.username, decodeURIComponent(inviteReveal[1]));
      if (result === undefined) return json(res, 400, { error: 'invalid_request' });
      if (result === null) return json(res, 404, { error: 'not_found' });
      if (result.error) return json(res, 422, { error: 'undecryptable' });
      return json(res, 200, result.value);
    }

    // DELETE /api/invite-codes/:id
    if (req.method === 'DELETE' && inviteRoute) {
      const result = deleteInvite(db, identity.username, decodeURIComponent(inviteRoute[1]));
      if (result === undefined) return json(res, 400, { error: 'invalid_request' });
      if (result === null) return json(res, 404, { error: 'not_found' });
      return json(res, 200, result);
    }

    // PUT /api/security-events/review
    if (req.method === 'PUT' && path === '/api/security-events/review') {
      const result = reviewSecurityEvent(db, identity.username, await readBody(req));
      return result ? json(res, 200, result) : json(res, 400, { error: 'invalid_request' });
    }

    // POST /api/r2-stats/refresh — recompute disk (R2-equivalent) usage.
    if (req.method === 'POST' && path === '/api/r2-stats/refresh') {
      return json(res, 200, refreshDiskStats(db, env, identity.username));
    }

    // POST /api/notifications/refresh — rebuild notification center from recent security events.
    if (req.method === 'POST' && path === '/api/notifications/refresh') {
      return json(res, 200, refreshNotifications(db, identity.username));
    }

    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json(res, status, { error: status === 500 ? 'internal_error' : String(error.message || 'error') });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`pass-vault admin server listening on ${HOST}:${PORT}`);
  console.log(`[admin] DB=${DB_PATH} attachments=${ATTACHMENTS_DIR} admins=${[...ADMINS].join(',') || '(none set!)'}`);
  if (!ADMINS.size) console.warn('[admin] WARNING: ADMIN_USERNAMES not set — every request will be forbidden (403).');
});

export { db, adminIdentity, ATTACHMENTS_DIR, DB_PATH };
