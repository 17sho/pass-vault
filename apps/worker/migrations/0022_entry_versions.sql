CREATE TABLE entry_versions(
  user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  type TEXT NOT NULL,
  version INTEGER NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  archived_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,entry_id,source_revision),
  FOREIGN KEY(user_id,entry_id) REFERENCES entries(user_id,id) ON DELETE CASCADE
);
CREATE INDEX idx_entry_versions_item ON entry_versions(user_id,entry_id,source_revision DESC);
CREATE INDEX idx_entry_versions_user_time ON entry_versions(user_id,archived_at DESC);

CREATE TRIGGER archive_entry_before_update
BEFORE UPDATE OF version,iv,ciphertext ON entries
WHEN OLD.type <> 'settings' AND (OLD.version <> NEW.version OR OLD.iv <> NEW.iv OR OLD.ciphertext <> NEW.ciphertext)
BEGIN
  INSERT OR IGNORE INTO entry_versions(user_id,entry_id,source_revision,type,version,iv,ciphertext,archived_at)
  VALUES(OLD.user_id,OLD.id,OLD.revision,OLD.type,OLD.version,OLD.iv,OLD.ciphertext,CAST(unixepoch('subsec')*1000 AS INTEGER));
  DELETE FROM entry_versions
  WHERE user_id=OLD.user_id AND entry_id=OLD.id AND source_revision NOT IN(
    SELECT source_revision FROM entry_versions WHERE user_id=OLD.user_id AND entry_id=OLD.id ORDER BY source_revision DESC LIMIT 10
  );
  DELETE FROM entry_versions
  WHERE user_id=OLD.user_id AND rowid NOT IN(
    SELECT rowid FROM entry_versions WHERE user_id=OLD.user_id ORDER BY archived_at DESC,source_revision DESC LIMIT 50
  );
END;
