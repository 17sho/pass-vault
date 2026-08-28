// Admin user-management endpoints — server-build port of admin-worker.
// Endpoints: GET /api/users (paged/search/sort/risk), GET /api/users/:u/export,
// PATCH /api/users/:u/quota, DELETE /api/users/:u/quota (reset),
// POST/DELETE /api/users/:u/suspension, DELETE /api/users/:u/sessions (revoke),
// DELETE /api/users/:u (delete user + physical files).
//
// Local adaptations vs Cloudflare:
//   - unixepoch()*1000 SQL literals -> bound Date.now() params (node:sqlite has no unixepoch()*1000 idiom issues, but we bind for parity/portability)
//   - R2 object deletion -> unlink physical files (attachments under ATTACHMENTS_DIR/<sha256(userId)>/, shares under SHARES_DIR)
//   - No attachment_versions / r2_inflight_uploads tables (server has neither)
//   - password_iterations column -> parsed from users.kdf JSON
import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { DEFAULT_USER_QUOTA, mapUser } from './overview.mjs';

const digest = x => createHash('sha256').update(x).digest('hex');

function userDir(attachmentsDir, userId) { return join(attachmentsDir, digest(userId)); }
function sharesDir(env) { return resolve(env.SHARES_DIR || join(dirname(env.DB_PATH), 'shares')); }

export function auditLog(db, actor, action, target, details) {
  db.prepare('INSERT INTO admin_audit_logs(actor_email,action,target_username,details_json,created_at) VALUES(?,?,?,?,?)')
    .run(actor, action, target, JSON.stringify(details ?? {}), Date.now());
}

// GET /api/users — paginated list with search/sort/risk filters.
// Ports the CF CTE. We compute risk flags in JS (via mapUser) rather than SQL,
// filtering/sorting the already-mapped rows — simpler and identical output for
// the modest user counts of a personal deployment.
export function pagedUsers(db, url) {
  const page = Number(url.searchParams.get('page') || 1);
  const pageSize = Number(url.searchParams.get('pageSize') || 20);
  const sort = url.searchParams.get('sort') || 'activity';
  const risk = url.searchParams.get('risk') || 'all';
  const q = (url.searchParams.get('q') || '').trim();
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
    || !['activity', 'created', 'entries'].includes(sort)
    || !['all', 'attention', 'quotaNearLimit', 'inactive', 'noPasskey', 'manySessions'].includes(risk)
    || q.length > 80) return null;

  const now = Date.now();
  const args = [now, now];
  let where = '';
  if (q) { where = "WHERE u.username LIKE ? ESCAPE '\\'"; args.push('%' + q.replace(/[\\%_]/g, '\\$&') + '%'); }
  const rows = db.prepare(`SELECT u.username,u.created_at,u.kdf,u.banned_until,
    (SELECT COUNT(*) FROM entries e WHERE e.user_id=u.id) entry_count,
    (SELECT COUNT(*) FROM attachments a WHERE a.user_id=u.id) attachment_count,
    (SELECT COALESCE(SUM(a.ciphertext_size),0) FROM attachments a WHERE a.user_id=u.id) attachment_bytes,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>?) active_sessions,
    (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id=u.id) last_seen_at,
    (SELECT auth_method FROM sessions sx WHERE sx.user_id=u.id ORDER BY COALESCE(sx.last_seen_at,sx.created_at,0) DESC LIMIT 1) last_auth_method,
    (SELECT COUNT(*) FROM passkey_credentials p WHERE p.user_id=u.id) passkey_count,
    q.entry_limit,q.attachment_count_limit,q.attachment_bytes_limit,q.expires_at quota_expires_at
    FROM users u LEFT JOIN user_quotas q ON q.user_id=u.id AND (q.expires_at IS NULL OR q.expires_at>?)
    ${where}`).all(...args);

  let users = rows.map(mapUser);
  if (risk !== 'all') users = users.filter(u => risk === 'attention' ? Object.values(u.riskFlags).some(Boolean) : u.riskFlags[risk]);
  const cmp = {
    activity: (a, b) => (b.lastSeenAt - a.lastSeenAt) || (b.createdAt - a.createdAt),
    created: (a, b) => b.createdAt - a.createdAt,
    entries: (a, b) => (b.entries - a.entries) || (b.createdAt - a.createdAt)
  }[sort];
  users.sort(cmp);

  const total = users.length;
  const pageUsers = users.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
  return { users: pageUsers, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } };
}

