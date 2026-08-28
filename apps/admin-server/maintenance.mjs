// Admin maintenance endpoints — server-build port of admin-worker maintenance.
// Endpoints: POST /api/maintenance/scan, POST /api/maintenance/:id/repair,
//            POST /api/maintenance/retry
//
// Local adaptations vs Cloudflare:
//   - R2 .list() orphan scan -> walk local filesystem:
//       attachments: ATTACHMENTS_DIR/<sha256(userId)>/<64-hex key>
//       shares:      SHARES_DIR/<64-hex token hash>/<base64url object key>
//   - No attachment_versions / r2_inflight_uploads (server has neither)
//   - Legacy local queues are migrated/quarantined into the unified durable outbox.
//   - "repair" only settles an orphan after a stable reference or durable outbox
//     row is confirmed; "retry" performs the physical unlink behind the file fence.
import { createHash, randomUUID } from 'node:crypto';
import { readdir, lstat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { auditLog } from './users.mjs';
import { acquireMaintenanceFence, releaseMaintenanceFence, enqueueFileDeletion, migrateLegacyDeletionQueues, processFileDeletionOutbox, ATTACHMENT_KEY_RE, SHARE_PATH_RE } from '../server/file-lifecycle.mjs';

const digest = x => createHash('sha256').update(x).digest('hex');
const ATTACH_KEY_RE = /^[a-f0-9]{64}$/;                 // attachment object keys
const SHARE_KEY_RE = /^[A-Za-z0-9_-]{43}$/;            // share file names
const SCAN_OBJECT_CAP = 100000;                          // safety bound like CF
const REPORT_ITEM_CAP = 1000;

function sharesDir(env) { return resolve(env.SHARES_DIR || join(dirname(env.DB_PATH), 'shares')); }

async function processSelectedOutbox(db, env, fenceToken, queueIds) {
  if (queueIds === null) return processFileDeletionOutbox(db, env, { fenceToken });
  const ids = new Set(queueIds.filter(id => Number.isSafeInteger(id) && id > 0));
  if (!ids.size) return { processed: 0, failed: 0, protected: 0 };
  return processFileDeletionOutbox(db, env, { fenceToken, limit: ids.size, filter: row => ids.has(Number(row.id)) });
}

// Build the set of every object_key the DB still references (attachments + shares).
function referencedKeys(db) {
  const known = new Set();
  for (const r of db.prepare('SELECT object_key FROM attachments').all()) known.add(r.object_key);
  for (const r of db.prepare('SELECT object_key FROM secure_share_objects').all()) known.add(r.object_key);
  for (const r of db.prepare('SELECT object_key FROM pending_file_deletions').all()) known.add(r.object_key);
  for (const r of db.prepare('SELECT object_key FROM admin_file_deletions').all()) known.add(r.object_key);
  for (const r of db.prepare('SELECT object_key FROM file_write_intents').all()) known.add(r.object_key);
  for (const r of db.prepare('SELECT object_key FROM file_deletion_outbox').all()) known.add(r.object_key);
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
    try { const s = await lstat(full); if (s.isSymbolicLink() || !s.isDirectory() || !ATTACH_KEY_RE.test(dirName)) continue; names = await readdir(full); }
    catch (e) { if (e.code !== 'ENOENT') incomplete = true; continue; }
    const userId = dirIndex.get(dirName) || null;
    for (const name of names) {
      if (!ATTACH_KEY_RE.test(name)) continue; // skip .tmp and stray files
      objects++;
      if (!known.has(name)) {
        orphan++;
        if (orphans.length < REPORT_ITEM_CAP) {
          let size = 0; try { const entry = await lstat(join(full, name)); if (entry.isSymbolicLink() || !entry.isFile()) continue; size = entry.size || 0; } catch {}
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
    if (!ATTACHMENT_KEY_RE.test(dirName) && !SHARE_KEY_RE.test(dirName)) continue; // current Linux shares use 43-char base64url token-hash dirs
    if (objects >= SCAN_OBJECT_CAP) { incomplete = true; break; }
    const full = join(sdir, dirName);
    let names = [];
    try { const s = await lstat(full); if (s.isSymbolicLink() || !s.isDirectory()) continue; names = await readdir(full); }
    catch (e) { if (e.code !== 'ENOENT') incomplete = true; continue; }
    for (const name of names) {
      if (!SHARE_KEY_RE.test(name)) continue; // skip .tmp and stray files
      if (objects >= SCAN_OBJECT_CAP) { incomplete = true; break; }
      objects++;
      const key = `${dirName}/${name}`;
      if (!known.has(key)) {
        orphan++;
        if (orphans.length < REPORT_ITEM_CAP) {
          let size = 0; try { const entry = await lstat(join(full, name)); if (entry.isSymbolicLink() || !entry.isFile()) continue; size = entry.size || 0; } catch {}
          orphans.push({ key, size, tree: 'share', userId: null });
        }
      }
    }
  }

  const truncated = incomplete || orphan > orphans.length;
  const pending = (Number(db.prepare('SELECT COUNT(*) count FROM pending_file_deletions').get()?.count) || 0)
    + (Number(db.prepare('SELECT COUNT(*) count FROM admin_file_deletions').get()?.count) || 0);
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

// POST /api/maintenance/:id/repair — durably queue a report's orphans for deletion.
// Requires body { confirm: "REPAIR:<id>" }. The write transaction makes the
// reference/intent decision stable: live references settle, active intents defer,
// and unreferenced items settle only after their unified-outbox row is confirmed.
export async function repairMaintenance(db, env, actor, id, input) {
  if (!Number.isSafeInteger(id) || id < 1 || !input || typeof input !== 'object' || input.confirm !== `REPAIR:${id}`) return null;
  if (!db.prepare("SELECT id FROM maintenance_reports WHERE id=? AND status='ready'").get(id)) return undefined;
  let queued = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const items = db.prepare('SELECT object_key,tree,user_id,dir_hash FROM maintenance_report_items WHERE report_id=? ORDER BY object_key LIMIT 20').all(id);
    const drop = db.prepare('DELETE FROM maintenance_report_items WHERE report_id=? AND object_key=?');
    const outbox = db.prepare('SELECT id FROM file_deletion_outbox WHERE tree=? AND dir_hash=? AND object_key=?');
    for (const item of items) {
      let dirHash = item.dir_hash || '';
      if (item.tree === 'attachment' && item.user_id) {
        const expected = digest(item.user_id);
        if (dirHash && dirHash !== expected) continue;
        dirHash = expected;
      }
      const valid = item.tree === 'attachment'
        ? ATTACHMENT_KEY_RE.test(item.object_key) && ATTACHMENT_KEY_RE.test(dirHash)
        : SHARE_PATH_RE.test(item.object_key) && dirHash === '';
      if (!valid) continue;
      const live = item.tree === 'attachment'
        ? db.prepare('SELECT user_id FROM attachments WHERE object_key=?').all(item.object_key).some(row => digest(row.user_id) === dirHash)
        : Boolean(db.prepare('SELECT 1 FROM secure_share_objects WHERE object_key=? AND uploaded_at IS NOT NULL').get(item.object_key));
      if (live) {
        drop.run(id, item.object_key);
        continue;
      }
      if (db.prepare('SELECT 1 FROM file_write_intents WHERE tree=? AND dir_hash=? AND object_key=?').get(item.tree, dirHash, item.object_key)) continue;
      queued += enqueueFileDeletion(db, { tree: item.tree, objectKey: item.object_key, dirHash, reason: 'maintenance_repair' });
      if (outbox.get(item.tree, dirHash, item.object_key)) drop.run(id, item.object_key);
    }
    const remaining = Number(db.prepare('SELECT COUNT(*) count FROM maintenance_report_items WHERE report_id=?').get(id).count) || 0;
    const status = remaining === 0 ? 'repaired' : 'ready';
    db.prepare("UPDATE maintenance_reports SET status=?,repaired_at=CASE WHEN ?='repaired' THEN ? ELSE repaired_at END WHERE id=? AND status='ready'").run(status, status, Date.now(), id);
    auditLog(db, actor, 'repair_maintenance', null, { reportId: id, queued });
    db.exec('COMMIT');
    return { reportId: id, status, queued, unlinked: 0, remaining };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

// POST /api/maintenance/retry — migrate legacy queues and consume the unified outbox.
export async function retryMaintenance(db, env, actor, queueIds = null) {
  if (queueIds !== null && !Array.isArray(queueIds)) return { processed: 0, failed: 0, protected: 0, quarantined: 0, error: 'invalid_queue_ids' };
  const token = randomUUID();
  if (!acquireMaintenanceFence(db, { token })) return { processed: 0, failed: 1, protected: 0, error: 'locked' };
  try {
    const legacy = migrateLegacyDeletionQueues(db);
    const result = await processSelectedOutbox(db, { ATTACHMENTS_DIR: env.ATTACHMENTS_DIR, SHARES_DIR: sharesDir(env) }, token, queueIds);
    result.quarantined = legacy.quarantined;
    try { auditLog(db, actor, 'retry_maintenance', null, result); } catch {}
    return result;
  } finally { releaseMaintenanceFence(db, token); }
}