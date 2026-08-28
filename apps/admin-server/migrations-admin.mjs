// Admin console schema migrations for the server (Linux/SQLite) build.
// Mirrors the Cloudflare admin schema (apps/worker/migrations/0018-0034) so the
// admin-server can reuse overview/user/audit SQL almost verbatim.
//
// Design notes:
// - Column names are kept IDENTICAL to the CF schema (e.g. actor_email) so the
//   ported overview/pagedUsers/pagedAudit SQL runs unchanged. The server stores
//   the admin *username* in actor_email (there are no emails in the server build).
// - R2-only tables (r2_storage_usage, r2_monthly_usage, r2_inflight_uploads,
//   attachment_versions) are intentionally omitted: the server stores attachments
//   on the local filesystem, so those concepts have local equivalents instead.
// - All functions are idempotent and safe to re-run on every boot, matching the
//   style of apps/server/migrations.mjs.

const ADMIN_AUDIT_ACTIONS = [
  'delete_user', 'revoke_sessions', 'retry_maintenance', 'update_registration',
  'update_user_quota', 'reset_user_quota', 'create_invite_code', 'delete_invite_code',
  'suspend_user', 'unsuspend_user', 'review_security_event', 'refresh_notifications',
  'scan_maintenance', 'repair_maintenance', 'export_user_metadata', 'reveal_invite_code',
  'change_admin_password'
];

export function migrateAdminCredentials(db) {
  if (tableExists(db, 'admin_credentials')) return false;
  db.exec(`CREATE TABLE admin_credentials(
    principal TEXT PRIMARY KEY,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  return true;
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function columnNames(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name));
}

// admin_settings — key/value store (registration flags, disk stats cache, etc.)
export function migrateAdminSettings(db) {
  if (tableExists(db, 'admin_settings')) return false;
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE admin_settings(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO admin_settings(key,value,updated_at) VALUES('registration_enabled','1',unixepoch()*1000) ON CONFLICT(key) DO NOTHING;
  COMMIT`);
  return true;
}

