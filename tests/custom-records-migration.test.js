import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

const migrations=['0001.sql','0002_attachments.sql','0003_r2_usage_quotas.sql','0004_settings.sql','0005_invite_attempts.sql','0006_entries_created_at.sql','0007_totp_entries.sql','0008_session_metadata.sql','0009_passkey_assisted_unlock.sql','0010_session_auth_method.sql','0011_r2_cleanup_queue.sql','0012_backup_import_locks.sql','0013_r2_inflight_uploads.sql','0014_entries_revision.sql','0015_attachments_revision.sql','0016_revision_tombstones.sql','0017_password_hash_iterations.sql','0018_admin_audit_logs.sql','0019_admin_registration_observability.sql'];

test('D1 0020保留已填充条目及revision并允许custom密文',async()=>{
 const db=new DatabaseSync(':memory:');
 for(const name of migrations)db.exec(await readFile(new URL(`../apps/worker/migrations/${name}`,import.meta.url),'utf8'));
 const columns=db.prepare('PRAGMA table_info(users)').all().map(x=>x.name);
 const values={id:'user_0001',username:'u',password_hash:'h',password_salt:'s',password_iterations:100000,kdf:'{}',wrapped_key:'{}',created_at:1};
 db.prepare(`INSERT INTO users(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(x=>values[x]??(x==='registration_ip'?'unknown':0)));
 db.prepare('INSERT INTO entries(user_id,id,type,version,iv,ciphertext,updated_at,created_at,revision) VALUES(?,?,?,?,?,?,?,?,?)').run('user_0001','note_0001','note',1,'iv','cipher',2,1,7);
 db.exec(await readFile(new URL('../apps/worker/migrations/0020_custom_entries.sql',import.meta.url),'utf8'));
 assert.deepEqual({...db.prepare('SELECT type,ciphertext,revision FROM entries WHERE id=?').get('note_0001')},{type:'note',ciphertext:'cipher',revision:7});
 db.prepare('INSERT INTO entries(user_id,id,type,version,iv,ciphertext,updated_at,created_at,revision) VALUES(?,?,?,?,?,?,?,?,?)').run('user_0001','custom_01','custom',1,'iv','opaque',3,3,1);
 assert.equal(db.prepare('SELECT ciphertext FROM entries WHERE id=?').get('custom_01').ciphertext,'opaque');
 db.close();
});
