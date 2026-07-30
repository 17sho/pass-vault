const allowedTypes="'account','website','note','totp','settings'";
function entriesCreate(columns){return`CREATE TABLE entries_new(user_id TEXT NOT NULL,id TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN(${allowedTypes})),version INTEGER NOT NULL,iv TEXT NOT NULL,ciphertext TEXT NOT NULL,updated_at INTEGER NOT NULL${columns.includes('created_at')?',created_at INTEGER':''},PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`}
function rebuildEntries(db,columns){const names=columns.join(',');db.exec('PRAGMA foreign_keys=OFF;BEGIN IMMEDIATE');try{db.exec(`${entriesCreate(columns)};INSERT INTO entries_new(${names}) SELECT ${names} FROM entries;DROP TABLE entries;ALTER TABLE entries_new RENAME TO entries;CREATE INDEX IF NOT EXISTS idx_entries_user_type ON entries(user_id,type);COMMIT;PRAGMA foreign_keys=ON`);return true}catch(e){db.exec('ROLLBACK;PRAGMA foreign_keys=ON');throw e}}
export function migrateEntriesForSettings(db){const sql=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='entries'").get()?.sql||'';if(/'settings'/.test(sql))return false;return rebuildEntries(db,db.prepare("PRAGMA table_info(entries)").all().map(x=>x.name))}
export function migrateEntriesForTotp(db){const sql=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='entries'").get()?.sql||'';if(/'totp'/.test(sql))return false;return rebuildEntries(db,db.prepare("PRAGMA table_info(entries)").all().map(x=>x.name))}
export function migrateEntriesCreatedAt(db){if(db.prepare("PRAGMA table_info(entries)").all().some(x=>x.name==='created_at'))return false;db.exec('BEGIN IMMEDIATE');try{db.exec('ALTER TABLE entries ADD COLUMN created_at INTEGER;UPDATE entries SET created_at=updated_at WHERE created_at IS NULL;COMMIT');return true}catch(e){db.exec('ROLLBACK');throw e}}
export function migrateSessionMetadata(db){const columns=new Set(db.prepare("PRAGMA table_info(sessions)").all().map(x=>x.name)),add=[];for(const [name,sql] of [['public_id','TEXT'],['created_at','INTEGER'],['last_seen_at','INTEGER'],['ip_address',"TEXT NOT NULL DEFAULT 'unknown'"],['device_type',"TEXT NOT NULL DEFAULT 'unknown'"],['browser',"TEXT NOT NULL DEFAULT 'unknown'"]])if(!columns.has(name))add.push(`ALTER TABLE sessions ADD COLUMN ${name} ${sql}`);db.exec('BEGIN IMMEDIATE');try{for(const sql of add)db.exec(sql);const rows=db.prepare('SELECT id_hash,expires_at FROM sessions WHERE public_id IS NULL').all(),update=db.prepare('UPDATE sessions SET public_id=?,created_at=?,last_seen_at=? WHERE id_hash=?');for(const row of rows){const created=row.expires_at-28800000;update.run(crypto.randomUUID().replaceAll('-',''),created,created,row.id_hash)}db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_public_id ON sessions(public_id);CREATE INDEX IF NOT EXISTS idx_sessions_user_last_seen ON sessions(user_id,last_seen_at DESC);COMMIT');return add.length>0||rows.length>0}catch(e){db.exec('ROLLBACK');throw e}}

export function migratePasskeyAssistedUnlock(db){
 const existing=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='passkey_credentials'").get()&&db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='passkey_challenges'").get();
 db.exec(`CREATE TABLE IF NOT EXISTS passkey_credentials(
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
 CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expiry ON passkey_challenges(expires_at);`);
 return !existing;
}