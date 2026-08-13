CREATE TABLE secure_shares(
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version = 1),
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  owner_note_version INTEGER NOT NULL CHECK(owner_note_version = 1),
  owner_note_iv TEXT NOT NULL,
  owner_note_ciphertext TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  max_views INTEGER NOT NULL CHECK(max_views IN (1,3,10)),
  view_count INTEGER NOT NULL DEFAULT 0 CHECK(view_count >= 0 AND view_count <= max_views),
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_secure_shares_user_active ON secure_shares(user_id,revoked_at,expires_at);
CREATE INDEX idx_secure_shares_cleanup ON secure_shares(expires_at,revoked_at);
