import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrateEntriesCreatedAt } from '../apps/server/migrations.mjs';

test('Linux created_at migration safely backfills updated_at and is idempotent',()=>{const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE entries(user_id TEXT NOT NULL,id TEXT NOT NULL,type TEXT NOT NULL,version INTEGER NOT NULL,iv TEXT NOT NULL,ciphertext TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,id));INSERT INTO entries VALUES('u','entry_123','note',1,'iv','cipher',123456)");assert.equal(migrateEntriesCreatedAt(db),true);assert.equal(db.prepare('SELECT created_at FROM entries').get().created_at,123456);assert.equal(migrateEntriesCreatedAt(db),false);db.close()});