// admin_audit_logs — every admin mutation is recorded here.
export function migrateAdminAuditLogs(db) {
  if (tableExists(db, 'admin_audit_logs')) {
    // Ensure the CHECK constraint covers the full action set; rebuild if stale.
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_audit_logs'").get()?.sql || '';
    if (ADMIN_AUDIT_ACTIONS.every(a => sql.includes(`'${a}'`))) return false;
    db.exec('PRAGMA foreign_keys=OFF;BEGIN IMMEDIATE');
    try {
      db.exec(`ALTER TABLE admin_audit_logs RENAME TO admin_audit_logs_old;
        CREATE TABLE admin_audit_logs(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_email TEXT NOT NULL,
          action TEXT NOT NULL CHECK(action IN (${ADMIN_AUDIT_ACTIONS.map(a => `'${a}'`).join(',')})),
          target_username TEXT,
          details_json TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL
        );
        INSERT INTO admin_audit_logs(id,actor_email,action,target_username,details_json,created_at)
          SELECT id,actor_email,action,target_username,details_json,created_at FROM admin_audit_logs_old;
        DROP TABLE admin_audit_logs_old;
        CREATE INDEX idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
        CREATE INDEX idx_admin_audit_logs_quota_history ON admin_audit_logs(target_username,created_at DESC)
          WHERE action IN ('update_user_quota','reset_user_quota') AND target_username IS NOT NULL;
      COMMIT;PRAGMA foreign_keys=ON`);
      return true;
    } catch (e) { db.exec('ROLLBACK;PRAGMA foreign_keys=ON'); throw e; }
  }
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE admin_audit_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN (${ADMIN_AUDIT_ACTIONS.map(a => `'${a}'`).join(',')})),
      target_username TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
    CREATE INDEX idx_admin_audit_logs_quota_history ON admin_audit_logs(target_username,created_at DESC)
      WHERE action IN ('update_user_quota','reset_user_quota') AND target_username IS NOT NULL;
  COMMIT`);
  return true;
}

// admin_daily_metrics — 30-day trend source (users/entries/db bytes/disk bytes).
export function migrateAdminDailyMetrics(db) {
  if (tableExists(db, 'admin_daily_metrics')) return false;
  db.exec(`CREATE TABLE admin_daily_metrics(
    day TEXT PRIMARY KEY,
    users INTEGER NOT NULL,
    entries INTEGER NOT NULL,
    d1_bytes INTEGER NOT NULL,
    r2_bytes INTEGER NOT NULL,
    captured_at INTEGER NOT NULL
  )`);
  return true;
}

// admin_health_events — component error log surfaced on the overview page.
export function migrateAdminHealthEvents(db) {
  if (tableExists(db, 'admin_health_events')) return false;
  db.exec(`CREATE TABLE admin_health_events(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    component TEXT NOT NULL,
    error_code TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_admin_health_events_created_at ON admin_health_events(created_at DESC)`);
  return true;
}

// admin_notifications — deduped security notifications (optional Telegram fanout).
export function migrateAdminNotifications(db) {
  if (tableExists(db, 'admin_notifications')) return false;
  db.exec(`CREATE TABLE admin_notifications(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dedupe_key TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
    title TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    telegram_sent_at INTEGER,
    dismissed_at INTEGER
  );
  CREATE INDEX idx_admin_notifications_last_seen ON admin_notifications(last_seen_at DESC)`);
  return true;
}

// user_quotas — per-user overrides for entry/attachment limits.
export function migrateUserQuotas(db) {
  if (tableExists(db, 'user_quotas')) return false;
  db.exec(`CREATE TABLE user_quotas(
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    entry_limit INTEGER NOT NULL CHECK(entry_limit BETWEEN 1 AND 5000),
    attachment_count_limit INTEGER NOT NULL CHECK(attachment_count_limit BETWEEN 0 AND 200),
    attachment_bytes_limit INTEGER NOT NULL CHECK(attachment_bytes_limit BETWEEN 0 AND 1073741824),
    expires_at INTEGER,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_user_quotas_expires_at ON user_quotas(expires_at)`);
  return true;
}

// invite_codes — multi-code registration control (encrypted display + HMAC hash).
export function migrateInviteCodes(db) {
  if (tableExists(db, 'invite_codes')) return false;
  db.exec(`CREATE TABLE invite_codes(
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
    max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 1000000),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count BETWEEN 0 AND max_uses),
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    last_used_at INTEGER,
    code_ciphertext TEXT,
    code_iv TEXT
  );
  CREATE INDEX idx_invite_codes_created_at ON invite_codes(created_at DESC)`);
  return true;
}

// security_events — authentication/registration failure aggregation.
export function migrateSecurityEvents(db) {
  if (tableExists(db, 'security_events')) return false;
  db.exec(`CREATE TABLE security_events(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN ('authentication','registration')),
    code TEXT NOT NULL CHECK(code IN ('password_failed','password_rate_limited','password_state_changed','invite_failed','invite_rate_limited','passkey_failed','passkey_rate_limited')),
    subject_hash TEXT NOT NULL,
    bucket INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1 CHECK(count > 0),
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    UNIQUE(category,code,subject_hash,bucket)
  );
  CREATE INDEX idx_security_events_last_seen ON security_events(last_seen_at DESC);
  CREATE INDEX idx_security_events_category_time ON security_events(category,last_seen_at DESC)`);
  return true;
}

// security_event_reviews — admin triage state for security events.
export function migrateSecurityEventReviews(db) {
  if (tableExists(db, 'security_event_reviews')) return false;
  db.exec(`CREATE TABLE security_event_reviews(
    category TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('handled','ignored')),
    note TEXT NOT NULL DEFAULT '',
    actor_email TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(category,code)
  )`);
  return true;
}

// maintenance_runs — history of retry-deletion runs.
export function migrateMaintenanceRuns(db) {
  if (tableExists(db, 'maintenance_runs')) return false;
  db.exec(`CREATE TABLE maintenance_runs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL CHECK(status IN ('running','success','failed')),
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    processed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    error_code TEXT
  );
  CREATE INDEX idx_maintenance_runs_started_at ON maintenance_runs(started_at DESC)`);
  return true;
}

// maintenance_reports + items — orphan-scan reports and their candidate keys.
export function migrateMaintenanceReports(db) {
  if (tableExists(db, 'maintenance_reports')) return false;
  db.exec(`CREATE TABLE maintenance_reports(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL CHECK(status IN ('ready','repaired','failed')),
    orphan_count INTEGER NOT NULL DEFAULT 0,
    missing_count INTEGER NOT NULL DEFAULT 0,
    pending_count INTEGER NOT NULL DEFAULT 0,
    scanned_at INTEGER NOT NULL,
    repaired_at INTEGER,
    actor_email TEXT NOT NULL,
    error_code TEXT
  );
  CREATE INDEX idx_maintenance_reports_scanned ON maintenance_reports(scanned_at DESC);
  CREATE TABLE maintenance_report_items(
    report_id INTEGER NOT NULL REFERENCES maintenance_reports(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    ciphertext_size INTEGER NOT NULL DEFAULT 0,
    tree TEXT NOT NULL DEFAULT 'attachment' CHECK(tree IN ('attachment','share')),
    user_id TEXT,
    dir_hash TEXT,
    PRIMARY KEY(report_id,object_key)
  )`);
  return true;
}

// maintenance_leases — single-flight guard for retry runs (CF used D1 leases).
export function migrateMaintenanceLeases(db) {
  if (tableExists(db, 'maintenance_leases')) return false;
  db.exec(`CREATE TABLE maintenance_leases(
    name TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`);
  return true;
}

// users: add suspension columns (CF migration 0034). Idempotent per-column ALTER.
export function migrateUsersAdminFields(db) {
  const cols = columnNames(db, 'users');
  const add = [];
  if (!cols.has('banned_until')) add.push('ALTER TABLE users ADD COLUMN banned_until INTEGER');
  if (!cols.has('ban_reason')) add.push('ALTER TABLE users ADD COLUMN ban_reason TEXT');
  if (!cols.has('banned_at')) add.push('ALTER TABLE users ADD COLUMN banned_at INTEGER');
  if (!cols.has('banned_by')) add.push('ALTER TABLE users ADD COLUMN banned_by TEXT');
  if (!add.length) return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of add) db.exec(sql);
    db.exec("CREATE INDEX IF NOT EXISTS idx_users_banned_until ON users(banned_until) WHERE banned_until IS NOT NULL");
    db.exec('COMMIT');
    return true;
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// pending_file_deletions: add ciphertext_size so maintenance repair can account bytes.
// Server's existing table only has (object_key,user_id,created_at).
export function migratePendingDeletionsSize(db) {
  if (!tableExists(db, 'pending_file_deletions')) return false;
  const cols = columnNames(db, 'pending_file_deletions');
  if (cols.has('ciphertext_size')) return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('ALTER TABLE pending_file_deletions ADD COLUMN ciphertext_size INTEGER NOT NULL DEFAULT 0');
    db.exec('COMMIT');
    return true;
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function migrateAdminFileDeletions(db) {
  if (tableExists(db, 'admin_file_deletions')) return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE admin_file_deletions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tree TEXT NOT NULL CHECK(tree IN ('attachment','share')),
      object_key TEXT NOT NULL,
      dir_hash TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      CHECK((tree='attachment' AND length(object_key)=64 AND object_key NOT GLOB '*[^0-9a-f]*' AND length(dir_hash)=64 AND dir_hash NOT GLOB '*[^0-9a-f]*') OR (tree='share' AND length(object_key)=87 AND substr(object_key,44,1)='/' AND length(substr(object_key,1,43))=43 AND substr(object_key,1,43) NOT GLOB '*[^A-Za-z0-9_-]*' AND length(substr(object_key,45))=43 AND substr(object_key,45) NOT GLOB '*[^A-Za-z0-9_-]*' AND dir_hash='')),
      UNIQUE(tree,object_key,dir_hash)
    );
    CREATE INDEX idx_admin_file_deletions_created ON admin_file_deletions(created_at)`);
    db.exec('COMMIT');
    return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

const ATTACHMENT_IDENTITY_SQL = "tree='attachment' AND length(object_key)=64 AND object_key NOT GLOB '*[^0-9a-f]*' AND length(dir_hash)=64 AND dir_hash NOT GLOB '*[^0-9a-f]*'";
const SHARE_IDENTITY_SQL = "tree='share' AND length(object_key)=87 AND substr(object_key,44,1)='/' AND length(substr(object_key,1,43))=43 AND substr(object_key,1,43) NOT GLOB '*[^A-Za-z0-9_-]*' AND length(substr(object_key,45))=43 AND substr(object_key,45) NOT GLOB '*[^A-Za-z0-9_-]*' AND dir_hash=''";
const FILE_IDENTITY_SQL = `((${ATTACHMENT_IDENTITY_SQL}) OR (${SHARE_IDENTITY_SQL}))`;
const lifecycleTriggers = ['file_lifecycle_attachments_insert', 'file_lifecycle_attachments_update', 'file_lifecycle_share_insert', 'file_lifecycle_share_update'];

function lifecycleCurrent(db) {
  if (['filesystem_maintenance_fence', 'file_write_intents', 'file_deletion_outbox', 'legacy_file_deletion_quarantine', 'admin_file_deletions'].some(name => !tableExists(db, name))) return false;
  const fence = columnNames(db, 'filesystem_maintenance_fence'), outbox = columnNames(db, 'file_deletion_outbox');
  if (!['owner_id', 'phase', 'previous_owner_id'].every(name => fence.has(name)) || !['claim_token', 'claimed_at'].every(name => outbox.has(name))) return false;
  const schemas = ['file_write_intents', 'file_deletion_outbox', 'admin_file_deletions'].map(name => db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name)?.sql || '');
  if (schemas.some(sql => !sql.replace(/\s+/g, '').includes('length(substr(object_key,1,43))=43'))) return false;
  return lifecycleTriggers.every(name => db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name));
}

