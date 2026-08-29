import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile } from 'node:fs/promises';

const dir=new URL('../apps/worker/migrations/',import.meta.url);

test('D1 从 0001 整链迁移到最新且 foreign_key_check 为空',async()=>{
 const names=(await readdir(dir)).filter(name=>/^\d{4}.*\.sql$/.test(name)).sort();
 assert.equal(names.at(-1),'0035_attachments_object_key_index.sql');
 const db=new DatabaseSync(':memory:');
 try{
  for(const name of names)db.exec(await readFile(new URL(name,dir),'utf8'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='attachments'").all().map(row=>row.name);
  assert.ok(indexes.includes('idx_attachments_object_key'));
 }finally{db.close()}
});
