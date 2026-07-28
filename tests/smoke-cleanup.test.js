import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';

const script='scripts/cleanup-v156-smoke-users.mjs';
function fixture(withAttachment=false){const path=join(process.cwd(),`.tmp-clean-${Date.now()}-${Math.random()}.sqlite`),db=new DatabaseSync(path);db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE);CREATE TABLE sessions(id TEXT,user_id TEXT REFERENCES users(id) ON DELETE CASCADE);CREATE TABLE entries(id TEXT,user_id TEXT REFERENCES users(id) ON DELETE CASCADE);CREATE TABLE attachments(id TEXT,user_id TEXT REFERENCES users(id) ON DELETE CASCADE);INSERT INTO users VALUES('smoke','e2e_v156_sqlite_chromium_run');INSERT INTO sessions VALUES('s','smoke');INSERT INTO entries VALUES('e','smoke');${withAttachment?"INSERT INTO attachments VALUES('a','smoke');":''}INSERT INTO users VALUES('real','ordinary-user');`);db.close();return path}
const run=(path,prefix='e2e_v156_sqlite_chromium_run')=>spawnSync(process.execPath,[script,'sqlite',path,prefix],{encoding:'utf8'});
test('精确清理临时账户并级联会话和条目，不影响普通账户',()=>{const path=fixture(),r=run(path);assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);assert.deepEqual(out.after,{users:0,sessions:0,entries:0,attachments:0});const db=new DatabaseSync(path);assert.equal(db.prepare('SELECT COUNT(*) count FROM users WHERE username=?').get('ordinary-user').count,1);db.close()});
test('存在附件时拒绝删除账户，避免遗留磁盘或R2对象',()=>{const path=fixture(true),r=run(path);assert.notEqual(r.status,0);const db=new DatabaseSync(path);assert.equal(db.prepare('SELECT COUNT(*) count FROM users WHERE id=?').get('smoke').count,1);db.close()});
test('拒绝非烟测账户前缀',()=>{const path=fixture(),r=run(path,'ordinary-user');assert.notEqual(r.status,0)});
