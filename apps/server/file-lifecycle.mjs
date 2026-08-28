import { link, lstat, open, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';

export const ATTACHMENT_KEY_RE = /^[a-f0-9]{64}$/;
export const SHARE_PATH_RE = /^[A-Za-z0-9_-]{43}\/[A-Za-z0-9_-]{43}$/;
const safeError = error => String(error?.code || error?.message || 'unlink_failed').slice(0, 200);

export function validFileIdentity(tree, objectKey, dirHash = '') {
  return tree === 'attachment'
    ? ATTACHMENT_KEY_RE.test(objectKey) && ATTACHMENT_KEY_RE.test(dirHash)
    : tree === 'share' && SHARE_PATH_RE.test(objectKey) && dirHash === '';
}

export function resolveFilePath(env, tree, objectKey, dirHash = '') {
  if (!validFileIdentity(tree, objectKey, dirHash)) throw new Error('invalid_file_identity');
  const root = resolve(tree === 'attachment' ? env.ATTACHMENTS_DIR : env.SHARES_DIR);
  const target = tree === 'attachment' ? resolve(root, dirHash, objectKey) : resolve(root, objectKey);
  if (!target.startsWith(root + sep)) throw new Error('unsafe_file_path');
  const shareDirLength = objectKey.indexOf('/');
  return { root, target, parent: dirname(target), first: tree === 'attachment' ? resolve(root, dirHash) : resolve(root, objectKey.slice(0, shareDirLength)) };
}

async function realDirectory(path, code) {
  let stat;
  try { stat = await lstat(path); } catch (error) { if (error.code === 'ENOENT') throw new Error(code); throw error; }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(code);
}

function trustedOwnerAndMode(stat) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : stat.uid;
  return stat.uid === uid && (stat.mode & 0o022) === 0;
}

async function trustedDirectory(path, code) {
  let stat;
  try { stat = await lstat(path); } catch (error) { if (error.code === 'ENOENT') throw new Error(code); throw error; }
  if (stat.isSymbolicLink() || !stat.isDirectory() || !trustedOwnerAndMode(stat)) throw new Error(code);
  return stat;
}

