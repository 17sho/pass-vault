CREATE TABLE r2_inflight_uploads (
  object_key TEXT PRIMARY KEY,
  ciphertext_size INTEGER NOT NULL CHECK(ciphertext_size >= 0),
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_r2_inflight_uploads_created_at
  ON r2_inflight_uploads(created_at);