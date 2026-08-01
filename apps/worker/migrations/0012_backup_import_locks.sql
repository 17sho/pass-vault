CREATE TABLE backup_import_locks (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_backup_import_locks_expires_at
  ON backup_import_locks(expires_at);