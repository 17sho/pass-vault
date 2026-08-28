// Admin maintenance endpoints — server-build port of admin-worker maintenance.
// Endpoints: POST /api/maintenance/scan, POST /api/maintenance/:id/repair,
//            POST /api/maintenance/retry
//
// Local adaptations vs Cloudflare:
//   - R2 .list() orphan scan -> walk local filesystem:
//       attachments: ATTACHMENTS_DIR/<sha256(userId)>/<64-hex key>
//       shares:      SHARES_DIR/<64-hex token hash>/<base64url object key>
//   - pending_r2_deletions -> pending_file_deletions
//   - No attachment_versions / r2_inflight_uploads (server has neither)
//   - "repair" queues orphans into pending_file_deletions; "retry" unlinks queued
//     files whose DB rows are gone (double-checking they're still unreferenced).
//   - maintenance_leases guards single-flight retry (same as CF).
import { createHash, randomUUID } from 'node:crypto';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { auditLog } from './users.mjs';

const digest = x => createHash('sha256').update(x).digest('hex');
const ATTACH_KEY_RE = /^[a-f0-9]{64}$/;                 // attachment object keys
const SHARE_KEY_RE = /^[A-Za-z0-9_-]{43}$/;             // share object keys (base64url of 32 bytes)
const SCAN_OBJECT_CAP = 100000;                          // safety bound like CF
const REPORT_ITEM_CAP = 1000;

function sharesDir(env) { return resolve(env.SHARES_DIR || join(dirname(env.DB_PATH), 'shares')); }

// Build the set of every object_key the DB still references (attachments + shares).
function referencedKeys(db) {
  const known = new Set();
  for (const r of db.prepare('SELECT object_key FROM attachments').all()) known.add(r.object_key);
  for (const r of db.prepare("SELECT object_key FROM secure_share_objects WHERE uploaded_at IS NOT NULL").all()) known.add(r.object_key);
  // Files still queued for deletion are "known" (do not double-report as orphan).
  for (const r of db.prepare('SELECT object_key FROM pending_file_deletions').all()) known.add(r.object_key);
  return known;
}

// Map userId -> user.id by scanning the attachments dir names (sha256 of user.id).
function userDirIndex(db) {
  const index = new Map();
  for (const u of db.prepare('SELECT id FROM users').all()) index.set(digest(u.id), u.id);
  return index;
}

// POST /api/maintenance/scan — find orphaned files on disk (no DB reference).
export async function scanMaintenance(db, env, actor) {
  const now = Date.now();
  const known = referencedKeys(db);
  const dirIndex = userDirIndex(db);
  const orphans = [];
  let objects = 0, orphan = 0, incomplete = false;

  // 1) Attachment files: ATTACHMENTS_DIR/<sha256(userId)>/<key>
  let userDirs = [];
  try { userDirs = await readdir(env.ATTACHMENTS_DIR); } catch (e) { if (e.code !== 'ENOENT') incomplete = true; }
  for (const dirName of userDirs) {
    if (objects >= SCAN_OBJECT_CAP) { incomplete = true; break; }
    const full = join(env.ATTACHMENTS_DIR, dirName);
    let names = [];
    try { const s = await stat(full); if (!s.isDirectory()) continue; names = await readdir(full); }
    catch (e) { if (e.code !== 'ENOENT') incomplete = true; continue; }
    const userId = dirIndex.get(dirName) || null;
    for (const name of names) {
      if (!ATTACH_KEY_RE.test(name)) continue; // skip .tmp and stray files
      objects++;
      if (!known.has(name)) {
        orphan++;
        if (orphans.length < REPORT_ITEM_CAP) {
          let size = 0; try { size = (await stat(join(full, name))).size || 0; } catch {}
          orphans.push({ key: name, size, tree: 'attachment', userId, dirHash: dirName });
        }
      }
    }
  }

  // 2) Share files: SHARES_DIR/<64-hex token hash>/<43-char object key>
  const sdir = sharesDir(env);
  let shareDirs = [];
  try { shareDirs = await readdir(sdir); } catch (e) { if (e.code !== 'ENOENT') incomplete = true; }
  for (const dirName of shareDirs) {
    if (!ATTACH_KEY_RE.test(dirName)) continue; // token-hash dirs are 64 hex; skip stray files
    if (objects >= SCAN_OBJECT_CAP) { incomplete = true; break; }
    const full = join(sdir, dirName);
    let names = [];
    try { const s = await stat(full); if (!s.isDirectory()) continue; names = await readdir(full); }
    catch (e) { if (e.code !== 'ENOENT') incomplete = true; continue; }
    for (const name of names) {
      if (!SHARE_KEY_RE.test(name)) continue; // skip .tmp and stray files
      if (objects >= SCAN_OBJECT_CAP) { incomplete = true; break; }
      objects++;
      const key = `${dirName}/${name}`;
      if (!known.has(key)) {
        orphan++;
        if (orphans.length < REPORT_ITEM_CAP) {
          let size = 0; try { size = (await stat(join(full, name))).size || 0; } catch {}
          orphans.push({ key, size, tree: 'share', userId: null });
        }
      }
    }
  }

  const truncated = incomplete || orphan > orphans.length;
  const pending = Number(db.prepare('SELECT COUNT(*) count FROM pending_file_deletions').get()?.count) || 0;
  const status = incomplete ? 'failed' : 'ready';

  let id = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = db.prepare('INSERT INTO maintenance_reports(status,orphan_count,missing_count,pending_count,scanned_at,actor_email,error_code) VALUES(?,?,?,?,?,?,?)')
      .run(status, orphan, 0, pending, now, actor, incomplete ? 'scan_incomplete' : null);
    id = Number(r.lastInsertRowid) || 0;
    if (id && !incomplete && orphans.length) {
      const ins = db.prepare('INSERT INTO maintenance_report_items(report_id,object_key,ciphertext_size,tree,user_id,dir_hash) VALUES(?,?,?,?,?,?)');
      for (const o of orphans) ins.run(id, o.key, o.size, o.tree, o.userId, o.dirHash || null);
    }
    auditLog(db, actor, 'scan_maintenance', null, { orphan, pending, truncated });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  return { id, status, orphanCount: orphan, missingCount: 0, pendingCount: pending, truncated };
}

