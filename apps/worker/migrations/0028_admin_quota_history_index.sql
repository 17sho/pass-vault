CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_quota_history
  ON admin_audit_logs(target_username, created_at DESC)
  WHERE action IN ('update_user_quota','reset_user_quota') AND target_username IS NOT NULL;