function selectColumn(columns, name, fallback = 'NULL') { return columns.has(name) ? name : fallback; }

// Persistent, fail-closed coordination for Linux filesystem writes/deletes.
// Every old lifecycle shape is rebuilt under one BEGIN IMMEDIATE: constraints,
// compatible rows, quarantine, added columns and reference triggers become visible atomically.
export function migrateFileLifecycle(db) {
  if (lifecycleCurrent(db)) return false;
  const existed = Object.fromEntries(['filesystem_maintenance_fence', 'file_write_intents', 'file_deletion_outbox', 'legacy_file_deletion_quarantine', 'admin_file_deletions']
    .map(name => [name, tableExists(db, name)]));
  const columns = Object.fromEntries(Object.entries(existed).map(([name, yes]) => [name, yes ? columnNames(db, name) : new Set()]));
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const name of lifecycleTriggers) db.exec(`DROP TRIGGER IF EXISTS ${name}`);
    for (const name of ['idx_file_write_intents_created', 'idx_file_deletion_outbox_created', 'idx_legacy_file_deletion_quarantine_time', 'idx_admin_file_deletions_created']) db.exec(`DROP INDEX IF EXISTS ${name}`);
    for (const [name, yes] of Object.entries(existed)) if (yes) db.exec(`ALTER TABLE ${name} RENAME TO ${name}_lifecycle_old`);
    db.exec(`CREATE TABLE filesystem_maintenance_fence(
      name TEXT PRIMARY KEY CHECK(name='delete'), token TEXT NOT NULL CHECK(length(token) BETWEEN 1 AND 200), run_id INTEGER,
      acquired_at INTEGER NOT NULL, owner_id TEXT, phase TEXT NOT NULL DEFAULT 'active' CHECK(phase IN ('active','recovering')), previous_owner_id TEXT
    );
    CREATE TABLE file_write_intents(
      tree TEXT NOT NULL CHECK(tree IN ('attachment','share')), object_key TEXT NOT NULL, dir_hash TEXT NOT NULL DEFAULT '', user_id TEXT,
      token TEXT NOT NULL CHECK(length(token) BETWEEN 1 AND 200), expected_size INTEGER NOT NULL CHECK(expected_size>=0), created_at INTEGER NOT NULL,
      PRIMARY KEY(tree,dir_hash,object_key), CHECK(${FILE_IDENTITY_SQL}),
      CHECK((tree='attachment' AND user_id IS NOT NULL) OR (tree='share' AND user_id IS NULL))
    );
    CREATE INDEX idx_file_write_intents_created ON file_write_intents(created_at);
    CREATE TABLE file_deletion_outbox(
      id INTEGER PRIMARY KEY AUTOINCREMENT, tree TEXT NOT NULL CHECK(tree IN ('attachment','share')), object_key TEXT NOT NULL,
      dir_hash TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 200), created_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0), last_error TEXT, claim_token TEXT, claimed_at INTEGER,
      UNIQUE(tree,dir_hash,object_key), CHECK(${FILE_IDENTITY_SQL})
    );
    CREATE INDEX idx_file_deletion_outbox_created ON file_deletion_outbox(created_at,id);
    CREATE TABLE legacy_file_deletion_quarantine(
      id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL CHECK(source IN ('pending_file_deletions','admin_file_deletions','file_write_intents','file_deletion_outbox')),
      source_key TEXT NOT NULL CHECK(length(source_key) BETWEEN 1 AND 200), error_code TEXT NOT NULL CHECK(length(error_code) BETWEEN 1 AND 100),
      created_at INTEGER NOT NULL, quarantined_at INTEGER NOT NULL
    );
    CREATE INDEX idx_legacy_file_deletion_quarantine_time ON legacy_file_deletion_quarantine(quarantined_at,id);
    CREATE TABLE admin_file_deletions(
      id INTEGER PRIMARY KEY AUTOINCREMENT, tree TEXT NOT NULL CHECK(tree IN ('attachment','share')), object_key TEXT NOT NULL,
      dir_hash TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, CHECK(${FILE_IDENTITY_SQL}), UNIQUE(tree,object_key,dir_hash)
    );
    CREATE INDEX idx_admin_file_deletions_created ON admin_file_deletions(created_at);`);

    if (existed.filesystem_maintenance_fence) db.exec(`INSERT INTO filesystem_maintenance_fence(name,token,run_id,acquired_at,owner_id,phase,previous_owner_id)
      SELECT name,token,${selectColumn(columns.filesystem_maintenance_fence, 'run_id')},acquired_at,${selectColumn(columns.filesystem_maintenance_fence, 'owner_id')},${selectColumn(columns.filesystem_maintenance_fence, 'phase', "'active'")},${selectColumn(columns.filesystem_maintenance_fence, 'previous_owner_id')}
      FROM filesystem_maintenance_fence_lifecycle_old`);
    if (existed.legacy_file_deletion_quarantine) db.exec(`INSERT INTO legacy_file_deletion_quarantine(id,source,source_key,error_code,created_at,quarantined_at)
      SELECT id,source,source_key,error_code,created_at,quarantined_at FROM legacy_file_deletion_quarantine_lifecycle_old
      WHERE source IN ('pending_file_deletions','admin_file_deletions','file_write_intents','file_deletion_outbox')`);
    if (existed.file_write_intents) {
      db.exec(`INSERT INTO legacy_file_deletion_quarantine(source,source_key,error_code,created_at,quarantined_at)
        SELECT 'file_write_intents',substr(COALESCE(tree,'')||':'||COALESCE(dir_hash,'')||':'||COALESCE(object_key,''),1,200),'invalid_identity',COALESCE(created_at,0),${now}
        FROM file_write_intents_lifecycle_old WHERE NOT (${FILE_IDENTITY_SQL}) OR expected_size<0 OR length(token) NOT BETWEEN 1 AND 200 OR (tree='attachment')<>(user_id IS NOT NULL);
        INSERT INTO file_write_intents(tree,object_key,dir_hash,user_id,token,expected_size,created_at)
        SELECT tree,object_key,dir_hash,user_id,token,expected_size,created_at FROM file_write_intents_lifecycle_old
        WHERE ${FILE_IDENTITY_SQL} AND expected_size>=0 AND length(token) BETWEEN 1 AND 200 AND (tree='attachment')=(user_id IS NOT NULL)`);
    }
    if (existed.file_deletion_outbox) {
      db.exec(`INSERT INTO legacy_file_deletion_quarantine(source,source_key,error_code,created_at,quarantined_at)
        SELECT 'file_deletion_outbox',substr(COALESCE(tree,'')||':'||COALESCE(dir_hash,'')||':'||COALESCE(object_key,''),1,200),'invalid_identity',COALESCE(created_at,0),${now}
        FROM file_deletion_outbox_lifecycle_old WHERE NOT (${FILE_IDENTITY_SQL}) OR COALESCE(attempts,0)<0 OR length(reason) NOT BETWEEN 1 AND 200;
        INSERT INTO file_deletion_outbox(id,tree,object_key,dir_hash,reason,created_at,attempts,last_error,claim_token,claimed_at)
        SELECT id,tree,object_key,dir_hash,reason,created_at,COALESCE(attempts,0),${selectColumn(columns.file_deletion_outbox, 'last_error')},${selectColumn(columns.file_deletion_outbox, 'claim_token')},${selectColumn(columns.file_deletion_outbox, 'claimed_at')}
        FROM file_deletion_outbox_lifecycle_old WHERE ${FILE_IDENTITY_SQL} AND COALESCE(attempts,0)>=0 AND length(reason) BETWEEN 1 AND 200`);
    }
    if (existed.admin_file_deletions) {
      db.exec(`INSERT INTO legacy_file_deletion_quarantine(source,source_key,error_code,created_at,quarantined_at)
        SELECT 'admin_file_deletions',substr(CAST(id AS TEXT),1,200),'invalid_identity',COALESCE(created_at,0),${now}
        FROM admin_file_deletions_lifecycle_old WHERE NOT (${FILE_IDENTITY_SQL});
        INSERT INTO admin_file_deletions(id,tree,object_key,dir_hash,created_at)
        SELECT id,tree,object_key,dir_hash,created_at FROM admin_file_deletions_lifecycle_old WHERE ${FILE_IDENTITY_SQL}`);
    }
    for (const [name, yes] of Object.entries(existed)) if (yes) db.exec(`DROP TABLE ${name}_lifecycle_old`);

    // Placeholders for v2 shares are inserted before bytes exist. Every transition
    // that creates a live filesystem reference still requires its matching intent.
    db.exec(`CREATE TRIGGER file_lifecycle_attachments_insert BEFORE INSERT ON attachments BEGIN
      SELECT CASE WHEN EXISTS(SELECT 1 FROM filesystem_maintenance_fence WHERE name='delete') THEN RAISE(ABORT,'file_lifecycle_fence') END;
      SELECT CASE WHEN EXISTS(SELECT 1 FROM file_deletion_outbox WHERE tree='attachment' AND object_key=NEW.object_key) THEN RAISE(ABORT,'file_lifecycle_outbox') END;
      SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM file_write_intents WHERE tree='attachment' AND object_key=NEW.object_key AND user_id=NEW.user_id AND expected_size=NEW.ciphertext_size) THEN RAISE(ABORT,'file_lifecycle_intent') END;
    END;
    CREATE TRIGGER file_lifecycle_attachments_update BEFORE UPDATE OF user_id,object_key,ciphertext_size ON attachments
    WHEN OLD.user_id IS NOT NEW.user_id OR OLD.object_key IS NOT NEW.object_key OR OLD.ciphertext_size IS NOT NEW.ciphertext_size BEGIN
      SELECT CASE WHEN EXISTS(SELECT 1 FROM filesystem_maintenance_fence WHERE name='delete') THEN RAISE(ABORT,'file_lifecycle_fence') END;
      SELECT CASE WHEN EXISTS(SELECT 1 FROM file_deletion_outbox WHERE tree='attachment' AND object_key=NEW.object_key) THEN RAISE(ABORT,'file_lifecycle_outbox') END;
      SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM file_write_intents WHERE tree='attachment' AND object_key=NEW.object_key AND user_id=NEW.user_id AND expected_size=NEW.ciphertext_size) THEN RAISE(ABORT,'file_lifecycle_intent') END;
    END;
    CREATE TRIGGER file_lifecycle_share_insert BEFORE INSERT ON secure_share_objects BEGIN
      SELECT CASE WHEN EXISTS(SELECT 1 FROM filesystem_maintenance_fence WHERE name='delete') THEN RAISE(ABORT,'file_lifecycle_fence') END;
      SELECT CASE WHEN EXISTS(SELECT 1 FROM file_deletion_outbox WHERE tree='share' AND object_key=NEW.object_key) THEN RAISE(ABORT,'file_lifecycle_outbox') END;
      SELECT CASE WHEN NOT (NEW.uploaded_at IS NULL AND NEW.ciphertext_size IS NULL AND NEW.upload_lease_token IS NULL)
        AND NOT EXISTS(SELECT 1 FROM file_write_intents WHERE tree='share' AND object_key=NEW.object_key AND expected_size=COALESCE(NEW.ciphertext_size,NEW.expected_size) AND (NEW.upload_lease_token IS NULL OR token=NEW.upload_lease_token))
        THEN RAISE(ABORT,'file_lifecycle_intent') END;
    END;
    CREATE TRIGGER file_lifecycle_share_update BEFORE UPDATE OF object_key,expected_size,ciphertext_size,uploaded_at,upload_lease_token ON secure_share_objects
    WHEN OLD.object_key IS NOT NEW.object_key OR OLD.expected_size IS NOT NEW.expected_size OR OLD.ciphertext_size IS NOT NEW.ciphertext_size OR OLD.uploaded_at IS NOT NEW.uploaded_at OR OLD.upload_lease_token IS NOT NEW.upload_lease_token BEGIN
      SELECT CASE WHEN EXISTS(SELECT 1 FROM filesystem_maintenance_fence WHERE name='delete') THEN RAISE(ABORT,'file_lifecycle_fence') END;
      SELECT CASE WHEN EXISTS(SELECT 1 FROM file_deletion_outbox WHERE tree='share' AND object_key=NEW.object_key) THEN RAISE(ABORT,'file_lifecycle_outbox') END;
      SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM file_write_intents WHERE tree='share' AND object_key=NEW.object_key AND expected_size=COALESCE(NEW.ciphertext_size,NEW.expected_size) AND token=COALESCE(NEW.upload_lease_token,OLD.upload_lease_token)) THEN RAISE(ABORT,'file_lifecycle_intent') END;
    END`);
    db.exec('COMMIT');
    return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

// Run every admin migration in dependency order. Returns the list of applied names.
export function runAdminMigrations(db) {
  const steps = [
    ['admin_credentials', migrateAdminCredentials],
    ['admin_settings', migrateAdminSettings],
    ['admin_audit_logs', migrateAdminAuditLogs],
    ['admin_daily_metrics', migrateAdminDailyMetrics],
    ['admin_health_events', migrateAdminHealthEvents],
    ['admin_notifications', migrateAdminNotifications],
    ['user_quotas', migrateUserQuotas],
    ['invite_codes', migrateInviteCodes],
    ['security_events', migrateSecurityEvents],
    ['security_event_reviews', migrateSecurityEventReviews],
    ['maintenance_runs', migrateMaintenanceRuns],
    ['maintenance_reports', migrateMaintenanceReports],
    ['maintenance_leases', migrateMaintenanceLeases],
    ['admin_file_deletions', migrateAdminFileDeletions],
    ['file_lifecycle', migrateFileLifecycle],
    ['users_admin_fields', migrateUsersAdminFields],
    ['pending_deletions_size', migratePendingDeletionsSize]
  ];
  const applied = [];
  for (const [name, fn] of steps) if (fn(db)) applied.push(name);
  return applied;
}
