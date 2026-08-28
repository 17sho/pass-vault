// Server-build admin enforcement helpers — the Linux main server counterpart to
// the CF worker's inline ban/quota/invite/security/metrics logic.
//
// These read/write the SAME admin tables the admin-server manages (created by
// apps/admin-server/migrations-admin.mjs, applied at boot). Semantics mirror
// apps/worker/src/index.ts exactly:
//   - Bans: banned_until === -1 (permanent) or banned_until >= now (temporary).
//   - Quotas: user_quotas overrides, else DEFAULT_USER_QUOTA. expires_at gates rows.
//   - Invite codes: HMAC-SHA256(pepper, code) → 'hmac-sha256:v1:'+base64url; also
//     legacy static env INVITE_CODE fallback. used_count<max_uses atomically bumped.
//   - Security events: hourly-bucketed dedupe on (category,code,subject_hash,bucket).
//   - Daily metrics: admin_daily_metrics upsert keyed by date.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_USER_QUOTA = { entryLimit: 1000, attachmentCountLimit: 50, attachmentBytesLimit: 500 * 1024 * 1024 };

const sha256hex = x => createHash('sha256').update(x).digest('hex');

// ---- Bans ---------------------------------------------------------------
// Returns true when the user is currently suspended.
export function isBanned(user, now = Date.now()) {
  const b = user?.banned_until;
  return b !== null && b !== undefined && (b === -1 || b >= now);
}

// ---- Quotas -------------------------------------------------------------
export function userQuota(db, userId, now = Date.now()) {
  const q = db.prepare('SELECT entry_limit,attachment_count_limit,attachment_bytes_limit,expires_at FROM user_quotas WHERE user_id=? AND (expires_at IS NULL OR expires_at>?)').get(userId, now);
  return q || { entry_limit: DEFAULT_USER_QUOTA.entryLimit, attachment_count_limit: DEFAULT_USER_QUOTA.attachmentCountLimit, attachment_bytes_limit: DEFAULT_USER_QUOTA.attachmentBytesLimit, expires_at: null };
}

// checkEntryQuota — returns a quota-error descriptor {quota,limit} if a new entry
// would exceed the cap, else null. nextCount lets callers pass a precomputed count.
export function checkEntryQuota(db, userId, nextCount) {
  const q = userQuota(db, userId);
  const count = nextCount ?? (Number(db.prepare('SELECT COUNT(*) count FROM entries WHERE user_id=?').get(userId)?.count || 0) + 1);
  return count > q.entry_limit ? { quota: 'entries', limit: q.entry_limit } : null;
}

// physicalUserBytes — sum of unique object bytes the user holds: attachments plus
// committed secure-share objects (CF parity — the worker unions share objects into
// its SUM so share uploads count against the per-user byte quota).
export function physicalUserBytes(db, userId) {
  return Number(db.prepare(
    'SELECT COALESCE(SUM(ciphertext_size),0) bytes FROM ('
    + 'SELECT object_key,MAX(ciphertext_size) ciphertext_size FROM ('
    + 'SELECT object_key,ciphertext_size FROM attachments WHERE user_id=? '
    + 'UNION ALL '
    + 'SELECT o.object_key,o.ciphertext_size FROM secure_share_objects o '
    + 'JOIN secure_share_packages p ON p.token_hash=o.share_token_hash '
    + 'WHERE p.user_id=? AND o.uploaded_at IS NOT NULL'
    + ') GROUP BY object_key)'
  ).get(userId, userId)?.bytes || 0);
}

// checkAttachmentQuota — count + bytes gate. isNew adds 1 to the count for creates.
export function checkAttachmentQuota(db, userId, addedBytes, isNew = true) {
  const q = userQuota(db, userId);
  const count = Number(db.prepare('SELECT COUNT(*) count FROM attachments WHERE user_id=?').get(userId)?.count || 0) + (isNew ? 1 : 0);
  const bytes = physicalUserBytes(db, userId) + Math.max(0, addedBytes);
  if (count > q.attachment_count_limit) return { quota: 'attachments', limit: q.attachment_count_limit };
  if (bytes > q.attachment_bytes_limit) return { quota: 'attachment_bytes', limit: q.attachment_bytes_limit };
  return null;
}

// Replacement imports discard existing attachments but retain committed share
// objects. Gate against that final state rather than adding to the old files.
export function checkAttachmentReplacementQuota(db, userId, replacementCount, replacementBytes) {
  const q = userQuota(db, userId);
  const shareBytes = Number(db.prepare(`SELECT COALESCE(SUM(ciphertext_size),0) bytes FROM (
    SELECT o.object_key,MAX(o.ciphertext_size) ciphertext_size FROM secure_share_objects o
    JOIN secure_share_packages p ON p.token_hash=o.share_token_hash
    WHERE p.user_id=? AND o.uploaded_at IS NOT NULL GROUP BY o.object_key
  )`).get(userId)?.bytes || 0);
  if (replacementCount > q.attachment_count_limit) return { quota: 'attachments', limit: q.attachment_count_limit };
  if (shareBytes + Math.max(0, replacementBytes) > q.attachment_bytes_limit) return { quota: 'attachment_bytes', limit: q.attachment_bytes_limit };
  return null;
}

