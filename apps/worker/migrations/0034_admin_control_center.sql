PRAGMA foreign_keys=OFF;

ALTER TABLE admin_audit_logs RENAME TO admin_audit_logs_old;
CREATE TABLE admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN (
    'delete_user','revoke_sessions','retry_maintenance','update_registration',
    'update_user_quota','reset_user_quota','create_invite_code','delete_invite_code',
    'suspend_user','unsuspend_user','review_security_event','refresh_notifications',
    'scan_maintenance','repair_maintenance','export_user_metadata'
  )),
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

ALTER TABLE users ADD COLUMN banned_until INTEGER;
ALTER TABLE users ADD COLUMN ban_reason TEXT;
ALTER TABLE users ADD COLUMN banned_at INTEGER;
ALTER TABLE users ADD COLUMN banned_by TEXT;
CREATE INDEX idx_users_banned_until ON users(banned_until) WHERE banned_until IS NOT NULL;

CREATE TABLE security_event_reviews (
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('handled','ignored')),
  note TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(category,code)
);

CREATE TABLE admin_notifications (
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
CREATE INDEX idx_admin_notifications_last_seen ON admin_notifications(last_seen_at DESC);

CREATE TABLE maintenance_reports (
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

-- Object keys never leave D1. They are retained only for a bounded, explicitly
-- confirmed repair of the exact report that discovered them.
CREATE TABLE maintenance_report_items (
  report_id INTEGER NOT NULL REFERENCES maintenance_reports(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  ciphertext_size INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(report_id,object_key)
);

ALTER TABLE security_events RENAME TO security_events_old;
CREATE TABLE security_events (
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
INSERT INTO security_events(id,category,code,subject_hash,bucket,count,first_seen_at,last_seen_at)
SELECT id,category,code,subject_hash,bucket,count,first_seen_at,last_seen_at FROM security_events_old;
DROP TABLE security_events_old;
CREATE INDEX idx_security_events_last_seen ON security_events(last_seen_at DESC);
CREATE INDEX idx_security_events_category_time ON security_events(category,last_seen_at DESC);

PRAGMA foreign_keys=ON;
PRAGMA foreign_key_check;
