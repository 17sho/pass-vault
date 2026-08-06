import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrateEntriesCreatedAt, migrateEntriesRevision } from '../apps/server/migrations.mjs';

test('Linux created_at migration safely backfills updated_at and is idempotent',()=>{const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE entries(user_id TEXT NOT NULL,id TEXT NOT NULL,type TEXT NOT NULL,version INTEGER NOT NULL,iv TEXT NOT NULL,ciphertext TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,id));INSERT INTO entries VALUES('u','entry_123','note',1,'iv','cipher',123456)");assert.equal(migrateEntriesCreatedAt(db),true);assert.equal(db.prepare('SELECT created_at FROM entries').get().created_at,123456);assert.equal(migrateEntriesCreatedAt(db),false);db.close()});

test('Linux revision migration checks the schema only after acquiring the write lock',()=>{let locked=false,altered=false,committed=false,checks=0;const db={prepare(sql){assert.equal(locked,true);assert.match(sql,/table_info\(entries\)/);return{all(){checks++;return[{name:'revision'}]}}},exec(sql){if(sql==='BEGIN IMMEDIATE'){locked=true;return}if(sql==='COMMIT'){committed=true;return}if(sql==='ROLLBACK')return;if(sql.includes('ALTER TABLE'))altered=true}};assert.equal(migrateEntriesRevision(db),false);assert.equal(altered,false);assert.equal(committed,true);assert.equal(checks,1)});
