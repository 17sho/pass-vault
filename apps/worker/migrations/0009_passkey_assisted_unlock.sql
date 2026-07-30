CREATE TABLE IF NOT EXISTS passkey_credentials(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL CHECK(counter>=0),
  transports TEXT NOT NULL,
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL CHECK(backed_up IN(0,1)),
  server_wrapped_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON passkey_credentials(user_id);

CREATE TABLE IF NOT EXISTS passkey_challenges(
  id_hash TEXT PRIMARY KEY,
  user_id TEXT,
  purpose TEXT NOT NULL CHECK(purpose IN('registration','authentication')),
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expiry ON passkey_challenges(expires_at);