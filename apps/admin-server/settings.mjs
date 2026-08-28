// Admin settings/registration/invite/security endpoints — server-build port.
// Endpoints:
//   PUT    /api/registration                 update registration toggle + closed message
//   POST   /api/invite-codes                 create an invite code (returns plaintext once)
//   DELETE /api/invite-codes/:id             delete an invite code
//   GET    /api/invite-codes/:id/reveal      reveal a code's plaintext (AES-GCM decrypt)
//   PUT    /api/security-events/review        mark a security event handled/ignored
//
// Crypto parity with CF admin-worker:
//   - code_hash  = "hmac-sha256:v1:" + base64url(HMAC_SHA256(pepper, code))   (lookup/dedupe)
//   - code_ciphertext/code_iv = AES-256-GCM(encKey-derived, code)             (admin reveal)
// Secrets come from env: INVITE_CODE_PEPPER, INVITE_CODE_ENCRYPTION_KEY.
// Both keys are derived via SHA-256(secret) to a 32-byte key, matching CF's
// inviteEncryptionKey()/HMAC import of the raw secret bytes for the pepper.
import { createHmac, createHash, randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';
import { auditLog } from './users.mjs';

const b64url = buf => Buffer.from(buf).toString('base64url');
const fromB64url = s => Buffer.from(s, 'base64url');

// Generate a human-friendly invite code (matches CF inviteCode(): 4 groups of 5 base32 chars).
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newInviteCode() {
  const pick = n => Array.from(randomBytes(n)).map(b => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
  return [pick(5), pick(5), pick(5), pick(5)].join('-');
}

function codeHash(code, pepper) {
  const mac = createHmac('sha256', Buffer.from(pepper, 'utf8')).update(code, 'utf8').digest();
  return 'hmac-sha256:v1:' + b64url(mac);
}

function encryptCode(code, encKey) {
  const key = createHash('sha256').update(encKey, 'utf8').digest(); // 32 bytes
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store ciphertext||tag (GCM), base64url — decrypt splits the trailing 16-byte tag.
  return { ciphertext: b64url(Buffer.concat([ct, tag])), iv: b64url(iv) };
}

function decryptCode(ciphertext, iv, encKey) {
  if (typeof ciphertext !== 'string' || typeof iv !== 'string' || !encKey?.trim()) return null;
  try {
    const key = createHash('sha256').update(encKey, 'utf8').digest();
    const raw = fromB64url(ciphertext);
    const ct = raw.subarray(0, raw.length - 16), tag = raw.subarray(raw.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, fromB64url(iv));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch { return null; }
}

// PUT /api/registration
export function updateRegistration(db, actor, input) {
  if (!input || typeof input !== 'object') return null;
  const x = input;
  const hasEnabled = typeof x.enabled === 'boolean';
  const rawMessage = typeof x.message === 'string' ? x.message : null;
  const hasMessage = rawMessage !== null;
  if (!hasEnabled && !hasMessage) return null;
  const message = (rawMessage?.trim()) || '';
  if (hasMessage && (!message || message.length > 200 || /[\u0000-\u001f\u007f-\u009f]/.test(message))) return null;
  const now = Date.now();
  const result = { ...(hasEnabled ? { enabled: x.enabled } : {}), ...(hasMessage ? { message } : {}) };
  db.exec('BEGIN IMMEDIATE');
  try {
    const set = db.prepare('INSERT INTO admin_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at');
    if (hasEnabled) set.run('registration_enabled', x.enabled ? '1' : '0', now);
    if (hasMessage) set.run('registration_closed_message', message, now);
    auditLog(db, actor, 'update_registration', null, result);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return result;
}

// POST /api/invite-codes — returns { id, label, maxUses, code, usedCount, createdAt }.
// Returns { error } sentinel for missing-secret / invalid-input cases.
export function createInvite(db, env, actor, input) {
  if (!env.INVITE_CODE_PEPPER?.trim() || !env.INVITE_CODE_ENCRYPTION_KEY?.trim()) return { error: 'secret_unavailable' };
  if (!input || typeof input !== 'object') return { error: 'invalid' };
  const x = input;
  const label = typeof x.label === 'string' ? x.label.trim() : '';
  const maxUses = Number(x.maxUses);
  const hasCustom = Object.prototype.hasOwnProperty.call(x, 'code');
  const customCode = typeof x.code === 'string' ? x.code.trim() : '';
  if (!label || label.length > 80 || !Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 1000000
    || (hasCustom && (!customCode || customCode.length > 256 || /[\p{Cc}\p{Cf}]/u.test(customCode)))) return { error: 'invalid' };
  const code = hasCustom ? customCode : newInviteCode();
  const hash = codeHash(code, env.INVITE_CODE_PEPPER);
  const enc = encryptCode(code, env.INVITE_CODE_ENCRYPTION_KEY);
  const id = randomUUID(), now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO invite_codes(id,code_hash,label,max_uses,used_count,created_at,created_by,code_ciphertext,code_iv) VALUES(?,?,?,?,0,?,?,?,?)')
      .run(id, hash, label, maxUses, now, actor, enc.ciphertext, enc.iv);
    auditLog(db, actor, 'create_invite_code', null, { id, label, maxUses });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    if (String(e).includes('UNIQUE')) return { error: 'duplicate' };
    throw e;
  }
  return { value: { id, label, maxUses, code, usedCount: 0, createdAt: now } };
}

// DELETE /api/invite-codes/:id
export function deleteInvite(db, actor, id) {
  if (!/^[0-9a-f-]{36}$|^legacy-[0-9a-f]{32}$/.test(id)) return undefined;
  const row = db.prepare('SELECT label,max_uses,used_count FROM invite_codes WHERE id=?').get(id);
  if (!row) return null;
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = db.prepare('DELETE FROM invite_codes WHERE id=?').run(id);
    if (Number(r.changes) !== 1) { db.exec('ROLLBACK'); return null; }
    auditLog(db, actor, 'delete_invite_code', null, { id, label: row.label, maxUses: Number(row.max_uses), usedCount: Number(row.used_count) });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { deleted: true };
}

// GET /api/invite-codes/:id/reveal — decrypt the stored plaintext.
export function revealInvite(db, env, actor, id) {
  if (!/^[0-9a-f-]{36}$|^legacy-[0-9a-f]{32}$/.test(id)) return undefined;
  const row = db.prepare('SELECT code_ciphertext,code_iv FROM invite_codes WHERE id=?').get(id);
  if (!row) return null;
  const code = decryptCode(row.code_ciphertext, row.code_iv, env.INVITE_CODE_ENCRYPTION_KEY);
  if (code === null) return { error: 'undecryptable' };
  auditLog(db, actor, 'reveal_invite_code', null, { id });
  return { value: { id, code } };
}

// PUT /api/security-events/review
export function reviewSecurityEvent(db, actor, input) {
  if (!input || typeof input !== 'object') return null;
  const x = input;
  const category = String(x.category || ''), code = String(x.code || ''), status = String(x.status || '');
  const note = typeof x.note === 'string' ? x.note.trim() : '';
  if (!['authentication', 'registration'].includes(category) || !/^[a-z0-9_]{1,80}$/.test(code)
    || !['handled', 'ignored'].includes(status) || note.length > 500 || /[\u0000-\u001f\u007f-\u009f]/.test(note)) return null;
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO security_event_reviews(category,code,status,note,actor_email,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(category,code) DO UPDATE SET status=excluded.status,note=excluded.note,actor_email=excluded.actor_email,updated_at=excluded.updated_at')
      .run(category, code, status, note, actor, now);
    auditLog(db, actor, 'review_security_event', null, { category, code, status, note });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { category, code, status, note, updatedAt: now };
}
