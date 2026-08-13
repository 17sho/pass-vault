CREATE TABLE attachment_versions(
  user_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK(source_revision >= 1),
  metadata_iv TEXT NOT NULL,
  metadata_ciphertext TEXT NOT NULL,
  object_key TEXT NOT NULL,
  ciphertext_size INTEGER NOT NULL CHECK(ciphertext_size >= 16),
  archived_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,attachment_id,source_revision),
  FOREIGN KEY(user_id,attachment_id) REFERENCES attachments(user_id,id) ON DELETE CASCADE
);

CREATE INDEX idx_attachment_versions_item
  ON attachment_versions(user_id,attachment_id,source_revision DESC);
CREATE INDEX idx_attachment_versions_user_time
  ON attachment_versions(user_id,archived_at DESC,source_revision DESC);
CREATE INDEX idx_attachment_versions_object
  ON attachment_versions(object_key);

CREATE TRIGGER archive_attachment_before_update
BEFORE UPDATE OF metadata_iv,metadata_ciphertext,object_key,ciphertext_size ON attachments
WHEN OLD.metadata_iv <> NEW.metadata_iv
  OR OLD.metadata_ciphertext <> NEW.metadata_ciphertext
  OR OLD.object_key <> NEW.object_key
  OR OLD.ciphertext_size <> NEW.ciphertext_size
BEGIN
  INSERT OR IGNORE INTO attachment_versions(
    user_id,attachment_id,source_revision,metadata_iv,metadata_ciphertext,
    object_key,ciphertext_size,archived_at
  ) VALUES(
    OLD.user_id,OLD.id,OLD.revision,OLD.metadata_iv,OLD.metadata_ciphertext,
    OLD.object_key,OLD.ciphertext_size,CAST(unixepoch('subsec')*1000 AS INTEGER)
  );
END;

CREATE TRIGGER prune_attachment_versions_after_update
AFTER UPDATE OF metadata_iv,metadata_ciphertext,object_key,ciphertext_size ON attachments
BEGIN
  INSERT OR IGNORE INTO pending_r2_deletions(object_key,ciphertext_size,created_at)
  SELECT doomed.object_key,doomed.ciphertext_size,CAST(unixepoch('subsec')*1000 AS INTEGER)
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

  INSERT INTO pending_r2_deletions(object_key,ciphertext_size,created_at)
  SELECT object_key,ciphertext_size,CAST(unixepoch('subsec')*1000 AS INTEGER)
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