// POST /api/maintenance/:id/repair — queue a report's orphans for deletion.
// Requires body { confirm: "REPAIR:<id>" }. Re-checks each key is still unreferenced.
// Attachment orphans with a resolvable user_id go through the pending_file_deletions
// queue (bounded, retry-driven). Share orphans and orphans without a user_id cannot
// be queued (the queue's user_id is NOT NULL), so they are unlinked directly here —
// still gated by the explicit REPAIR confirmation.
export async function repairMaintenance(db, env, actor, id, input) {
  if (!Number.isSafeInteger(id) || id < 1 || !input || typeof input !== 'object' || input.confirm !== `REPAIR:${id}`) return null;
  const report = db.prepare("SELECT id,status FROM maintenance_reports WHERE id=? AND status='ready'").get(id);
  if (!report) return undefined;
  const items = db.prepare('SELECT object_key,ciphertext_size,tree,user_id,dir_hash FROM maintenance_report_items WHERE report_id=? ORDER BY object_key LIMIT 20').all(id);
  const sdir = sharesDir(env);
  const stillRef = db.prepare('SELECT 1 FROM attachments WHERE object_key=? UNION SELECT 1 FROM secure_share_objects WHERE object_key=? AND uploaded_at IS NOT NULL LIMIT 1');

  let queued = 0;
  // Decide each item's disposition WITHOUT mutating the report yet, then perform any
  // physical unlinks BEFORE settling report rows. A failed (non-ENOENT) unlink leaves
  // the report item in place so the next REPAIR retries it — no silent orphan loss.
  const toQueue = [];   // owned attachments → retry queue (settled once enqueued)
  const toUnlink = [];  // { item, path } share/user-gone orphans → unlink now
  for (const item of items) {
    if (stillRef.get(item.object_key, item.object_key)) { toQueue.push({ item, settle: true, queue: false }); continue; }
    if (item.tree === 'attachment' && item.user_id) {
      toQueue.push({ item, settle: true, queue: true });
    } else if (item.tree === 'share') {
      toUnlink.push({ item, path: join(sdir, item.object_key) });
    } else if (item.tree === 'attachment' && !item.user_id && item.dir_hash) {
      toUnlink.push({ item, path: join(env.ATTACHMENTS_DIR, item.dir_hash, item.object_key) });
    } else {
      toQueue.push({ item, settle: true, queue: false }); // unactionable shape: drop stale report row
    }
  }
  // Best-effort physical deletes first; only settle the ones that actually left disk.
  let unlinked = 0;
  const settledKeys = new Set();
  for (const { item, path } of toUnlink) {
    try { await unlink(path); unlinked++; settledKeys.add(item.object_key); }
    catch (e) { if (e.code === 'ENOENT') settledKeys.add(item.object_key); /* else: keep for retry */ }
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const enqueue = db.prepare("INSERT INTO pending_file_deletions(object_key,user_id,created_at,ciphertext_size) VALUES(?,?,?,?) ON CONFLICT(object_key) DO NOTHING");
    const dropItem = db.prepare('DELETE FROM maintenance_report_items WHERE report_id=? AND object_key=?');
    for (const { item, settle, queue } of toQueue) {
      if (queue) queued += Number(enqueue.run(item.object_key, item.user_id, Date.now(), item.ciphertext_size).changes) || 0;
      if (settle) dropItem.run(id, item.object_key);
    }
    for (const key of settledKeys) dropItem.run(id, key);
    const remaining = Number(db.prepare('SELECT COUNT(*) count FROM maintenance_report_items WHERE report_id=?').get(id)?.count) || 0;
    const status = remaining === 0 ? 'repaired' : 'ready';
    db.prepare("UPDATE maintenance_reports SET status=?,repaired_at=CASE WHEN ?='repaired' THEN ? ELSE repaired_at END WHERE id=? AND status='ready'").run(status, status, Date.now(), id);
    auditLog(db, actor, 'repair_maintenance', null, { reportId: id, queued, unlinked });
    db.exec('COMMIT');
    return { reportId: id, status, queued, unlinked, remaining };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// POST /api/maintenance/retry — process the pending_file_deletions queue.
// Unlinks files whose DB references are gone; drops rows for files that became
// referenced again (protected). Single-flight via maintenance_leases.
export async function retryMaintenance(db, env, actor) {
  let processed = 0, failed = 0, protectedCount = 0;
  auditLog(db, actor, 'retry_maintenance', null, { status: 'started' });
  const started = Date.now(), leaseToken = randomUUID();
  const lease = db.prepare('INSERT INTO maintenance_leases(name,token,expires_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE maintenance_leases.expires_at<=?')
    .run('admin-retry', leaseToken, started + 15 * 60 * 1000, started);
  if (Number(lease.changes) !== 1) return { processed, failed: 1, protected: protectedCount, error: 'locked' };

  const dirIndex = userDirIndex(db);
  const sdir = sharesDir(env);
  try {
    const rows = db.prepare('SELECT object_key,user_id,ciphertext_size FROM pending_file_deletions ORDER BY created_at LIMIT 20').all();
    const stillRef = db.prepare('SELECT 1 FROM attachments WHERE object_key=? UNION SELECT 1 FROM secure_share_objects WHERE object_key=? AND uploaded_at IS NOT NULL LIMIT 1');
    for (const row of rows) {
      try {
        if (stillRef.get(row.object_key, row.object_key)) {
          const done = db.prepare('DELETE FROM pending_file_deletions WHERE object_key=?').run(row.object_key);
          if (Number(done.changes) === 1) { protectedCount++; auditLog(db, actor, 'retry_maintenance', null, { status: 'protected' }); }
          continue;
        }
        // Resolve physical path: attachment (userId dir) or share (flat).
        let target;
        if (row.user_id && dirIndex.has(digest(row.user_id))) target = join(env.ATTACHMENTS_DIR, digest(row.user_id), row.object_key);
        else if (ATTACH_KEY_RE.test(row.object_key) && row.user_id) target = join(env.ATTACHMENTS_DIR, digest(row.user_id), row.object_key);
        else target = join(sdir, row.object_key);
        try { await unlink(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        const done = db.prepare('DELETE FROM pending_file_deletions WHERE object_key=?').run(row.object_key);
        if (Number(done.changes) === 1) { processed++; auditLog(db, actor, 'retry_maintenance', null, { status: 'deleted', bytes: Number(row.ciphertext_size) || 0 }); }
      } catch { failed++; }
    }
  } finally {
    try { db.prepare('DELETE FROM maintenance_leases WHERE name=? AND token=?').run('admin-retry', leaseToken); } catch {}
  }
  const result = { processed, failed, protected: protectedCount };
  try { auditLog(db, actor, 'retry_maintenance', null, result); } catch {}
  return result;
}
