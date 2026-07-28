ALTER TABLE sessions ADD COLUMN public_id TEXT;
ALTER TABLE sessions ADD COLUMN created_at INTEGER;
ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;
ALTER TABLE sessions ADD COLUMN ip_address TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE sessions ADD COLUMN device_type TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE sessions ADD COLUMN browser TEXT NOT NULL DEFAULT 'unknown';
UPDATE sessions
SET public_id = lower(hex(randomblob(16))),
    created_at = expires_at - 28800000,
    last_seen_at = expires_at - 28800000
WHERE public_id IS NULL;
CREATE UNIQUE INDEX idx_sessions_public_id ON sessions(public_id);
CREATE INDEX idx_sessions_user_last_seen ON sessions(user_id,last_seen_at DESC);
