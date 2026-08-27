import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { startTestServer } from './fixtures.mjs';

// 服务器版 secure shares 与 Cloudflare Worker 语义对齐的集成测试。
// 服务器把分享信封当作不透明密文；测试只需构造形状合法的信封，无需真实端到端加密。

const kdf = { salt: 'c2FsdHNhbHRzYWx0c2FsdA==', iterations: 310000, hash: 'SHA-256' };
const wrappedKey = { iv: 'dGVzdGl2MTIzNDU2', ciphertext: 'ZW5jcnlwdGVk' };
const inviteCode = 'test-invite-code-1234567890';

const b64url = buf => Buffer.from(buf).toString('base64url');
const b64 = buf => Buffer.from(buf).toString('base64');
const shareToken = () => randomBytes(32).toString('base64url'); // 43 chars
const shareDigest = value => createHash('sha256').update(value).digest('base64url');
function envelope(version, bytes = 48) { return { version, iv: b64url(randomBytes(12)), ciphertext: b64url(randomBytes(Math.max(17, bytes))) }; }
function ownerNote() { return { version: 1, iv: b64(randomBytes(12)), ciphertext: b64(randomBytes(64)) }; }

let origin = '', server;
async function start(db, extraEnv = {}) {
  server = await startTestServer({ dbPath: db, env: { ATTACHMENTS_DIR: join(db, '..', 'attachments'), SHARES_DIR: join(db, '..', 'shares'), CLIENT_IP_HEADER: '', ...extraEnv } });
  origin = server.base;
}
async function stop() { if (!server) return; await server.stop(); server = null; origin = ''; }
async function api(path, { method = 'GET', body, cookie, csrf, raw, contentType, headers: extra = {}, requestOrigin = origin } = {}) {
  const headers = { origin: requestOrigin, ...extra };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (contentType) headers['content-type'] = contentType;
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-csrf-token'] = csrf;
  const payload = raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body));
  return fetch(origin + path, { method, headers, body: payload });
}
function sessionCookie(r) { return r.headers.get('set-cookie').split(';', 1)[0]; }
async function loginUser(username = 'alice') {
  await api('/api/register', { method: 'POST', body: { username, password: 'correct horse battery', inviteCode, kdf, wrappedKey } });
  const r = await api('/api/login', { method: 'POST', body: { username, password: 'correct horse battery' } });
  const login = await r.json();
  return { cookie: sessionCookie(r), csrf: login.csrf };
}

