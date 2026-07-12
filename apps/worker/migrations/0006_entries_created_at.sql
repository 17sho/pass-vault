ALTER TABLE entries ADD COLUMN created_at INTEGER;
UPDATE entries SET created_at = updated_at WHERE created_at IS NULL;