CREATE TABLE invite_attempts(key TEXT NOT NULL,attempted_at INTEGER NOT NULL);
CREATE INDEX idx_invite_attempts_key_time ON invite_attempts(key,attempted_at);
