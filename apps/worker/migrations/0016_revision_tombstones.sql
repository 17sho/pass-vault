CREATE TABLE revision_tombstones (
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK(resource_type IN('entry','attachment')),
  id TEXT NOT NULL,
  last_revision INTEGER NOT NULL CHECK(last_revision >= 1),
  PRIMARY KEY (user_id, resource_type, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
