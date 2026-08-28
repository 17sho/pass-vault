// Admin overview endpoint — server-build port of admin-worker overview().
// Adaptations vs Cloudflare:
//   - R2 storage stats  -> local filesystem (attachments.ciphertext_size sum + DB file size)
//   - D1 size_after     -> SQLite file byte size (statSync)
//   - pending_r2_deletions -> pending_file_deletions
//   - r2_inflight_uploads / r2_monthly_usage (Class A/B) -> not applicable, reported 0
//   - password_iterations -> parsed from the users.kdf JSON ({iterations})
import { statSync } from 'node:fs';

const DEFAULT_USER_QUOTA = { entryLimit: 1000, attachmentCountLimit: 50, attachmentBytesLimit: 500 * 1024 * 1024 };

function kdfIterations(kdf) {
  try { return Number(JSON.parse(String(kdf || '{}')).iterations) || 0; } catch { return 0; }
}
function dbBytes(dbPath) {
  try { return statSync(dbPath).size || 0; } catch { return 0; }
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

// Map a raw joined user row into the admin user shape (matches CF field names).
function mapUser(x) {
  const iterations = kdfIterations(x.kdf);
  const bannedUntil = x.banned_until === null || x.banned_until === undefined ? null : Number(x.banned_until);
  const u = {
    username: String(x.username || ''),
    createdAt: Number(x.created_at) || 0,
    suspended: bannedUntil !== null && (bannedUntil === -1 || bannedUntil >= Date.now()),
    suspendedUntil: bannedUntil === -1 ? null : bannedUntil,
    entries: Number(x.entry_count) || 0,
    attachments: Number(x.attachment_count) || 0,
    attachmentBytes: Number(x.attachment_bytes) || 0,
    activeSessions: Number(x.active_sessions) || 0,
    lastSeenAt: Number(x.last_seen_at) || 0,
    lastAuthMethod: ['password', 'passkey'].includes(String(x.last_auth_method)) ? String(x.last_auth_method) : 'unknown',
    passwordConfigured: iterations > 0,
    passkeys: Number(x.passkey_count) || 0,
    passwordPolicy: iterations >= 100000 ? '当前策略' : '需检查',
    quota: {
      entryLimit: Number(x.entry_limit) || DEFAULT_USER_QUOTA.entryLimit,
      attachmentCountLimit: x.attachment_count_limit === null || x.attachment_count_limit === undefined ? DEFAULT_USER_QUOTA.attachmentCountLimit : Number(x.attachment_count_limit),
      attachmentBytesLimit: x.attachment_bytes_limit === null || x.attachment_bytes_limit === undefined ? DEFAULT_USER_QUOTA.attachmentBytesLimit : Number(x.attachment_bytes_limit),
      expiresAt: x.quota_expires_at === null || x.quota_expires_at === undefined ? null : Number(x.quota_expires_at),
      source: x.entry_limit === null || x.entry_limit === undefined ? 'default' : 'override'
    }
  };
  const ratio = (used, limit) => limit > 0 ? used / limit : used > 0 ? Infinity : 0;
  u.riskFlags = {
    quotaNearLimit: Math.max(ratio(u.entries, u.quota.entryLimit), ratio(u.attachments, u.quota.attachmentCountLimit), ratio(u.attachmentBytes, u.quota.attachmentBytesLimit)) >= 0.7,
    inactive: (u.lastSeenAt > 0 ? u.lastSeenAt : u.createdAt) < Date.now() - 90 * 86400000,
    noPasskey: u.passkeys === 0,
    manySessions: u.activeSessions >= 3
  };
  return u;
}

// The joined user query (CF used this in both overview + pagedUsers).
export const USER_SELECT = `SELECT u.username,u.created_at,u.kdf,u.banned_until,
  (SELECT COUNT(*) FROM entries e WHERE e.user_id=u.id) entry_count,
  (SELECT COUNT(*) FROM attachments a WHERE a.user_id=u.id) attachment_count,
  (SELECT COALESCE(SUM(a.ciphertext_size),0) FROM attachments a WHERE a.user_id=u.id) attachment_bytes,
  (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>?) active_sessions,
  (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id=u.id) last_seen_at,
  (SELECT auth_method FROM sessions sx WHERE sx.user_id=u.id ORDER BY COALESCE(sx.last_seen_at,sx.created_at,0) DESC LIMIT 1) last_auth_method,
  (SELECT COUNT(*) FROM passkey_credentials p WHERE p.user_id=u.id) passkey_count,
  q.entry_limit,q.attachment_count_limit,q.attachment_bytes_limit,q.expires_at quota_expires_at
  FROM users u LEFT JOIN user_quotas q ON q.user_id=u.id AND (q.expires_at IS NULL OR q.expires_at>?)`;

export { mapUser, DEFAULT_USER_QUOTA };

export async function overview(db, env, compact = false) {
  const now = Date.now();
  const dbStart = Date.now();

  const summary = db.prepare(`SELECT
    (SELECT COUNT(*) FROM users) users,
    (SELECT COUNT(*) FROM entries) entries,
    (SELECT COUNT(*) FROM attachments) attachments,
    (SELECT COALESCE(SUM(ciphertext_size),0) FROM attachments) attachment_bytes,
    (SELECT COUNT(*) FROM sessions WHERE expires_at>?) active_sessions,
    (SELECT COUNT(*) FROM pending_file_deletions) pending_deletions,
    (SELECT COUNT(*) FROM backup_import_locks WHERE expires_at>?) backup_locks`).get(now, now);

  const usersRows = compact ? [] : db.prepare(USER_SELECT + ' ORDER BY u.created_at').all(now, now);
  const users = usersRows.map(mapUser);

  const inactiveBefore = now - 90 * 86400000;
  const riskSummary = users.reduce((out, u) => {
    if (Object.values(u.riskFlags).some(Boolean)) out.attention++;
    for (const key of ['quotaNearLimit', 'inactive', 'noPasskey', 'manySessions']) if (u.riskFlags[key]) out[key]++;
    return out;
  }, { attention: 0, quotaNearLimit: 0, inactive: 0, noPasskey: 0, manySessions: 0 });

  const auditRows = compact ? [] : db.prepare('SELECT actor_email,action,target_username,details_json,created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT 20').all();
  const audit = auditRows.map(x => ({ actor: String(x.actor_email || ''), action: String(x.action || ''), target: String(x.target_username || ''), details: String(x.details_json || '{}'), createdAt: Number(x.created_at) || 0 }));

  const quotaHistoryRows = compact ? [] : db.prepare(`SELECT actor_email,action,target_username,details_json,created_at FROM (
    SELECT actor_email,action,target_username,details_json,created_at,ROW_NUMBER() OVER (PARTITION BY target_username ORDER BY created_at DESC) history_rank
    FROM admin_audit_logs WHERE action IN ('update_user_quota','reset_user_quota') AND target_username IS NOT NULL) WHERE history_rank<=20 ORDER BY created_at DESC`).all();
  const safeQuotaDetails = raw => { try { const x = JSON.parse(String(raw || '{}')), out = {}; for (const k of ['entryLimit', 'attachmentCountLimit', 'attachmentBytesLimit', 'expiresAt']) if (x[k] === null || Number.isFinite(Number(x[k]))) out[k] = x[k] === null ? null : Number(x[k]); return out; } catch { return {}; } };
  const quotaHistory = {};
  for (const x of quotaHistoryRows) { const t = String(x.target_username || ''); if (!t) continue; (quotaHistory[t] ||= []).push({ actor: String(x.actor_email || ''), action: String(x.action) === 'reset_user_quota' ? 'reset' : 'update', details: safeQuotaDetails(x.details_json), createdAt: Number(x.created_at) || 0 }); }

  const settingsRows = db.prepare(`SELECT key,value FROM admin_settings WHERE key IN ('registration_enabled','registration_closed_message','disk_stats_objects','disk_stats_bytes','disk_stats_updated_at')`).all();
  const settings = Object.fromEntries(settingsRows.map(x => [String(x.key), String(x.value)]));

  const inviteRows = db.prepare('SELECT id,label,max_uses,used_count,created_at,created_by FROM invite_codes ORDER BY created_at DESC').all();
  // Note: invite plaintext decryption happens in phase 5 (needs the encryption key). Here we surface metadata only.
  const inviteCodes = inviteRows.map(x => ({ id: String(x.id), label: String(x.label), maxUses: Number(x.max_uses) || 0, usedCount: Number(x.used_count) || 0, createdAt: Number(x.created_at) || 0, createdBy: String(x.created_by || ''), code: null }));

  const trendRows = db.prepare(`SELECT day,users,entries,d1_bytes,r2_bytes FROM admin_daily_metrics WHERE day>=date('now','-29 day') ORDER BY day`).all();
  const trend = trendRows.map(x => ({ day: String(x.day), users: Number(x.users) || 0, entries: Number(x.entries) || 0, d1Bytes: Number(x.d1_bytes) || 0, r2Bytes: Number(x.r2_bytes) || 0 }));

  const healthRows = db.prepare('SELECT component,error_code,created_at FROM admin_health_events ORDER BY created_at DESC LIMIT 10').all();
  const healthEvents = healthRows.map(x => ({ component: String(x.component), code: String(x.error_code), createdAt: Number(x.created_at) || 0 }));

  const secRows = db.prepare(`SELECT category,code,SUM(count) count,MIN(first_seen_at) first_seen_at,MAX(last_seen_at) last_seen_at FROM security_events WHERE last_seen_at>=? GROUP BY category,code,subject_hash ORDER BY last_seen_at DESC LIMIT 30`).all(now - 7 * 86400000);
  const securityEvents = secRows.map(x => ({ category: String(x.category), code: String(x.code), count: Number(x.count) || 0, firstSeenAt: Number(x.first_seen_at) || 0, lastSeenAt: Number(x.last_seen_at) || 0 }));

  const runRows = db.prepare('SELECT status,started_at,finished_at,processed,failed,error_code FROM maintenance_runs ORDER BY started_at DESC LIMIT 10').all();
  const runs = runRows.map(x => ({ status: String(x.status), startedAt: Number(x.started_at) || 0, finishedAt: Number(x.finished_at) || 0, processed: Number(x.processed) || 0, failed: Number(x.failed) || 0, errorCode: String(x.error_code || '') }));
  const latest = runs[0] || null;
  const firstNonFailed = runs.findIndex(x => x.status !== 'failed');
  const consecutiveFailures = firstNonFailed < 0 ? runs.length : firstNonFailed;

  const failed24hRow = db.prepare('SELECT COALESCE(SUM(count),0) failed_24h FROM security_events WHERE last_seen_at>=?').get(now - 86400000);
  const failed24h = Number(failed24hRow?.failed_24h) || 0;

  // Quota alerts (near/over limit) — same logic as CF.
  const quotaAlerts = users.map(u => {
    const zeroLimitExceeded = (u.quota.attachmentCountLimit === 0 && u.attachments > 0) || (u.quota.attachmentBytesLimit === 0 && u.attachmentBytes > 0);
    const ratio = (used, limit) => limit > 0 ? used / limit : 0;
    const r = Math.max(ratio(u.entries, u.quota.entryLimit), ratio(u.attachments, u.quota.attachmentCountLimit), ratio(u.attachmentBytes, u.quota.attachmentBytesLimit));
    if (!zeroLimitExceeded && r < 0.7) return null;
    return { username: u.username, ratio: zeroLimitExceeded ? Infinity : r, level: zeroLimitExceeded || r >= 1 ? 'over' : 'near' };
  }).filter(Boolean).sort((a, b) => b.ratio - a.ratio).slice(0, 20).map(x => ({ ...x, ratio: x.ratio === Infinity ? null : Math.round(x.ratio * 100) / 100 }));

  const dbMs = Math.max(1, Date.now() - dbStart);
  const mainHealth = await fetchMainHealth(env.MAIN_SITE_URL);

  // Local disk stats replace R2. Prefer cached refresh values; fall back to live sum.
  const diskBytes = Number(settings.disk_stats_bytes) || Number(summary.attachment_bytes) || 0;
  const diskObjects = Number(settings.disk_stats_objects) || Number(summary.attachments) || 0;
  const disk = { objects: diskObjects, bytes: diskBytes, updatedAt: Number(settings.disk_stats_updated_at) || 0 };

  return {
    generatedAt: now,
    summary: {
      users: Number(summary.users) || 0,
      entries: Number(summary.entries) || 0,
      attachments: Number(summary.attachments) || 0,
      attachmentBytes: Number(summary.attachment_bytes) || 0,
      activeSessions: Number(summary.active_sessions) || 0,
      pendingDeletions: Number(summary.pending_deletions) || 0,
      inflightUploads: 0,
      backupLocks: Number(summary.backup_locks) || 0
    },
    resources: {
      d1: { bytes: dbBytes(env.DB_PATH), limitBytes: 0 },
      // R2 concept mapped to local disk. Class A/B request counters are N/A locally.
      r2: { ...disk, classA: 0, classB: 0, limitBytes: 0, classALimitMonthly: 0, classBLimitMonthly: 0, truncated: false }
    },
    health: { worker: mainHealth.ok, d1: true, r2: true, dbMs, r2Ms: 0 },
    registration: { enabled: settings.registration_enabled !== '0', message: settings.registration_closed_message || '注册暂不可用，请联系管理员', inviteCodes },
    maintenance: { latest, runs, consecutiveFailures },
    securitySummary: { failed24h, maintenanceFailures: consecutiveFailures, pending: Number(summary.pending_deletions) || 0 },
    trend, healthEvents, securityEvents, audit, users, riskSummary, quotaHistory, quotaAlerts,
    runtime: { version: env.APP_VERSION || 'unknown', appVersion: mainHealth.appVersion }
  };
}
