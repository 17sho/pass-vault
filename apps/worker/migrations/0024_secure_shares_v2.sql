-- Secure share protocol v2; v1 secure_shares remains unchanged for compatibility.
CREATE TABLE secure_share_packages(
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','active')),
  manifest_version INTEGER NOT NULL CHECK(manifest_version = 2),
  manifest_iv TEXT NOT NULL,
  manifest_ciphertext TEXT NOT NULL,
  owner_note_version INTEGER NOT NULL,
  owner_note_iv TEXT NOT NULL,
  owner_note_ciphertext TEXT NOT NULL,
  upload_token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  max_views INTEGER NOT NULL CHECK(max_views IN (1,3,10)),
  first_open INTEGER NOT NULL CHECK(first_open IN (0,1)),
  single_browser INTEGER NOT NULL CHECK(single_browser IN (0,1)),
  view_count INTEGER NOT NULL DEFAULT 0 CHECK(view_count >= 0 AND view_count <= max_views),
  first_claimed_at INTEGER,
  last_claimed_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  committed_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_share_packages_owner ON secure_share_packages(user_id,created_at DESC);
CREATE INDEX idx_share_packages_cleanup ON secure_share_packages(status,expires_at,revoked_at);
CREATE TABLE secure_share_objects(
  share_token_hash TEXT NOT NULL,
  opaque_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  expected_size INTEGER NOT NULL CHECK(expected_size > 0),
  ciphertext_size INTEGER,
  uploaded_at INTEGER,
  upload_lease_token TEXT,
  PRIMARY KEY(share_token_hash,opaque_id),
  FOREIGN KEY(share_token_hash) REFERENCES secure_share_packages(token_hash) ON DELETE CASCADE
);
CREATE TABLE secure_share_sessions(
  id_hash TEXT PRIMARY KEY,
  share_token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(share_token_hash) REFERENCES secure_share_packages(token_hash) ON DELETE CASCADE
);
CREATE INDEX idx_share_sessions_share ON secure_share_sessions(share_token_hash,expires_at);