// PATCH /api/users/:u/quota
export function updateUserQuota(db, actor, username, input) {
  if (!input || typeof input !== 'object') return null;
  const x = input;
  const entryLimit = Number(x.entryLimit), attachmentCountLimit = Number(x.attachmentCountLimit), attachmentBytesLimit = Number(x.attachmentBytesLimit);
  const expiresAt = x.expiresAt === null ? null : Number(x.expiresAt);
  if (!Number.isSafeInteger(entryLimit) || entryLimit < 1 || entryLimit > 5000
    || !Number.isSafeInteger(attachmentCountLimit) || attachmentCountLimit < 0 || attachmentCountLimit > 200
    || !Number.isSafeInteger(attachmentBytesLimit) || attachmentBytesLimit < 0 || attachmentBytesLimit > 1073741824
    || (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()))) return null;
  const user = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (!user) return undefined;
  const now = Date.now(), details = { entryLimit, attachmentCountLimit, attachmentBytesLimit, expiresAt };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO user_quotas(user_id,entry_limit,attachment_count_limit,attachment_bytes_limit,expires_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET entry_limit=excluded.entry_limit,attachment_count_limit=excluded.attachment_count_limit,attachment_bytes_limit=excluded.attachment_bytes_limit,expires_at=excluded.expires_at,updated_at=excluded.updated_at')
      .run(user.id, entryLimit, attachmentCountLimit, attachmentBytesLimit, expiresAt, now);
    auditLog(db, actor, 'update_user_quota', username, details);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return details;
}

// DELETE /api/users/:u/quota — reset to defaults.
export function resetUserQuota(db, actor, username) {
  const user = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (!user) return undefined;
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = db.prepare('DELETE FROM user_quotas WHERE user_id=?').run(user.id);
    if (Number(r.changes) !== 1) { db.exec('ROLLBACK'); return null; }
    auditLog(db, actor, 'reset_user_quota', username, {});
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { reset: true };
}

// POST /api/users/:u/suspension (suspend) and DELETE (unsuspend).
export function setSuspension(db, actor, username, input, remove = false) {
  if (!input || typeof input !== 'object') return null;
  const x = input;
  if (x.confirmUsername !== username) return null;
  const user = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (!user) return undefined;
  const now = Date.now();
  if (remove) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE users SET banned_until=NULL,ban_reason=NULL,banned_at=NULL,banned_by=NULL WHERE id=?').run(user.id);
      auditLog(db, actor, 'unsuspend_user', username, {});
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { suspended: false };
  }
  const reason = typeof x.reason === 'string' ? x.reason.trim() : '';
  const until = x.until === null ? -1 : Number(x.until);
  if (!reason || reason.length > 200 || /[\u0000-\u001f\u007f-\u009f]/.test(reason)
    || !Number.isSafeInteger(until) || (until !== -1 && until <= now)) return null;
  let revoked = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE users SET banned_until=?,ban_reason=?,banned_at=?,banned_by=? WHERE id=?').run(until, reason, now, actor, user.id);
    revoked = Number(db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id).changes) || 0;
    auditLog(db, actor, 'suspend_user', username, { until, reason, revoked: true });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { suspended: true, until: until === -1 ? null : until, revoked };
}

// DELETE /api/users/:u/sessions — revoke all sessions.
export function revokeSessions(db, actor, username) {
  const user = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (!user) return null;
  let revoked = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    revoked = Number(db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id).changes) || 0;
    if (revoked > 0) auditLog(db, actor, 'revoke_sessions', username, { revoked });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return revoked;
}

