CREATE TABLE pending_r2_deletions (
  object_key TEXT PRIMARY KEY,
  ciphertext_size INTEGER NOT NULL CHECK(ciphertext_size >= 0),
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_pending_r2_deletions_created_at
  ON pending_r2_deletions(created_at);
