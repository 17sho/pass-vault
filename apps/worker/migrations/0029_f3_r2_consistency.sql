-- f3: attribute every physical R2 lifecycle record and serialize maintenance/export work.
ALTER TABLE r2_inflight_uploads ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pending_r2_deletions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Backfill from durable ownership references. Rows that are genuine unowned inventory
-- orphans remain NULL and are still covered by the global counter/maintenance cleanup.
UPDATE r2_inflight_uploads
SET user_id = COALESCE(
  (SELECT user_id FROM attachments WHERE attachments.object_key=r2_inflight_uploads.object_key LIMIT 1),
  (SELECT user_id FROM attachment_versions WHERE attachment_versions.object_key=r2_inflight_uploads.object_key LIMIT 1),
  (SELECT p.user_id FROM secure_share_objects o JOIN secure_share_packages p ON p.token_hash=o.share_token_hash WHERE o.object_key=r2_inflight_uploads.object_key LIMIT 1)
)
WHERE user_id IS NULL;
UPDATE pending_r2_deletions
SET user_id = COALESCE(
  (SELECT user_id FROM attachments WHERE attachments.object_key=pending_r2_deletions.object_key LIMIT 1),
  (SELECT user_id FROM attachment_versions WHERE attachment_versions.object_key=pending_r2_deletions.object_key LIMIT 1),
  (SELECT p.user_id FROM secure_share_objects o JOIN secure_share_packages p ON p.token_hash=o.share_token_hash WHERE o.object_key=pending_r2_deletions.object_key LIMIT 1)
)
WHERE user_id IS NULL;

-- Rows without durable attribution remain globally metered and are drained by maintenance.
-- While any such row exists, per-user physical-byte reservations fail closed below;
-- this preserves upgrade compatibility without granting unmetered user capacity.
CREATE INDEX idx_r2_inflight_uploads_user ON r2_inflight_uploads(user_id);
-- Recreate pruning trigger so all future lifecycle rows retain user attribution.
DROP TRIGGER IF EXISTS prune_attachment_versions_after_update;
CREATE TRIGGER prune_attachment_versions_after_update
AFTER UPDATE OF metadata_iv,metadata_ciphertext,object_key,ciphertext_size ON attachments
BEGIN
  INSERT OR IGNORE INTO pending_r2_deletions(object_key,ciphertext_size,created_at,user_id)
  SELECT doomed.object_key,doomed.ciphertext_size,CAST(unixepoch('subsec')*1000 AS INTEGER),NEW.user_id
  FROM attachment_versions AS doomed
  WHERE doomed.user_id=NEW.user_id AND doomed.attachment_id=NEW.id
    AND doomed.source_revision NOT IN(
      SELECT source_revision FROM attachment_versions
      WHERE user_id=NEW.user_id AND attachment_id=NEW.id
      ORDER BY source_revision DESC LIMIT 10
    )
    AND doomed.object_key<>NEW.object_key
    AND NOT EXISTS(
      SELECT 1 FROM attachment_versions AS kept
      WHERE kept.user_id=NEW.user_id AND kept.attachment_id=NEW.id
        AND kept.object_key=doomed.object_key
        AND kept.source_revision IN(
          SELECT source_revision FROM attachment_versions
          WHERE user_id=NEW.user_id AND attachment_id=NEW.id
          ORDER BY source_revision DESC LIMIT 10
        )
    );
  DELETE FROM attachment_versions
  WHERE user_id=NEW.user_id AND attachment_id=NEW.id
    AND source_revision NOT IN(
      SELECT source_revision FROM attachment_versions
      WHERE user_id=NEW.user_id AND attachment_id=NEW.id
      ORDER BY source_revision DESC LIMIT 10
    );

  INSERT INTO pending_r2_deletions(object_key,ciphertext_size,created_at,user_id)
  SELECT object_key,ciphertext_size,CAST(unixepoch('subsec')*1000 AS INTEGER),NEW.user_id
  FROM attachment_versions
  WHERE user_id=NEW.user_id AND rowid NOT IN(
    SELECT rowid FROM attachment_versions
    WHERE user_id=NEW.user_id
    ORDER BY archived_at DESC,source_revision DESC LIMIT 50
  )
  ON CONFLICT(object_key) DO NOTHING;
  DELETE FROM attachment_versions
  WHERE user_id=NEW.user_id AND rowid NOT IN(
    SELECT rowid FROM attachment_versions
    WHERE user_id=NEW.user_id
    ORDER BY archived_at DESC,source_revision DESC LIMIT 50
  );
END;

CREATE INDEX idx_pending_r2_deletions_user ON pending_r2_deletions(user_id);

CREATE TABLE maintenance_leases(
  name TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE backup_read_leases(
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
