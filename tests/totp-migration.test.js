import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { migrateEntriesForTotp } from '../apps/server/migrations.mjs';

function populated(){const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('u');CREATE TABLE entries(user_id TEXT NOT NULL,id TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN('account','website','note','settings')),version INTEGER NOT NULL,iv TEXT NOT NULL,ciphertext TEXT NOT NULL,updated_at INTEGER NOT NULL,created_at INTEGER,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);CREATE INDEX idx_entries_user_type ON entries(user_id,type);INSERT INTO entries VALUES('u','entry_123','note',1,'iv','cipher',100,90)");return db}

test('Linux TOTP migration preserves rows and created_at and is idempotent',()=>{const db=populated();assert.equal(migrateEntriesForTotp(db),true);assert.deepEqual({...db.prepare('SELECT id,type,ciphertext,created_at FROM entries').get()},{id:'entry_123',type:'note',ciphertext:'cipher',created_at:90});db.prepare('INSERT INTO entries VALUES(?,?,?,?,?,?,?,?)').run('u','totp_123','totp',1,'iv2','cipher2',110,110);assert.equal(db.prepare("SELECT count(*) n FROM entries WHERE type='totp'").get().n,1);assert.equal(migrateEntriesForTotp(db),false);assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);db.close()});

test('D1 0007 preserves populated rows and permits encrypted TOTP envelopes',async()=>{const db=populated();db.exec(await readFile(new URL('../apps/worker/migrations/0007_totp_entries.sql',import.meta.url),'utf8'));assert.deepEqual({...db.prepare('SELECT id,type,ciphertext,created_at FROM entries').get()},{id:'entry_123',type:'note',ciphertext:'cipher',created_at:90});db.prepare('INSERT INTO entries VALUES(?,?,?,?,?,?,?,?)').run('u','totp_123','totp',1,'iv2','cipher2',110,110);assert.equal(db.prepare("SELECT count(*) n FROM entries WHERE type='totp'").get().n,1);assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);db.close()});
