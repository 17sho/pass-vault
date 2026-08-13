CREATE TABLE user_quotas (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  entry_limit INTEGER NOT NULL CHECK(entry_limit BETWEEN 1 AND 5000),
  attachment_count_limit INTEGER NOT NULL CHECK(attachment_count_limit BETWEEN 0 AND 200),
  attachment_bytes_limit INTEGER NOT NULL CHECK(attachment_bytes_limit BETWEEN 0 AND 1073741824),
  expires_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_user_quotas_expires_at ON user_quotas(expires_at);

CREATE TABLE maintenance_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL CHECK(status IN ('running','success','failed')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  processed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);
CREATE INDEX idx_maintenance_runs_started_at ON maintenance_runs(started_at DESC);

ALTER TABLE admin_audit_logs RENAME TO admin_audit_logs_old;
CREATE TABLE admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('delete_user','revoke_sessions','retry_maintenance','update_registration','update_user_quota')),
  target_username TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
INSERT INTO admin_audit_logs(id,actor_email,action,target_username,details_json,created_at)
SELECT id,actor_email,action,target_username,details_json,created_at FROM admin_audit_logs_old;
DROP TABLE admin_audit_logs_old;
CREATE INDEX idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
