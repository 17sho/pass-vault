-- Multi-code registration control with atomic usage accounting.
CREATE TABLE invite_codes(
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
  max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 1000000),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count BETWEEN 0 AND max_uses),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_invite_codes_created_at ON invite_codes(created_at DESC);

-- Preserve the previous Admin-managed code. Its plaintext is intentionally unavailable,
-- so it is imported as a high-capacity legacy code until an administrator removes it.
INSERT INTO invite_codes(id,code_hash,label,max_uses,used_count,created_at,created_by)
SELECT 'legacy-' || lower(hex(randomblob(16))),value,'旧注册码',1000000,0,updated_at,'migration'
FROM admin_settings
WHERE key='invite_code_hash' AND length(value)>0
ON CONFLICT(code_hash) DO NOTHING;