// ---- Invite codes -------------------------------------------------------
function inviteDigest(code, pepper) {
  return 'hmac-sha256:v1:' + createHmac('sha256', Buffer.from(pepper, 'utf8')).update(code, 'utf8').digest('base64url');
}

// registrationPolicy — mirrors the worker: enabled flag + closed message +
// whether any usable code exists (table rows with used_count<max_uses, or a
// legacy static env INVITE_CODE).
export function registrationPolicy(db, env) {
  const rows = db.prepare("SELECT key,value FROM admin_settings WHERE key IN ('registration_enabled','registration_closed_message')").all();
  const settings = Object.fromEntries(rows.map(x => [x.key, x.value]));
  // Table codes are only usable when the pepper needed to hash/compare them is
  // present; otherwise every correct code would fail 403. Fail closed: don't
  // advertise table codes as available without a pepper (parity with the worker's
  // config-guarded invite path). The legacy static env code is independent.
  const hasPepper = typeof env.INVITE_CODE_PEPPER === 'string' && env.INVITE_CODE_PEPPER.trim().length > 0;
  const active = hasPepper ? (Number(db.prepare('SELECT COUNT(*) count FROM invite_codes WHERE used_count<max_uses').get()?.count) || 0) : 0;
  const legacyEnv = typeof env.INVITE_CODE === 'string' && env.INVITE_CODE.length >= 6;
  return {
    enabled: settings.registration_enabled !== '0',
    message: (typeof settings.registration_closed_message === 'string' && settings.registration_closed_message) || '注册暂不可用，请联系管理员',
    activeCodes: active,
    legacyEnv,
  };
}

// consumeInvite — atomically validates + bumps used_count for a table code, or
// accepts the legacy static env code. Returns { ok, legacy } or { ok:false }.
// Must run inside a caller transaction that also inserts the user, so the code
// bump and user creation commit together (CF uses a batch with changes()=1 guards).
export function matchInviteCode(db, env, code) {
  if (env.INVITE_CODE_PEPPER?.trim()) {
    const hash = inviteDigest(code, env.INVITE_CODE_PEPPER);
    const row = db.prepare('SELECT code_hash FROM invite_codes WHERE code_hash=? AND used_count<max_uses').get(hash);
    if (row) return { ok: true, legacy: false, codeHash: row.code_hash };
  }
  if (typeof env.INVITE_CODE === 'string' && env.INVITE_CODE.length >= 6) {
    const a = createHash('sha256').update(code).digest(), b = createHash('sha256').update(env.INVITE_CODE).digest();
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true, legacy: true };
  }
  return { ok: false };
}

// bumpInviteUse — increments used_count guarded by used_count<max_uses AND the
// username not already taken (parity with the worker's conditional UPDATE).
// Returns the number of rows changed (1 = success).
export function bumpInviteUse(db, codeHash, username, now = Date.now()) {
  return db.prepare('UPDATE invite_codes SET used_count=used_count+1,last_used_at=? WHERE code_hash=? AND used_count<max_uses AND NOT EXISTS(SELECT 1 FROM users WHERE username=?)').run(now, codeHash, username).changes;
}

// ---- Security events ----------------------------------------------------
export function recordSecurityEvent(db, category, code, subject) {
  try {
    const now = Date.now(), bucket = Math.floor(now / 3600000), subjectHash = sha256hex(subject);
    db.prepare('INSERT INTO security_events(category,code,subject_hash,bucket,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(category,code,subject_hash,bucket) DO UPDATE SET count=count+1,last_seen_at=excluded.last_seen_at')
      .run(category, code, subjectHash, bucket, now, now);
  } catch { /* best-effort telemetry */ }
}

// ---- Daily metrics ------------------------------------------------------
export function captureDailyMetrics(db) {
  try {
    const users = Number(db.prepare('SELECT COUNT(*) c FROM users').get()?.c || 0);
    const entries = Number(db.prepare('SELECT COUNT(*) c FROM entries').get()?.c || 0);
    const d1Bytes = Number(db.prepare('SELECT page_count*page_size AS b FROM pragma_page_count(),pragma_page_size()').get()?.b || 0);
    const localBytes = Number(db.prepare("SELECT COALESCE(SUM(ciphertext_size),0) b FROM (SELECT object_key,MAX(ciphertext_size) ciphertext_size FROM (SELECT object_key,ciphertext_size FROM attachments UNION ALL SELECT object_key,ciphertext_size FROM secure_share_objects WHERE uploaded_at IS NOT NULL) GROUP BY object_key)").get()?.b || 0);
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    db.prepare("INSERT INTO admin_daily_metrics(day,users,entries,d1_bytes,r2_bytes,captured_at) VALUES(?,?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET users=excluded.users,entries=excluded.entries,d1_bytes=excluded.d1_bytes,r2_bytes=excluded.r2_bytes,captured_at=excluded.captured_at")
      .run(day, users, entries, d1Bytes, localBytes, now);
  } catch { /* metrics are best-effort */ }
}