test('分享路由需要鉴权：未登录创建/列表/撤销一律 401', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-auth-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    assert.equal((await api('/api/shares', { method: 'POST', body: { token: shareToken(), envelope: envelope(1), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 1 } })).status, 401);
    assert.equal((await api('/api/shares', { method: 'GET' })).status, 401);
    assert.equal((await api('/api/shares/' + shareToken(), { method: 'DELETE' })).status, 401);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('v1 分享：创建后可匿名 consume，阅读次数用尽返回 404，且带安全头', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-v1-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    const { cookie, csrf } = await loginUser();
    const token = shareToken();
    const create = await api('/api/shares', { method: 'POST', cookie, csrf, body: { token, envelope: envelope(1), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 1 } });
    assert.equal(create.status, 201);
    assert.deepEqual(Object.keys(await create.json()).sort(), ['createdAt', 'token']);
    // consume 无需登录（credentials omit），origin 校验通过
    const consume = await api('/api/shares/consume', { method: 'POST', body: { token } });
    assert.equal(consume.status, 200);
    assert.equal(consume.headers.get('x-content-type-options'), 'nosniff');
    const payload = await consume.json();
    assert.equal(payload.envelope.version, 1);
    assert.match(payload.envelope.iv, /^[A-Za-z0-9_-]+$/);
    // 第二次 consume 超过 maxViews=1，404
    assert.equal((await api('/api/shares/consume', { method: 'POST', body: { token } })).status, 404);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('v1 分享 consume 校验：坏 token/跨 origin/未知 token 分别 400/403/404', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-consume-guard-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    assert.equal((await api('/api/shares/consume', { method: 'POST', body: { token: 'short' } })).status, 400);
    assert.equal((await api('/api/shares/consume', { method: 'POST', body: { token: shareToken() }, requestOrigin: 'https://evil.example' })).status, 403);
    assert.equal((await api('/api/shares/consume', { method: 'POST', body: { token: shareToken() } })).status, 404);
    assert.equal((await api('/api/shares/consume', { method: 'POST', body: { token: shareToken(), extra: 1 } })).status, 400);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('v1 分享过期与撤销：过期 consume 404，撤销后 consume 404 且 DELETE 幂等', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-expire-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    const { cookie, csrf } = await loginUser();
    const expired = shareToken(), live = shareToken();
    await api('/api/shares', { method: 'POST', cookie, csrf, body: { token: expired, envelope: envelope(1), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 10 } });
    await api('/api/shares', { method: 'POST', cookie, csrf, body: { token: live, envelope: envelope(1), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 10 } });
    const sql = new DatabaseSync(db);
    sql.prepare('UPDATE secure_shares SET expires_at=? WHERE token_hash=?').run(Date.now() - 1, shareDigest(expired));
    sql.close();
    assert.equal((await api('/api/shares/consume', { method: 'POST', body: { token: expired } })).status, 404);
    // 撤销 live
    const del = await api('/api/shares/' + shareDigest(live), { method: 'DELETE', cookie, csrf });
    assert.equal(del.status, 204);
    assert.equal((await api('/api/shares/consume', { method: 'POST', body: { token: live } })).status, 404);
    // 再次撤销同一 token_hash：已无未撤销行，落到 packages 未命中 → 404
    assert.equal((await api('/api/shares/' + shareDigest(live), { method: 'DELETE', cookie, csrf })).status, 404);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('分享配额：活跃分享达到 20 上限后创建返回 409', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-quota-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    const { cookie, csrf } = await loginUser();
    for (let i = 0; i < 20; i++) {
      const r = await api('/api/shares', { method: 'POST', cookie, csrf, body: { token: shareToken(), envelope: envelope(1), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 3 } });
      assert.equal(r.status, 201);
    }
    const over = await api('/api/shares', { method: 'POST', cookie, csrf, body: { token: shareToken(), envelope: envelope(1), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 3 } });
    assert.equal(over.status, 409);
    assert.deepEqual(await over.json(), { error: 'share_limit' });
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('分享创建校验：非法信封/过短/过长有效期/非法 maxViews 返回 400', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-validate-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    const { cookie, csrf } = await loginUser();
    const good = { token: shareToken(), envelope: envelope(1), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 3 };
    assert.equal((await api('/api/shares', { method: 'POST', cookie, csrf, body: { ...good, envelope: { version: 2, iv: good.envelope.iv, ciphertext: good.envelope.ciphertext } } })).status, 400);
    assert.equal((await api('/api/shares', { method: 'POST', cookie, csrf, body: { ...good, maxViews: 5 } })).status, 400);
    assert.equal((await api('/api/shares', { method: 'POST', cookie, csrf, body: { ...good, expiresAt: Date.now() - 1 } })).status, 400);
    assert.equal((await api('/api/shares', { method: 'POST', cookie, csrf, body: { ...good, expiresAt: Date.now() + 30 * 24 * 3600e3 } })).status, 400);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('v2 分享全流程：创建→上传附件→commit→claim 返回 manifest 并下发 cookie→凭 cookie 下载对象', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-v2-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    const { cookie, csrf } = await loginUser();
    const token = shareToken(), objId = shareToken(), objBytes = randomBytes(1024);
    const create = await api('/api/shares/v2', { method: 'POST', cookie, csrf, body: { token, manifest: envelope(2), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 3, firstOpen: false, singleBrowser: false, objects: [{ id: objId, size: objBytes.length }] } });
    assert.equal(create.status, 201);
    const created = await create.json();
    assert.match(created.uploadToken, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(created.objects, [{ id: objId }]);
    // 未 commit 前 claim 不可用（status=pending）
    assert.equal((await api('/api/shares/claim', { method: 'POST', body: { token } })).status, 404);
    // 上传对象
    const up = await api(`/api/shares/v2/${shareDigest(token)}/objects/${objId}`, { method: 'PUT', cookie, csrf, raw: objBytes, contentType: 'application/octet-stream', headers: { 'x-share-upload-token': created.uploadToken, 'content-length': String(objBytes.length) } });
    assert.equal(up.status, 204);
    // commit
    const commit = await api(`/api/shares/v2/${shareDigest(token)}/commit`, { method: 'POST', cookie, csrf, body: { uploadToken: created.uploadToken } });
    assert.equal(commit.status, 200);
    // claim（匿名访客）
    const claim = await api('/api/shares/claim', { method: 'POST', body: { token } });
    assert.equal(claim.status, 200);
    const claimed = await claim.json();
    assert.equal(claimed.envelope.version, 2);
    const shareCookie = claim.headers.get('set-cookie').split(';', 1)[0];
    // 凭 share cookie 下载对象，字节与上传一致
    const obj = await api(`/api/shares/objects/${objId}`, { method: 'GET', cookie: shareCookie });
    assert.equal(obj.status, 200);
    assert.equal(obj.headers.get('content-type'), 'application/octet-stream');
    const downloaded = Buffer.from(await obj.arrayBuffer());
    assert.deepEqual(downloaded, objBytes);
    // 无 cookie 下载 404
    assert.equal((await api(`/api/shares/objects/${objId}`, { method: 'GET' })).status, 404);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('v2 分享 commit 前对象缺失返回 share_incomplete；上传大小不符 404', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-v2-incomplete-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    const { cookie, csrf } = await loginUser();
    const token = shareToken(), objId = shareToken();
    const create = await api('/api/shares/v2', { method: 'POST', cookie, csrf, body: { token, manifest: envelope(2), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 1, firstOpen: false, singleBrowser: false, objects: [{ id: objId, size: 512 }] } });
    const created = await create.json();
    // 未上传即 commit → 409
    assert.equal((await api(`/api/shares/v2/${shareDigest(token)}/commit`, { method: 'POST', cookie, csrf, body: { uploadToken: created.uploadToken } })).status, 409);
    // 上传声明大小与登记不符 → 404
    const wrong = randomBytes(256);
    assert.equal((await api(`/api/shares/v2/${shareDigest(token)}/objects/${objId}`, { method: 'PUT', cookie, csrf, raw: wrong, contentType: 'application/octet-stream', headers: { 'x-share-upload-token': created.uploadToken, 'content-length': String(wrong.length) } })).status, 404);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('v2 首开阅后即焚 firstOpen：第二次 claim 不发新会话返回 404', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-firstopen-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    const { cookie, csrf } = await loginUser();
    const token = shareToken();
    const create = await api('/api/shares/v2', { method: 'POST', cookie, csrf, body: { token, manifest: envelope(2), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 3, firstOpen: true, singleBrowser: false, objects: [] } });
    const created = await create.json();
    await api(`/api/shares/v2/${shareDigest(token)}/commit`, { method: 'POST', cookie, csrf, body: { uploadToken: created.uploadToken } });
    const first = await api('/api/shares/claim', { method: 'POST', body: { token } });
    assert.equal(first.status, 200);
    // 新浏览器（无 cookie）第二次 claim：firstOpen 已消费 → 404
    assert.equal((await api('/api/shares/claim', { method: 'POST', body: { token } })).status, 404);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('v2 单浏览器 singleBrowser：已有会话时其它浏览器 claim 404，原会话 cookie 复用成功', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-singlebrowser-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    const { cookie, csrf } = await loginUser();
    const token = shareToken();
    const create = await api('/api/shares/v2', { method: 'POST', cookie, csrf, body: { token, manifest: envelope(2), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 10, firstOpen: false, singleBrowser: true, objects: [] } });
    const created = await create.json();
    await api(`/api/shares/v2/${shareDigest(token)}/commit`, { method: 'POST', cookie, csrf, body: { uploadToken: created.uploadToken } });
    const first = await api('/api/shares/claim', { method: 'POST', body: { token } });
    assert.equal(first.status, 200);
    const shareCookie = first.headers.get('set-cookie').split(';', 1)[0];
    // 原浏览器复用 cookie 再次 claim → 200
    assert.equal((await api('/api/shares/claim', { method: 'POST', body: { token }, cookie: shareCookie })).status, 200);
    // 其它浏览器（无 cookie）→ 404
    assert.equal((await api('/api/shares/claim', { method: 'POST', body: { token } })).status, 404);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('分享列表：GET /api/shares 同时返回 v1(protocol 1) 与 v2(protocol 2) 记录且不含密文', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-list-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    const { cookie, csrf } = await loginUser();
    const v1 = shareToken(), v2 = shareToken();
    await api('/api/shares', { method: 'POST', cookie, csrf, body: { token: v1, envelope: envelope(1), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 1 } });
    await api('/api/shares/v2', { method: 'POST', cookie, csrf, body: { token: v2, manifest: envelope(2), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 3, firstOpen: true, singleBrowser: false, objects: [] } });
    const list = await api('/api/shares', { method: 'GET', cookie, csrf });
    assert.equal(list.status, 200);
    const { shares } = await list.json();
    assert.equal(shares.length, 2);
    const protocols = shares.map(s => s.protocol).sort();
    assert.deepEqual(protocols, [1, 2]);
    const serialized = JSON.stringify(shares);
    assert.equal(serialized.includes('ciphertext'), true); // ownerNote 密文存在（受控字段）
    // 不泄露 manifest/envelope 密文正文键
    for (const s of shares) assert.equal('envelope' in s || 'manifest' in s, false);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});

test('过期清理：过期 v2 分享启动时删除数据库行与本地对象文件', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pv2-share-cleanup-')), db = join(dir, 'vault.sqlite');
  try {
    await start(db);
    const { cookie, csrf } = await loginUser();
    const token = shareToken(), objId = shareToken(), objBytes = randomBytes(512);
    const create = await api('/api/shares/v2', { method: 'POST', cookie, csrf, body: { token, manifest: envelope(2), ownerNote: ownerNote(), expiresAt: Date.now() + 3600e3, maxViews: 3, firstOpen: false, singleBrowser: false, objects: [{ id: objId, size: objBytes.length }] } });
    const created = await create.json();
    await api(`/api/shares/v2/${shareDigest(token)}/objects/${objId}`, { method: 'PUT', cookie, csrf, raw: objBytes, contentType: 'application/octet-stream', headers: { 'x-share-upload-token': created.uploadToken, 'content-length': String(objBytes.length) } });
    await api(`/api/shares/v2/${shareDigest(token)}/commit`, { method: 'POST', cookie, csrf, body: { uploadToken: created.uploadToken } });
    await stop();
    // 直接把过期时间推到很久以前（超出撤销宽限），重启触发清理
    const sql = new DatabaseSync(db);
    sql.prepare('UPDATE secure_share_packages SET expires_at=? WHERE token_hash=?').run(Date.now() - 10 * 24 * 3600e3, shareDigest(token));
    sql.close();
    const sharesDir = join(dir, 'shares');
    const beforeFiles = (await readdir(sharesDir).catch(() => [])).length;
    assert.ok(beforeFiles >= 1);
    await start(db);
    const sql2 = new DatabaseSync(db);
    assert.equal(sql2.prepare('SELECT COUNT(*) c FROM secure_share_packages WHERE token_hash=?').get(shareDigest(token)).c, 0);
    assert.equal(sql2.prepare('SELECT COUNT(*) c FROM secure_share_objects WHERE share_token_hash=?').get(shareDigest(token)).c, 0);
    sql2.close();
    // 本地对象目录应被清空/移除
    const remaining = await readdir(join(sharesDir, shareDigest(token))).catch(() => null);
    assert.equal(remaining === null || remaining.length === 0, true);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});
