CREATE TABLE admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO admin_settings(key,value,updated_at) VALUES('registration_enabled','1',unixepoch()*1000) ON CONFLICT(key) DO NOTHING;

CREATE TABLE admin_daily_metrics (
  day TEXT PRIMARY KEY,
  users INTEGER NOT NULL,
  entries INTEGER NOT NULL,
  d1_bytes INTEGER NOT NULL,
  r2_bytes INTEGER NOT NULL,
  captured_at INTEGER NOT NULL
);

CREATE TABLE admin_health_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component TEXT NOT NULL,
  error_code TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_admin_health_events_created_at ON admin_health_events(created_at DESC);

ALTER TABLE admin_audit_logs RENAME TO admin_audit_logs_old;
CREATE TABLE admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('delete_user','revoke_sessions','retry_maintenance','update_registration')),
  target_username TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
INSERT INTO admin_audit_logs(id,actor_email,action,target_username,details_json,created_at)
SELECT id,actor_email,action,target_username,details_json,created_at FROM admin_audit_logs_old;
DROP TABLE admin_audit_logs_old;
CREATE INDEX idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