// Call immediately before rename. This rejects linked roots/parents and refuses to
// overwrite any existing filesystem object. Directory ownership/permissions remain
// the trust boundary because Node does not expose renameat2(RENAME_NOREPLACE).
export async function validateFileWritePath(env, tree, objectKey, dirHash = '') {
  const path = resolveFilePath(env, tree, objectKey, dirHash);
  await trustedDirectory(path.root, 'unsafe_file_root');
  await trustedDirectory(path.first, 'unsafe_file_parent');
  let target;
  try { target = await lstat(path.target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (target) throw new Error('unsafe_file_target');
  return path;
}

// Install a completed temporary file without an overwrite race. link(2) creates
// the target atomically or fails with EEXIST, unlike a check followed by rename.
export async function installFileNoReplace(env, { tree, objectKey, dirHash = '', tmpPath }) {
  const path = await validateFileWritePath(env, tree, objectKey, dirHash);
  if (resolve(dirname(tmpPath)) !== path.parent) throw new Error('unsafe_temp_path');
  const tmp = await lstat(tmpPath);
  if (tmp.isSymbolicLink() || !tmp.isFile() || !trustedOwnerAndMode(tmp)) throw new Error('unsafe_temp_file');
  try { await link(tmpPath, path.target); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('unsafe_file_target');
    throw error;
  }
  try { await unlink(tmpPath); } catch (error) {
    error.fileInstalled = true;
    error.installedTarget = path.target;
    throw error;
  }
  try { await syncParent(path.parent); } catch (error) {
    error.fileInstalled = true;
    error.installedTarget = path.target;
    throw error;
  }
  return path.target;
}

export function acquireMaintenanceFence(db, { token, runId = null, ownerId = null }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare("SELECT token FROM filesystem_maintenance_fence WHERE name='delete'").get();
    if (existing) { db.exec('ROLLBACK'); return existing.token === token; }
    const intents = db.prepare('SELECT 1 FROM file_write_intents LIMIT 1').get();
    const legacy = db.prepare('SELECT 1 FROM secure_share_objects WHERE upload_lease_token IS NOT NULL LIMIT 1').get();
    if (intents || legacy) { db.exec('ROLLBACK'); return false; }
    db.prepare("INSERT INTO filesystem_maintenance_fence(name,token,run_id,acquired_at,owner_id,phase) VALUES('delete',?,?,?,?, 'active')")
      .run(token, runId, Date.now(), ownerId);
    db.exec('COMMIT'); return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

// Startup-only takeover: the caller must establish that the previous process is
// not alive before invoking this. The recovering phase remains fail-closed and is
// durable across another crash, so recovery can be resumed by the next boot.
export function beginStartupFenceRecovery(db, { token, ownerId }) {
  if (!token || !ownerId) throw new Error('invalid_startup_recovery_identity');
  db.exec('BEGIN IMMEDIATE');
  try {
    const old = db.prepare("SELECT token,owner_id,phase FROM filesystem_maintenance_fence WHERE name='delete'").get();
    if (!old) {
      db.prepare("INSERT INTO filesystem_maintenance_fence(name,token,acquired_at,owner_id,phase) VALUES('delete',?,?,?,'recovering')").run(token, Date.now(), ownerId);
    } else if (!(old.token === token && old.owner_id === ownerId && old.phase === 'recovering')) {
      db.prepare("UPDATE filesystem_maintenance_fence SET token=?,owner_id=?,phase='recovering',previous_owner_id=?,acquired_at=? WHERE name='delete'")
        .run(token, ownerId, old.owner_id, Date.now());
    }
    // A process may have crashed after persisting a claim but before unlink or
    // settlement. Recovery makes every claim eligible for final re-check again.
    db.prepare('UPDATE file_deletion_outbox SET claim_token=NULL,claimed_at=NULL WHERE claim_token IS NOT NULL').run();
    const row = db.prepare("SELECT phase status,previous_owner_id previousOwnerId FROM filesystem_maintenance_fence WHERE name='delete'").get();
    db.exec('COMMIT'); return row;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function finishStartupFenceRecovery(db, { token, ownerId }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare("DELETE FROM filesystem_maintenance_fence WHERE name='delete' AND token=? AND owner_id=? AND phase='recovering'").run(token, ownerId);
    if (Number(result.changes) !== 1) throw new Error('startup_recovery_fence_not_owned');
    db.exec('COMMIT'); return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function releaseMaintenanceFence(db, token) {
  return Number(db.prepare("DELETE FROM filesystem_maintenance_fence WHERE name='delete' AND token=?").run(token).changes) === 1;
}

export function reserveFileWrite(db, { tree, objectKey, dirHash = '', userId = null, token, expectedSize }) {
  if (!validFileIdentity(tree, objectKey, dirHash)) throw new Error('invalid_file_identity');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare("SELECT 1 FROM filesystem_maintenance_fence WHERE name='delete'").get()) throw new Error('filesystem_maintenance');
    if (db.prepare('SELECT 1 FROM file_deletion_outbox WHERE tree=? AND dir_hash=? AND object_key=?').get(tree, dirHash, objectKey)) throw new Error('file_deletion_pending');
    db.prepare('INSERT INTO file_write_intents(tree,object_key,dir_hash,user_id,token,expected_size,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(tree, objectKey, dirHash, userId, token, expectedSize, Date.now());
    db.exec('COMMIT'); return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function consumeFileWriteIntent(db, { tree, objectKey, dirHash = '', token }) {
  return Number(db.prepare('DELETE FROM file_write_intents WHERE tree=? AND dir_hash=? AND object_key=? AND token=?').run(tree, dirHash, objectKey, token).changes) === 1;
}

export function commitFileReference(db, intent, operation) {
  const { tree, objectKey, dirHash = '', userId = null, token, expectedSize } = intent;
  if (!validFileIdentity(tree, objectKey, dirHash) || typeof operation !== 'function') throw new Error('invalid_file_reference_commit');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare("SELECT 1 FROM filesystem_maintenance_fence WHERE name='delete'").get()) throw new Error('filesystem_maintenance');
    const owned = db.prepare('SELECT 1 FROM file_write_intents WHERE tree=? AND dir_hash=? AND object_key=? AND token=? AND user_id IS ? AND expected_size=?')
      .get(tree, dirHash, objectKey, token, userId, expectedSize);
    if (!owned) throw new Error('stale_file_write_intent');
    const value = operation();
    if (value && typeof value.then === 'function') throw new Error('async_file_reference_commit_not_supported');
    if (!consumeFileWriteIntent(db, { tree, objectKey, dirHash, token })) throw new Error('stale_file_write_intent');
    db.exec('COMMIT');
    return value;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function enqueueFileDeletion(db, { tree, objectKey, dirHash = '', reason }) {
  if (!validFileIdentity(tree, objectKey, dirHash)) throw new Error('invalid_file_identity');
  return Number(db.prepare('INSERT INTO file_deletion_outbox(tree,object_key,dir_hash,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT(tree,dir_hash,object_key) DO NOTHING')
    .run(tree, objectKey, dirHash, reason, Date.now()).changes);
}

export function cancelFileWrite(db, { tree, objectKey, dirHash = '', token }, operation) {
  if (!validFileIdentity(tree, objectKey, dirHash)) throw new Error('invalid_file_identity');
  db.exec('BEGIN IMMEDIATE');
  try {
    operation?.();
    if (!consumeFileWriteIntent(db, { tree, objectKey, dirHash, token })) throw new Error('file_write_intent_not_owned');
    db.exec('COMMIT'); return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

// Crash-safe compensation: any reference/lease transition, enqueue, and owned-intent
// consumption are committed together. The operation runs before enqueue so DB triggers
// can still validate the matching intent and do not see a conflicting outbox row.
export function compensateFileWrite(db, { tree, objectKey, dirHash = '', token, reason = 'write_compensation' }, operation) {
  if (!validFileIdentity(tree, objectKey, dirHash)) throw new Error('invalid_file_identity');
  db.exec('BEGIN IMMEDIATE');
  try {
    operation?.();
    enqueueFileDeletion(db, { tree, objectKey, dirHash, reason });
    if (!consumeFileWriteIntent(db, { tree, objectKey, dirHash, token })) throw new Error('file_write_intent_not_owned');
    db.exec('COMMIT'); return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function migrateLegacyDeletionQueues(db) {
  let migrated = 0, quarantined = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of db.prepare('SELECT object_key,user_id,created_at FROM pending_file_deletions ORDER BY created_at,object_key').all()) {
      if (typeof row.user_id === 'string' && ATTACHMENT_KEY_RE.test(row.object_key)) {
        enqueueFileDeletion(db, { tree: 'attachment', objectKey: row.object_key, dirHash: createHash('sha256').update(row.user_id).digest('hex'), reason: 'legacy_pending' }); migrated++;
      } else {
        db.prepare("INSERT INTO legacy_file_deletion_quarantine(source,source_key,error_code,created_at,quarantined_at) VALUES('pending_file_deletions',?,'invalid_identity',?,?)")
          .run(String(row.object_key).slice(0, 200), row.created_at, Date.now()); quarantined++;
      }
      db.prepare('DELETE FROM pending_file_deletions WHERE object_key=?').run(row.object_key);
    }
    for (const row of db.prepare('SELECT id,tree,object_key,dir_hash,created_at FROM admin_file_deletions ORDER BY created_at,id').all()) {
      if (validFileIdentity(row.tree, row.object_key, row.dir_hash)) {
        enqueueFileDeletion(db, { tree: row.tree, objectKey: row.object_key, dirHash: row.dir_hash, reason: 'legacy_admin' }); migrated++;
      } else {
        db.prepare("INSERT INTO legacy_file_deletion_quarantine(source,source_key,error_code,created_at,quarantined_at) VALUES('admin_file_deletions',?,'invalid_identity',?,?)")
          .run(String(row.id), row.created_at, Date.now()); quarantined++;
      }
      db.prepare('DELETE FROM admin_file_deletions WHERE id=?').run(row.id);
    }
    db.exec('COMMIT'); return { migrated, quarantined };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function hasStableReference(db, row) {
  if (row.tree === 'share') {
    const ref = db.prepare('SELECT uploaded_at,ciphertext_size FROM secure_share_objects WHERE object_key=? LIMIT 1').get(row.object_key);
    return Boolean(ref && ref.uploaded_at !== null && ref.ciphertext_size === row.expected_size);
  }
  return db.prepare('SELECT user_id FROM attachments WHERE object_key=?').all(row.object_key)
    .some(value => value.user_id === row.user_id && createHash('sha256').update(value.user_id).digest('hex') === row.dir_hash);
}

function isReferenced(db, row) {
  if (db.prepare('SELECT 1 FROM file_write_intents WHERE tree=? AND dir_hash=? AND object_key=? LIMIT 1').get(row.tree, row.dir_hash, row.object_key)) return true;
  if (row.tree === 'share') return Boolean(db.prepare('SELECT 1 FROM secure_share_objects WHERE object_key=? LIMIT 1').get(row.object_key));
  return db.prepare('SELECT user_id FROM attachments WHERE object_key=?').all(row.object_key)
    .some(value => createHash('sha256').update(value.user_id).digest('hex') === row.dir_hash);
}

async function syncParent(parent) {
  const handle = await open(parent, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function inspectDeletePath(env, row) {
  const path = resolveFilePath(env, row.tree, row.object_key, row.dir_hash);
  await realDirectory(path.root, 'unsafe_file_root');
  await realDirectory(path.first, 'unsafe_file_parent');
  let targetStat;
  try { targetStat = await lstat(path.target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (targetStat?.isSymbolicLink() || targetStat?.isDirectory()) throw new Error('unsafe_file_target');
  return path;
}

function claimDeletion(db, row, fenceToken, claimToken) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const owner = db.prepare("SELECT token FROM filesystem_maintenance_fence WHERE name='delete'").get();
    if (!owner || owner.token !== fenceToken) throw new Error('filesystem_maintenance_fence_not_owned');
    if (isReferenced(db, row)) { db.prepare('DELETE FROM file_deletion_outbox WHERE id=?').run(row.id); db.exec('COMMIT'); return false; }
    const claimed = db.prepare('UPDATE file_deletion_outbox SET claim_token=?,claimed_at=? WHERE id=? AND claim_token IS NULL').run(claimToken, Date.now(), row.id);
    if (Number(claimed.changes) !== 1) throw new Error('file_deletion_already_claimed');
    db.exec('COMMIT'); return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export async function processFileDeletionOutbox(db, env, { fenceToken, limit = 20, beforeUnlink, filter, run } = {}) {
  const owner = db.prepare("SELECT token FROM filesystem_maintenance_fence WHERE name='delete'").get();
  if (!owner || owner.token !== fenceToken) throw new Error('filesystem_maintenance_fence_not_owned');
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_outbox_limit');
  const seen = run instanceof Set ? run : null;
  const candidates = db.prepare('SELECT id,tree,object_key,dir_hash,reason FROM file_deletion_outbox WHERE claim_token IS NULL ORDER BY created_at,id').all();
  const rows = [];
  for (const row of candidates) {
    if (seen?.has(row.id) || (filter && !filter(row))) continue;
    rows.push(row); if (rows.length === limit) break;
  }
  let processed = 0, failed = 0, protectedCount = 0;
  for (const row of rows) {
    seen?.add(row.id);
    const claimToken = randomUUID();
    try {
      const path = await inspectDeletePath(env, row);
      if (beforeUnlink) await beforeUnlink(row, path.target);
      if (!claimDeletion(db, row, fenceToken, claimToken)) { protectedCount++; continue; }
      try { await unlink(path.target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await syncParent(path.parent);
      db.exec('BEGIN IMMEDIATE');
      try {
        const fence = db.prepare("SELECT token FROM filesystem_maintenance_fence WHERE name='delete'").get();
        if (!fence || fence.token !== fenceToken) throw new Error('filesystem_maintenance_fence_not_owned');
        db.prepare('DELETE FROM file_deletion_outbox WHERE id=? AND claim_token=?').run(row.id, claimToken);
        db.exec('COMMIT'); processed++;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } catch (error) {
      db.prepare('UPDATE file_deletion_outbox SET attempts=attempts+1,last_error=?,claim_token=NULL,claimed_at=NULL WHERE id=? AND (claim_token IS NULL OR claim_token=?)').run(safeError(error), row.id, claimToken); failed++;
    }
  }
  return { processed, failed, protected: protectedCount };
}

function settleStartupIntent(db, row, disposition) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const owned = db.prepare('SELECT 1 FROM file_write_intents WHERE tree=? AND dir_hash=? AND object_key=? AND token=?').get(row.tree, row.dir_hash, row.object_key, row.token);
    if (!owned) throw new Error('file_write_intent_not_owned');
    if (disposition === 'orphaned') enqueueFileDeletion(db, { tree: row.tree, objectKey: row.object_key, dirHash: row.dir_hash, reason: 'startup_orphaned_write' });
    if (disposition === 'missing' && row.tree === 'share') {
      db.prepare('UPDATE secure_share_objects SET upload_lease_token=NULL WHERE object_key=? AND upload_lease_token=? AND uploaded_at IS NULL').run(row.object_key, row.token);
    }
    if (!consumeFileWriteIntent(db, { tree: row.tree, objectKey: row.object_key, dirHash: row.dir_hash, token: row.token })) throw new Error('file_write_intent_not_owned');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export async function reconcileFileLifecycleAtStartup(db, env, {
  token = randomUUID(), ownerId = randomUUID(), processOutbox = true,
  outboxLimit = 100, outboxFilter,
} = {}) {
  beginStartupFenceRecovery(db, { token, ownerId });
  const result = { migrated: null, intents: { referenced: 0, orphaned: 0, missing: 0 }, outbox: { processed: 0, failed: 0, protected: 0 } };
  try {
    result.migrated = migrateLegacyDeletionQueues(db);
    const intents = db.prepare('SELECT tree,object_key,dir_hash,user_id,token,expected_size FROM file_write_intents ORDER BY created_at,tree,dir_hash,object_key').all();
    for (const row of intents) {
      const path = resolveFilePath(env, row.tree, row.object_key, row.dir_hash);
      await trustedDirectory(path.root, 'unsafe_file_root');
      await trustedDirectory(path.first, 'unsafe_file_parent');
      let stat;
      try { stat = await lstat(path.target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (stat && (stat.isSymbolicLink() || !stat.isFile())) throw new Error('unsafe_file_target');
      if (!stat) {
        settleStartupIntent(db, row, 'missing'); result.intents.missing++; continue;
      }
      if (stat.size !== row.expected_size) throw new Error('file_write_size_mismatch');
      const disposition = hasStableReference(db, row) ? 'referenced' : 'orphaned';
      settleStartupIntent(db, row, disposition); result.intents[disposition]++;
    }
    if (processOutbox) {
      const run = new Set();
      result.outbox = await processFileDeletionOutbox(db, env, { fenceToken: token, limit: outboxLimit, filter: outboxFilter, run });
    }
    finishStartupFenceRecovery(db, { token, ownerId });
    return result;
  } catch (error) {
    // Deliberately retain the recovering fence: writes/deletes stay fail-closed and
    // the same reconciliation can resume safely on the next startup.
    throw error;
  }
}
