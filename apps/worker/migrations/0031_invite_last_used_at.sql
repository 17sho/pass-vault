-- Track the most recent successful registration without retaining invite plaintext.
ALTER TABLE invite_codes ADD COLUMN last_used_at INTEGER;
