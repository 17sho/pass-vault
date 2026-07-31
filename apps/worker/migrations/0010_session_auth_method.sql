ALTER TABLE sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'unknown' CHECK(auth_method IN('password','passkey','unknown'));
CREATE INDEX idx_sessions_user_auth_method ON sessions(user_id,auth_method,created_at DESC);