// DELETE /api/users/:u — remove the user + cascade child rows + unlink files.
// The server has no pending_r2_deletions worker; because pending_file_deletions
// cascades on user delete, we collect object keys first, delete the user (cascade
// clears entries/attachments/sessions/shares rows), then unlink physical files.
export async function deleteUser(db, env, actor, username) {
  const user = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (!user) return null;

  const attachmentKeys = db.prepare('SELECT object_key FROM attachments WHERE user_id=?').all(user.id).map(r => r.object_key);
  const shareKeys = db.prepare(`SELECT o.object_key FROM secure_share_objects o
    JOIN secure_share_packages p ON p.token_hash=o.share_token_hash
    WHERE p.user_id=? AND o.uploaded_at IS NOT NULL`).all(user.id).map(r => r.object_key);

  db.exec('BEGIN IMMEDIATE');
  try {
    const r = db.prepare('DELETE FROM users WHERE id=?').run(user.id);
    if (Number(r.changes) < 1) { db.exec('ROLLBACK'); throw new Error('delete_user_conflict'); }
    auditLog(db, actor, 'delete_user', username, { status: 'deleted', attachments: attachmentKeys.length, shares: shareKeys.length });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  // Best-effort physical cleanup (rows are already gone; missing files are fine).
  // Any non-ENOENT failure leaves the file as a discoverable orphan: the maintenance
  // scan walks ATTACHMENTS_DIR/<sha256(userId)> and SHARES_DIR/<tokenHash>/ and finds
  // files with no DB reference, and repair unlinks them. We surface the failure count
  // (audit + return) so an admin knows to run a maintenance scan when cleanup is partial.
  const dir = userDir(env.ATTACHMENTS_DIR, user.id);
  const sdir = sharesDir(env);
  let removed = 0, failed = 0;
  for (const key of attachmentKeys) { try { await unlink(join(dir, key)); removed++; } catch (e) { if (e.code !== 'ENOENT') failed++; } }
  for (const key of shareKeys) { try { await unlink(join(sdir, key)); removed++; } catch (e) { if (e.code !== 'ENOENT') failed++; } }
  if (failed > 0) { try { auditLog(db, actor, 'delete_user', username, { status: 'cleanup_incomplete', filesRemoved: removed, filesFailed: failed, hint: 'run maintenance scan' }); } catch {} }
  return { deleted: true, filesRemoved: removed, filesFailed: failed };
}

const csvCell = value => {
  let text = String(value ?? '');
  if (typeof value === 'string') text = "'" + text.replace(/[\p{Cc}\p{Cf}]/gu, '');
  return /[",\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
};

// GET /api/users/:u/export?format=json|csv
export function exportUser(db, actor, username, format) {
  if (!['json', 'csv'].includes(format)) return { error: 'invalid' };
  const now = Date.now();
  const row = db.prepare(`SELECT u.username,u.created_at,u.banned_until,
    (SELECT COUNT(*) FROM entries WHERE user_id=u.id) entry_count,
    (SELECT COUNT(*) FROM attachments WHERE user_id=u.id) attachment_count,
    (SELECT COALESCE(SUM(ciphertext_size),0) FROM attachments WHERE user_id=u.id) attachment_bytes,
    (SELECT COUNT(*) FROM sessions WHERE user_id=u.id AND expires_at>?) active_sessions,
    (SELECT MAX(last_seen_at) FROM sessions WHERE user_id=u.id) last_seen_at,
    (SELECT COUNT(*) FROM passkey_credentials WHERE user_id=u.id) passkey_count,
    q.entry_limit,q.attachment_count_limit,q.attachment_bytes_limit,q.expires_at quota_expires_at
    FROM users u LEFT JOIN user_quotas q ON q.user_id=u.id WHERE u.username=?`).get(now, username);
  if (!row) return { error: 'not_found' };
  const data = {
    username: String(row.username), createdAt: Number(row.created_at) || 0,
    suspension: { active: row.banned_until !== null && (Number(row.banned_until) === -1 || Number(row.banned_until) >= Date.now()), until: Number(row.banned_until) === -1 ? null : Number(row.banned_until) || null },
    usage: { entries: Number(row.entry_count) || 0, attachments: Number(row.attachment_count) || 0, attachmentBytes: Number(row.attachment_bytes) || 0 },
    sessions: { active: Number(row.active_sessions) || 0, lastSeenAt: Number(row.last_seen_at) || 0 },
    passkeys: Number(row.passkey_count) || 0,
    quota: { entryLimit: row.entry_limit === null ? DEFAULT_USER_QUOTA.entryLimit : Number(row.entry_limit), attachmentCountLimit: row.attachment_count_limit === null ? DEFAULT_USER_QUOTA.attachmentCountLimit : Number(row.attachment_count_limit), attachmentBytesLimit: row.attachment_bytes_limit === null ? DEFAULT_USER_QUOTA.attachmentBytesLimit : Number(row.attachment_bytes_limit), expiresAt: row.quota_expires_at === null ? null : Number(row.quota_expires_at) }
  };
  auditLog(db, actor, 'export_user_metadata', username, { format });
  if (format === 'json') return { contentType: 'application/json; charset=utf-8', filename: 'user-metadata.json', body: JSON.stringify(data, null, 2) };
  const flat = { username: data.username, createdAt: data.createdAt, suspended: data.suspension.active, suspensionUntil: data.suspension.until ?? '', entries: data.usage.entries, attachments: data.usage.attachments, attachmentBytes: data.usage.attachmentBytes, activeSessions: data.sessions.active, lastSeenAt: data.sessions.lastSeenAt, passkeys: data.passkeys, entryLimit: data.quota.entryLimit, attachmentCountLimit: data.quota.attachmentCountLimit, attachmentBytesLimit: data.quota.attachmentBytesLimit, quotaExpiresAt: data.quota.expiresAt ?? '' };
  const keys = Object.keys(flat);
  return { contentType: 'text/csv; charset=utf-8', filename: 'user-metadata.csv', body: keys.join(',') + '\n' + keys.map(k => csvCell(flat[k])).join(',') + '\n' };
}

// GET /api/audit — paginated audit log.
export function pagedAudit(db, url) {
  const page = Number(url.searchParams.get('page') || 1);
  const pageSize = Number(url.searchParams.get('pageSize') || 20);
  const filter = url.searchParams.get('action') || 'all';
  const actions = { delete: 'delete_user', revoke: 'revoke_sessions', maintenance: 'retry_maintenance', registration: 'update_registration' };
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !['all', ...Object.keys(actions)].includes(filter)) return null;
  const where = filter === 'all' ? '' : 'WHERE action=?';
  const args = filter === 'all' ? [] : [actions[filter]];
  const total = Number(db.prepare(`SELECT COUNT(*) total FROM admin_audit_logs ${where}`).get(...args)?.total) || 0;
  const rows = db.prepare(`SELECT actor_email,action,target_username,details_json,created_at FROM admin_audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
  return { audit: rows.map(x => ({ actor: String(x.actor_email || ''), action: String(x.action || ''), target: String(x.target_username || ''), details: String(x.details_json || '{}'), createdAt: Number(x.created_at) || 0 })), pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } };
}
