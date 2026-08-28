// Pass Vault — Admin console refresh helpers (Linux/SQLite build).
// Ports CF admin-worker's refreshR2Stats() + refreshNotifications() to local disk/DB.
//   - R2 object stats  -> local attachment count/bytes (cached into admin_settings).
//   - notification center -> aggregates recent security_events into admin_notifications.
// Both are POST-only, same-origin-guarded actions invoked from the console UI.
import { auditLog } from './users.mjs';

// Recompute "disk" (R2-equivalent) stats. CF walks R2 objects; locally we sum the
// attachments table (authoritative for stored ciphertext) and cache the result so
// overview() can serve it without a live scan. Mirrors CF's r2_stats_* settings via
// the disk_stats_* keys overview.mjs already reads.
export function refreshDiskStats(db, env, actor) {
  const started = Date.now();
  const row = db.prepare('SELECT COUNT(*) objects, COALESCE(SUM(ciphertext_size),0) bytes FROM attachments').get();
  const objects = Number(row.objects) || 0;
  const bytes = Number(row.bytes) || 0;
  const updatedAt = Date.now();
  const put = db.prepare('INSERT INTO admin_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at');
  db.exec('BEGIN IMMEDIATE');
  try {
    put.run('disk_stats_objects', String(objects), updatedAt);
    put.run('disk_stats_bytes', String(bytes), updatedAt);
    put.run('disk_stats_updated_at', String(updatedAt), updatedAt);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { objects, bytes, updatedAt, ms: Math.max(1, Date.now() - started) };
}

// Recompute the notification center. Ports CF: aggregate the last hour of
// security_events, and for any (category,code) with >=10 hits synthesise a
// deduplicated admin_notification (bucketed per hour). Severity escalates at >=50.
export function refreshNotifications(db, actor) {
  const now = Date.now();
  const rows = db.prepare(
    'SELECT category,code,SUM(count) count FROM security_events WHERE last_seen_at>=? GROUP BY category,code HAVING SUM(count)>=10'
  ).all(now - 3600000);
  const created = [];
  const bucket = Math.floor(now / 3600000);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of rows) {
      const count = Number(row.count) || 0;
      const severity = count >= 50 ? 'critical' : 'warning';
      const kind = 'security';
      const title = `${row.code} 近一小时 ${count} 次`;
      const key = `${row.category}:${row.code}:${bucket}`;
      const inserted = db.prepare(
        'INSERT INTO admin_notifications(dedupe_key,kind,severity,title,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id'
      ).get(key, kind, severity, title, count, now, now);
      if (inserted) {
        created.push({ id: Number(inserted.id), kind, severity, title, count });
      } else {
        db.prepare('UPDATE admin_notifications SET count=MAX(count,?),last_seen_at=? WHERE dedupe_key=?').run(count, now, key);
      }
    }
    auditLog(db, actor, 'refresh_notifications', null, { generated: created.length });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { generated: created.length, notifications: created };
}
