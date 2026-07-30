import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const versionedAssets = new Map([
  ['public/index.html', ['/theme-init.js', '/style.css', '/app-shell.css', '/app.mjs']],
  ['public/app.mjs', ['/quick-unlock-device.mjs', '/passkey-assisted-device.mjs']],
]);
for (const [file, assets] of versionedAssets) {
  const text = await readFile(resolve(root, file), 'utf8');
  for (const asset of assets) {
    const expected = `${asset}?v=${pkg.version}`;
    if (!text.includes(expected)) throw new Error(`${file}: missing current asset reference ${expected}`);
    const occurrences = text.split(`${asset}?v=`).length - 1;
    if (occurrences !== 1) throw new Error(`${file}: expected exactly one versioned reference for ${asset}`);
  }
}
const guides = [
  'README.md', 'README.en.md',
  'docs/cloudflare-deployment.zh-CN.md', 'docs/cloudflare-deployment.en.md',
  'docs/deployment.zh-CN.md', 'docs/deployment.en.md', 'docs/DEPLOYMENT.md',
];
const markdown = [...guides, `release-notes-v${pkg.version}.md`];
const contents = new Map();
for (const file of markdown) {
  const text = await readFile(resolve(root, file), 'utf8');
  contents.set(file, text);
  if (guides.includes(file) && !text.includes('INVITE_CODE')) throw new Error(`${file}: missing INVITE_CODE requirement`);
  // Documentation may show placeholders and generation commands, but never a literal usable assignment.
  if (/INVITE_CODE\s*=\s*["']?[A-Za-z0-9_-]{16,256}["']?(?:\s|$)/m.test(text)) {
    throw new Error(`${file}: possible literal invitation value`);
  }
}
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
for (const [file, text] of contents) {
  for (const match of text.matchAll(linkPattern)) {
    const href = match[1].split('#')[0];
    if (!href || /^(?:https?:|mailto:)/.test(href)) continue;
    const target = resolve(root, dirname(file), decodeURIComponent(href));
    try { await access(target); } catch { throw new Error(`${file}: broken internal link ${href}`); }
  }
}
for (const file of ['README.md', 'README.en.md']) {
  const text = contents.get(file);
  for (const required of [`v${pkg.version}`, `/releases/tag/v${pkg.version}`, `pass-vault-v2-cloudflare-${pkg.version}.tar.gz`, '/releases/tag/v1.1.65']) {
    if (!text.includes(required)) throw new Error(`${file}: missing current release reference ${required}`);
  }
  if (text.includes(`pass-vault-v2-linux-${pkg.version}.tar.gz`) || text.includes(`pass-vault-v2-linux-${pkg.version}.zip`)) {
    throw new Error(`${file}: Linux ${pkg.version} artifact must not be advertised by this Cloudflare-only release`);
  }
  if (text.includes('latest stable release (v1.1.59)') || text.includes('最新稳定版（v1.1.59）')) {
    throw new Error(`${file}: withdrawn v1.1.59 marked as latest stable release`);
  }
}
for (const [file, required] of [
  ['README.md', ['服务器辅助 Passkey 会改变默认零知识边界', '服务器或前端失陷时可能导致已存密文被解密', '服务器 KEK 包装的 vault key', '主密码仍不上传', '匿名 Passkey 认证成功后恢复 vault key、创建新会话']],
  ['README.en.md', ['Server-assisted Passkey therefore changes the default zero-knowledge boundary', 'a compromised server or frontend may be able to decrypt stored ciphertext', 'vault key wrapped by a server KEK', 'master password is still never uploaded', 'anonymous Passkey authentication succeeds']],
]) {
  const text = contents.get(file);
  for (const disclosure of required) {
    if (!text.includes(disclosure)) throw new Error(`${file}: missing server-assisted Passkey trust-boundary disclosure`);
  }
}
for (const [file, trustBoundary] of [
  ['docs/cloudflare-deployment.zh-CN.md', ['独立 KEK 的 AES-256-GCM 密文', '改变原纯客户端零知识边界', '可以恢复 vault key', '不保存主密码或明文 vault key']],
  ['docs/cloudflare-deployment.en.md', ['AES-256-GCM ciphertext under an independent KEK', 'changes the original client-only zero-knowledge boundary', 'can recover the vault key', 'stores neither the master password nor a plaintext vault key']],
]) {
  const text = contents.get(file);
  for (const required of [`v${pkg.version}`,'SHA256SUMS','apps/worker/migrations/','wrangler secret put INVITE_CODE','0008_session_metadata.sql','0009_passkey_assisted_unlock.sql','PASSKEY_UNLOCK_KEK','PASSKEY_RP_ID','PASSKEY_ORIGIN',...trustBoundary,'registration_unavailable','invalid_invite']) {
    if (!text.includes(required)) throw new Error(`${file}: missing ${required}`);
  }
}
console.log(`Documentation checks passed (${guides.length} deployment entry points, ${markdown.length} Markdown files).`);
