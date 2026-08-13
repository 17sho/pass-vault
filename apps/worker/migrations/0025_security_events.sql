CREATE TABLE security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK(category IN ('authentication','registration')),
  code TEXT NOT NULL CHECK(code IN ('password_failed','password_rate_limited','invite_failed','invite_rate_limited','passkey_failed','passkey_rate_limited')),
  subject_hash TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1 CHECK(count > 0),
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  UNIQUE(category,code,subject_hash,bucket)
);
CREATE INDEX idx_security_events_last_seen ON security_events(last_seen_at DESC);
CREATE INDEX idx_security_events_category_time ON security_events(category,last_seen_at DESC);
