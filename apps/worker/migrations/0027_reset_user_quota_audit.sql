PRAGMA foreign_keys=OFF;

ALTER TABLE admin_audit_logs RENAME TO admin_audit_logs_old;
CREATE TABLE admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('delete_user','revoke_sessions','retry_maintenance','update_registration','update_user_quota','reset_user_quota')),
  target_username TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
INSERT INTO admin_audit_logs(id,actor_email,action,target_username,details_json,created_at)
SELECT id,actor_email,action,target_username,details_json,created_at FROM admin_audit_logs_old;
DROP TABLE admin_audit_logs_old;
CREATE INDEX idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);

PRAGMA foreign_keys=ON;
