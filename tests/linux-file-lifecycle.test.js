import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { runAdminMigrations } from '../apps/admin-server/migrations-admin.mjs';
import {
  acquireMaintenanceFence, reserveFileWrite, enqueueFileDeletion,
  processFileDeletionOutbox, releaseMaintenanceFence,
  beginStartupFenceRecovery, finishStartupFenceRecovery,
  compensateFileWrite, cancelFileWrite, migrateLegacyDeletionQueues, validateFileWritePath,
  commitFileReference, installFileNoReplace, reconcileFileLifecycleAtStartup,
} from '../apps/server/file-lifecycle.mjs';

const hex = c => c.repeat(64);
const share = `${'a'.repeat(43)}/${'B'.repeat(43)}`;
function database(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=250;
    CREATE TABLE users(id TEXT PRIMARY KEY);
    CREATE TABLE attachments(user_id TEXT,object_key TEXT);
    CREATE TABLE secure_share_objects(object_key TEXT,upload_lease_token TEXT,uploaded_at INTEGER);
    CREATE TABLE maintenance_runs(id INTEGER PRIMARY KEY,status TEXT,started_at INTEGER,finished_at INTEGER,processed INTEGER DEFAULT 0,failed INTEGER DEFAULT 0,error_code TEXT);
    CREATE TABLE pending_file_deletions(object_key TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at INTEGER NOT NULL);
  `);
  try { runAdminMigrations(db); } catch (error) {
    if (!String(error.message).includes('idx_admin_file_deletions_created already exists')) throw error;
    db.exec('DROP INDEX IF EXISTS idx_admin_file_deletions_created');
    runAdminMigrations(db);
  }
  for (const trigger of ['file_lifecycle_attachments_insert', 'file_lifecycle_attachments_update', 'file_lifecycle_share_insert', 'file_lifecycle_share_update']) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  return db;
}

test('文件生命周期迁移幂等并为已有schema创建持久fence、intent与统一outbox', () => {
  const db = database();
  const again = runAdminMigrations(db);
  assert.ok(again.length === 0 || (again.length === 1 && again[0] === 'file_lifecycle'));
  for (const table of ['filesystem_maintenance_fence', 'file_write_intents', 'file_deletion_outbox', 'legacy_file_deletion_quarantine']) {
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
  }
  assert.deepEqual(db.prepare('PRAGMA table_info(filesystem_maintenance_fence)').all().filter(x => ['owner_id', 'phase', 'previous_owner_id'].includes(x.name)).map(x => x.name), ['owner_id', 'phase', 'previous_owner_id']);
  assert.deepEqual(db.prepare('PRAGMA table_info(file_deletion_outbox)').all().filter(x => ['claim_token', 'claimed_at'].includes(x.name)).map(x => x.name), ['claim_token', 'claimed_at']);
  assert.throws(() => db.prepare("INSERT INTO file_deletion_outbox(tree,object_key,dir_hash,reason,created_at) VALUES('attachment','../bad','','x',1)").run(), /constraint/i);
  db.close();
});

test('intent先到阻止fence，fence先到使写预约fail-closed且崩溃后不会自动过期', () => {
  const db = database();
  reserveFileWrite(db, { tree: 'attachment', objectKey: hex('1'), dirHash: hex('2'), userId: 'u', token: 'intent', expectedSize: 16 });
  assert.equal(acquireMaintenanceFence(db, { token: 'fence-a' }), false);
  db.prepare('DELETE FROM file_write_intents').run();
  assert.equal(acquireMaintenanceFence(db, { token: 'fence-a' }), true);
  assert.throws(() => reserveFileWrite(db, { tree: 'share', objectKey: share, token: 'intent-2', expectedSize: 16 }), /filesystem_maintenance/);
  db.prepare('UPDATE filesystem_maintenance_fence SET acquired_at=1').run();
  assert.equal(acquireMaintenanceFence(db, { token: 'different' }), false, 'fence不得按TTL被抢占');
  db.close();
});

test('删除即时复查全部引用与intent，引用重新出现时保护文件并结算outbox', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-life-ref-')), attachments = join(dir, 'attachments'), shares = join(dir, 'shares');
  const db = database(), userId = 'u', dirHash = createHash('sha256').update(userId).digest('hex'), key = hex('1'), target = join(attachments, dirHash, key);
  try {
    await mkdir(join(attachments, dirHash), { recursive: true }); await mkdir(shares, { recursive: true }); await writeFile(target, 'cipher');
    enqueueFileDeletion(db, { tree: 'attachment', objectKey: key, dirHash, reason: 'test' });
    db.prepare('INSERT INTO attachments VALUES(?,?)').run('u', key);
    const token = 'delete'; assert.equal(acquireMaintenanceFence(db, { token }), true);
    const result = await processFileDeletionOutbox(db, { ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, { fenceToken: token });
    assert.equal(result.protected, 1); assert.equal((await readFile(target, 'utf8')), 'cipher');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM file_deletion_outbox').get().c, 0);
    releaseMaintenanceFence(db, token);
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('恶意key与一级目录symlink均fail-closed并保留outbox', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-life-link-')), attachments = join(dir, 'attachments'), shares = join(dir, 'shares'), outside = join(dir, 'outside');
  const db = database(), dirHash = hex('2'), key = hex('1');
  try {
    await mkdir(attachments); await mkdir(shares); await mkdir(outside); await writeFile(join(outside, key), 'outside'); await symlink(outside, join(attachments, dirHash));
    enqueueFileDeletion(db, { tree: 'attachment', objectKey: key, dirHash, reason: 'test' });
    const token = 'delete'; assert.equal(acquireMaintenanceFence(db, { token }), true);
    const result = await processFileDeletionOutbox(db, { ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, { fenceToken: token });
    assert.equal(result.failed, 1); assert.equal((await readFile(join(outside, key), 'utf8')), 'outside');
    assert.equal(db.prepare('SELECT attempts FROM file_deletion_outbox').get().attempts, 1);
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('unlink等待期间不持SQLite写锁，其他连接可以提交无关写入', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-life-await-')), dbPath = join(dir, 'db.sqlite'), attachments = join(dir, 'attachments'), shares = join(dir, 'shares');
  const db = database(dbPath), dirHash = hex('2'), key = hex('1');
  try {
    await mkdir(join(attachments, dirHash), { recursive: true }); await mkdir(shares); await writeFile(join(attachments, dirHash, key), 'cipher');
    enqueueFileDeletion(db, { tree: 'attachment', objectKey: key, dirHash, reason: 'test' }); const token = 'delete'; acquireMaintenanceFence(db, { token });
    let unblock; const blocked = new Promise(resolve => { unblock = resolve; }); let entered; const seen = new Promise(resolve => { entered = resolve; });
    const processing = processFileDeletionOutbox(db, { ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, { fenceToken: token, beforeUnlink: async () => { entered(); await blocked; } });
    await seen;
    const other = new DatabaseSync(dbPath); other.exec('PRAGMA busy_timeout=100'); other.prepare('INSERT INTO users(id) VALUES(?)').run('concurrent'); other.close();
    unblock(); const result = await processing; assert.equal(result.processed, 1);
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('启动恢复器可持久接管遗留fence，恢复完成后原子解锁写路径', () => {
  const db = database();
  assert.equal(acquireMaintenanceFence(db, { token: 'dead', ownerId: 'boot-old' }), true);
  const recovery = beginStartupFenceRecovery(db, { token: 'recover', ownerId: 'boot-new' });
  assert.equal(recovery.status, 'recovering');
  assert.equal(recovery.previousOwnerId, 'boot-old');
  assert.throws(() => reserveFileWrite(db, { tree: 'attachment', objectKey: hex('1'), dirHash: hex('2'), userId: 'u', token: 'write', expectedSize: 1 }), /filesystem_maintenance/);
  assert.equal(finishStartupFenceRecovery(db, { token: 'recover', ownerId: 'boot-new' }), true);
  assert.equal(reserveFileWrite(db, { tree: 'attachment', objectKey: hex('1'), dirHash: hex('2'), userId: 'u', token: 'write', expectedSize: 1 }), true);
  db.close();
});

test('写失败补偿在同一事务先持久化outbox再消费匹配intent', () => {
  const db = database(), key = hex('1'), dirHash = hex('2');
  reserveFileWrite(db, { tree: 'attachment', objectKey: key, dirHash, userId: 'u', token: 'write', expectedSize: 9 });
  assert.throws(() => compensateFileWrite(db, { tree: 'attachment', objectKey: key, dirHash, token: 'wrong', reason: 'failed' }), /file_write_intent_not_owned/);
  assert.ok(db.prepare('SELECT 1 FROM file_write_intents').get());
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_deletion_outbox').get().c, 0);
  assert.equal(compensateFileWrite(db, { tree: 'attachment', objectKey: key, dirHash, token: 'write', reason: 'failed' }), true);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_write_intents').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_deletion_outbox').get().c, 1);
  db.close();
});

test('旧删除队列非法行进入quarantine且不阻塞后续合法行', () => {
  const db = database(), userId = 'u';
  db.prepare('INSERT INTO pending_file_deletions(object_key,user_id,created_at) VALUES(?,?,?)').run('../bad', userId, 1);
  db.prepare('INSERT INTO pending_file_deletions(object_key,user_id,created_at) VALUES(?,?,?)').run(hex('1'), userId, 2);
  db.prepare('INSERT INTO admin_file_deletions(tree,object_key,dir_hash,created_at) VALUES(?,?,?,?)').run('attachment', hex('3'), hex('4'), 3);
  const result = migrateLegacyDeletionQueues(db);
  assert.deepEqual(result, { migrated: 2, quarantined: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM pending_file_deletions').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM admin_file_deletions').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM legacy_file_deletion_quarantine').get().c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_deletion_outbox').get().c, 2);
  db.close();
});

test('写路径校验拒绝symlink父目录和已存在目标', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-life-write-')), attachments = join(dir, 'attachments'), shares = join(dir, 'shares'), outside = join(dir, 'outside');
  const dirHash = hex('2'), key = hex('1');
  try {
    await mkdir(attachments); await mkdir(shares); await mkdir(outside);
    await symlink(outside, join(attachments, dirHash));
    await assert.rejects(validateFileWritePath({ ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, 'attachment', key, dirHash), /unsafe_file_parent/);
    await rm(join(attachments, dirHash)); await mkdir(join(attachments, dirHash)); await writeFile(join(attachments, dirHash, key), 'exists');
    await assert.rejects(validateFileWritePath({ ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, 'attachment', key, dirHash), /unsafe_file_target/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('outbox在等待后用短事务claim并最终复查新引用', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-life-claim-')), attachments = join(dir, 'attachments'), shares = join(dir, 'shares');
  const db = database(), userId = 'u', dirHash = createHash('sha256').update(userId).digest('hex'), key = hex('1'), target = join(attachments, dirHash, key);
  try {
    await mkdir(join(attachments, dirHash), { recursive: true }); await mkdir(shares); await writeFile(target, 'cipher');
    enqueueFileDeletion(db, { tree: 'attachment', objectKey: key, dirHash, reason: 'test' });
    const token = 'delete'; acquireMaintenanceFence(db, { token });
    const result = await processFileDeletionOutbox(db, { ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, {
      fenceToken: token,
      beforeUnlink: async () => { db.prepare('INSERT INTO attachments VALUES(?,?)').run(userId, key); },
    });
    assert.equal(result.protected, 1);
    assert.equal(await readFile(target, 'utf8'), 'cipher');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM file_deletion_outbox').get().c, 0);
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('统一引用提交API原子校验并消费intent，失败时完整回滚', () => {
  const db = database(), key = hex('1'), dirHash = hex('2');
  reserveFileWrite(db, { tree: 'attachment', objectKey: key, dirHash, userId: 'u', token: 'write', expectedSize: 6 });
  assert.throws(() => commitFileReference(db, { tree: 'attachment', objectKey: key, dirHash, userId: 'u', token: 'wrong', expectedSize: 6 }, () => {
    db.prepare('INSERT INTO attachments VALUES(?,?)').run('u', key);
  }), /stale_file_write_intent/);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM attachments').get().c, 0);
  assert.equal(commitFileReference(db, { tree: 'attachment', objectKey: key, dirHash, userId: 'u', token: 'write', expectedSize: 6 }, () => {
    db.prepare('INSERT INTO attachments VALUES(?,?)').run('u', key); return 'ok';
  }), 'ok');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_write_intents').get().c, 0);
  db.close();
});

test('share补偿在同一事务清lease、入outbox并消费intent，不会永久阻断维护', () => {
  const db = database(), token = 'share-lease';
  db.prepare('INSERT INTO secure_share_objects VALUES(?,?,?)').run(share, token, null);
  reserveFileWrite(db, { tree: 'share', objectKey: share, token, expectedSize: 9 });
  compensateFileWrite(db, { tree: 'share', objectKey: share, token, reason: 'share_write_compensation' }, () => {
    const result = db.prepare('UPDATE secure_share_objects SET upload_lease_token=NULL WHERE object_key=? AND upload_lease_token=?').run(share, token);
    assert.equal(result.changes, 1);
  });
  assert.equal(db.prepare('SELECT upload_lease_token FROM secure_share_objects WHERE object_key=?').get(share).upload_lease_token, null);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_write_intents').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_deletion_outbox').get().c, 1);
  assert.equal(acquireMaintenanceFence(db, { token: 'maintenance' }), true);
  releaseMaintenanceFence(db, 'maintenance');
  db.close();
});

test('share未落盘取消在同一事务清lease并消费intent且不创建outbox', () => {
  const db = database(), token = 'share-cancel';
  db.prepare('INSERT INTO secure_share_objects VALUES(?,?,?)').run(share, token, null);
  reserveFileWrite(db, { tree: 'share', objectKey: share, token, expectedSize: 9 });
  cancelFileWrite(db, { tree: 'share', objectKey: share, token }, () => {
    db.prepare('UPDATE secure_share_objects SET upload_lease_token=NULL WHERE object_key=? AND upload_lease_token=?').run(share, token);
  });
  assert.equal(db.prepare('SELECT upload_lease_token FROM secure_share_objects WHERE object_key=?').get(share).upload_lease_token, null);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_write_intents').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_deletion_outbox').get().c, 0);
  db.close();
});

test('no-replace落盘不覆盖目标并拒绝不可信目录权限', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-life-install-')), attachments = join(dir, 'attachments'), shares = join(dir, 'shares');
  const dirHash = hex('2'), key = hex('1'), parent = join(attachments, dirHash), target = join(parent, key);
  try {
    await mkdir(parent, { recursive: true }); await mkdir(shares); const tmp = join(parent, '.upload.tmp'); await writeFile(tmp, 'new', { mode: 0o600 });
    const installed = await installFileNoReplace({ ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, { tree: 'attachment', objectKey: key, dirHash, tmpPath: tmp });
    assert.equal(installed, target); assert.equal(await readFile(target, 'utf8'), 'new'); await assert.rejects(lstat(tmp), /ENOENT/);
    const tmp2 = join(parent, '.upload-2.tmp'); await writeFile(tmp2, 'replacement', { mode: 0o600 });
    await assert.rejects(installFileNoReplace({ ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, { tree: 'attachment', objectKey: key, dirHash, tmpPath: tmp2 }), /unsafe_file_target/);
    assert.equal(await readFile(target, 'utf8'), 'new');
    await rm(target); await chmod(parent, 0o777);
    await assert.rejects(installFileNoReplace({ ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, { tree: 'attachment', objectKey: key, dirHash, tmpPath: tmp2 }), /unsafe_file_parent/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('启动reconciliation接管fence并结算引用、孤儿、缺失文件及share lease', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-life-startup-')), attachments = join(dir, 'attachments'), shares = join(dir, 'shares');
  const db = database(), userId = 'u', dirHash = createHash('sha256').update(userId).digest('hex');
  const referenced = hex('1'), orphan = hex('2'), missingShare = share;
  try {
    await mkdir(join(attachments, dirHash), { recursive: true }); await mkdir(join(shares, missingShare.split('/')[0]), { recursive: true });
    await writeFile(join(attachments, dirHash, referenced), 'stable'); await writeFile(join(attachments, dirHash, orphan), 'orphan');
    db.prepare('INSERT INTO attachments VALUES(?,?)').run(userId, referenced);
    reserveFileWrite(db, { tree: 'attachment', objectKey: referenced, dirHash, userId, token: 'stable', expectedSize: 6 });
    reserveFileWrite(db, { tree: 'attachment', objectKey: orphan, dirHash, userId, token: 'orphan', expectedSize: 6 });
    reserveFileWrite(db, { tree: 'share', objectKey: missingShare, token: 'share-lease', expectedSize: 9 });
    db.prepare('INSERT INTO secure_share_objects VALUES(?,?,?)').run(missingShare, 'share-lease', null);
    const result = await reconcileFileLifecycleAtStartup(db, { ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, { token: 'startup', ownerId: 'boot-1', processOutbox: false });
    assert.deepEqual(result.intents, { referenced: 1, orphaned: 1, missing: 1 });
    assert.equal(db.prepare('SELECT COUNT(*) c FROM file_write_intents').get().c, 0);
    assert.equal(db.prepare('SELECT upload_lease_token FROM secure_share_objects WHERE object_key=?').get(missingShare).upload_lease_token, null);
    assert.equal(db.prepare('SELECT object_key FROM file_deletion_outbox').get().object_key, orphan);
    assert.equal(db.prepare('SELECT 1 FROM filesystem_maintenance_fence').get(), undefined);
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('启动reconciliation异常保留recovering fence，outbox run跳过本轮失败前排', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-life-run-')), attachments = join(dir, 'attachments'), shares = join(dir, 'shares');
  const db = database(), dirHash = hex('2'), bad = hex('1'), good = hex('3');
  try {
    await mkdir(attachments); await mkdir(shares); await mkdir(join(attachments, dirHash));
    reserveFileWrite(db, { tree: 'attachment', objectKey: bad, dirHash, userId: 'u', token: 'bad', expectedSize: 1 });
    await chmod(join(attachments, dirHash), 0o777);
    await assert.rejects(reconcileFileLifecycleAtStartup(db, { ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, { token: 'startup', ownerId: 'boot-1' }), /unsafe_file_parent/);
    assert.equal(db.prepare('SELECT phase FROM filesystem_maintenance_fence').get().phase, 'recovering');
    db.prepare('DELETE FROM file_write_intents').run(); await chmod(join(attachments, dirHash), 0o755);
    enqueueFileDeletion(db, { tree: 'attachment', objectKey: bad, dirHash, reason: 'bad' }); enqueueFileDeletion(db, { tree: 'attachment', objectKey: good, dirHash, reason: 'good' });
    await mkdir(join(attachments, dirHash, bad)); await writeFile(join(attachments, dirHash, good), 'ok');
    const run = new Set();
    assert.equal((await processFileDeletionOutbox(db, { ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, { fenceToken: 'startup', limit: 1, run })).failed, 1);
    assert.equal((await processFileDeletionOutbox(db, { ATTACHMENTS_DIR: attachments, SHARES_DIR: shares }, { fenceToken: 'startup', limit: 1, run })).processed, 1);
    assert.equal(db.prepare('SELECT object_key FROM file_deletion_outbox').get().object_key, bad);
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});
