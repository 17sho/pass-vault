import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { migrateSessionAuthMethod } from '../apps/server/migrations.mjs';

test('D1 0010 preserves sessions, marks legacy auth unknown, and constrains new methods',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY);
  CREATE TABLE sessions(id_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,public_id TEXT,created_at INTEGER,last_seen_at INTEGER,ip_address TEXT NOT NULL DEFAULT 'unknown',device_type TEXT NOT NULL DEFAULT 'unknown',browser TEXT NOT NULL DEFAULT 'unknown',FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
  INSERT INTO users VALUES('user_1');
  INSERT INTO sessions VALUES('hash_1','user_1','csrf_1',9999999999999,'public_1',1,2,'203.0.113.1','desktop','chrome');`);
 db.exec(await readFile(new URL('../apps/worker/migrations/0010_session_auth_method.sql',import.meta.url),'utf8'));
 assert.equal(db.prepare('SELECT auth_method FROM sessions WHERE id_hash=?').get('hash_1').auth_method,'unknown');
 for(const method of ['password','passkey','unknown'])db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(`hash_${method}`,'user_1','csrf',9999999999999,`public_${method}`,3,3,'unknown','unknown','unknown',method);
 assert.throws(()=>db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('hash_bad','user_1','csrf',9999999999999,'public_bad',3,3,'unknown','unknown','unknown','magic-link'));
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sessions_user_auth_method'").get());
 db.close();
});

test('Linux preserves sessions, marks legacy auth unknown, and constrains new methods',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY);
  CREATE TABLE sessions(id_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,public_id TEXT,created_at INTEGER,last_seen_at INTEGER,ip_address TEXT NOT NULL DEFAULT 'unknown',device_type TEXT NOT NULL DEFAULT 'unknown',browser TEXT NOT NULL DEFAULT 'unknown',FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
  INSERT INTO users VALUES('user_1');
  INSERT INTO sessions VALUES('hash_1','user_1','csrf_1',9999999999999,'public_1',1,2,'203.0.113.1','desktop','chrome');`);
 assert.equal(migrateSessionAuthMethod(db),true);
 assert.equal(db.prepare('SELECT auth_method FROM sessions WHERE id_hash=?').get('hash_1').auth_method,'unknown');
 for(const method of ['password','passkey','unknown'])db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(`hash_${method}`,'user_1','csrf',9999999999999,`public_${method}`,3,3,'unknown','unknown','unknown',method);
 assert.throws(()=>db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('hash_bad','user_1','csrf',9999999999999,'public_bad',3,3,'unknown','unknown','unknown','magic-link'));
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sessions_user_auth_method'").get());
 assert.equal(migrateSessionAuthMethod(db),false);
 db.close();
});
