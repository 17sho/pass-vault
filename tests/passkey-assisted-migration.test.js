import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { migratePasskeyAssistedUnlock } from '../apps/server/migrations.mjs';

function legacyDb(){
 const db=new DatabaseSync(':memory:');
 db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,kdf TEXT NOT NULL,wrapped_key TEXT NOT NULL,created_at INTEGER NOT NULL);
  CREATE TABLE entries(user_id TEXT NOT NULL,id TEXT NOT NULL,type TEXT NOT NULL,version INTEGER NOT NULL,iv TEXT NOT NULL,ciphertext TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
  INSERT INTO users VALUES('user_1','alice','hash','salt','{}','{}',1);
  INSERT INTO entries VALUES('user_1','entry_1','note',1,'iv','cipher',2);`);
 return db;
}

function assertSchema(db){
 const credentialColumns=db.prepare('PRAGMA table_info(passkey_credentials)').all().map(row=>row.name);
 assert.deepEqual(credentialColumns,['id','user_id','public_key','counter','transports','device_type','backed_up','server_wrapped_key','created_at','updated_at']);
 const challengeColumns=db.prepare('PRAGMA table_info(passkey_challenges)').all().map(row=>row.name);
 assert.deepEqual(challengeColumns,['id_hash','user_id','purpose','challenge','expires_at','created_at']);
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_passkey_credentials_user'").get());
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_passkey_challenges_expiry'").get());
}

test('Linux passkey辅助解锁迁移保留旧数据、幂等并级联凭据和challenge',()=>{
 const db=legacyDb();
 assert.equal(migratePasskeyAssistedUnlock(db),true);
 assertSchema(db);
 assert.equal(db.prepare('SELECT ciphertext FROM entries WHERE id=?').get('entry_1').ciphertext,'cipher');
 db.prepare('INSERT INTO passkey_credentials VALUES(?,?,?,?,?,?,?,?,?,?)').run('cred_1','user_1','public',0,'[]','singleDevice',0,'wrapped',3,3);
 db.prepare('INSERT INTO passkey_challenges VALUES(?,?,?,?,?,?)').run('challenge_1','user_1','registration','random',Date.now()+60000,3);
 assert.equal(migratePasskeyAssistedUnlock(db),false);
 db.prepare('DELETE FROM users WHERE id=?').run('user_1');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM passkey_credentials').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM passkey_challenges').get().n,0);
 db.close();
});

test('D1 0009 passkey辅助解锁迁移保留旧数据并创建同构约束',async()=>{
 const db=legacyDb();
 db.exec(await readFile(new URL('../apps/worker/migrations/0009_passkey_assisted_unlock.sql',import.meta.url),'utf8'));
 assertSchema(db);
 assert.equal(db.prepare('SELECT ciphertext FROM entries WHERE id=?').get('entry_1').ciphertext,'cipher');
 db.prepare('INSERT INTO passkey_credentials VALUES(?,?,?,?,?,?,?,?,?,?)').run('cred_1','user_1','public',0,'[]','singleDevice',0,'wrapped',3,3);
 assert.throws(()=>db.prepare('INSERT INTO passkey_credentials VALUES(?,?,?,?,?,?,?,?,?,?)').run('cred_1','user_1','other',0,'[]','singleDevice',0,'wrapped',3,3));
 db.close();
});
