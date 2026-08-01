import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';

test('D1 0011/0012/0013从已填充0010增量升级并保留附件',async()=>{
 const db=new DatabaseSync(':memory:');
 for(const name of ['0001.sql','0002_attachments.sql','0003_r2_usage_quotas.sql','0004_settings.sql','0005_invite_attempts.sql','0006_entries_created_at.sql','0007_totp_entries.sql','0008_session_metadata.sql','0009_passkey_assisted_unlock.sql','0010_session_auth_method.sql'])db.exec(await readFile(new URL(`../apps/worker/migrations/${name}`,import.meta.url),'utf8'));
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run('u','user','h','s','{}','{}',1);
 db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)').run('u','attachment_1','iv','cipher','object-key',16,1,1);
 db.exec(await readFile(new URL('../apps/worker/migrations/0011_r2_cleanup_queue.sql',import.meta.url),'utf8'));
 db.exec(await readFile(new URL('../apps/worker/migrations/0012_backup_import_locks.sql',import.meta.url),'utf8'));
 db.exec(await readFile(new URL('../apps/worker/migrations/0013_r2_inflight_uploads.sql',import.meta.url),'utf8'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM attachments').get().n,1);
 db.prepare('INSERT INTO pending_r2_deletions VALUES(?,?,?)').run('orphan',19,2);
 db.prepare('INSERT INTO backup_import_locks VALUES(?,?,?)').run('u','token',3);
 db.prepare('INSERT INTO r2_inflight_uploads VALUES(?,?,?,?)').run('inflight',20,'upload-token',4);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM pending_r2_deletions').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM backup_import_locks').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM r2_inflight_uploads').get().n,1);
 db.close();
});