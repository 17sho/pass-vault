PRAGMA foreign_keys=OFF;
CREATE TABLE entries_new(
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN('account','website','note','totp','custom','settings')),
  version INTEGER NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  PRIMARY KEY(user_id,id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO entries_new(user_id,id,type,version,iv,ciphertext,updated_at,created_at,revision)
SELECT user_id,id,type,version,iv,ciphertext,updated_at,created_at,revision FROM entries;
DROP TABLE entries;
ALTER TABLE entries_new RENAME TO entries;
CREATE INDEX IF NOT EXISTS idx_entries_user_type ON entries(user_id,type);
PRAGMA foreign_keys=ON;
PRAGMA foreign_key_check;
