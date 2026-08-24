import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const versionedAssets = new Map([
  ['public/index.html', ['/theme-init.js', '/style.css', '/app-shell.css', '/app.mjs']],
  ['public/app.mjs', ['/quick-unlock-device.mjs', '/passkey-assisted-device.mjs', '/history-diff.mjs', '/pinned-order.mjs', '/dialog-ui.mjs', '/password-generator.mjs']],
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
const guideCandidates = [
  'README.md', 'README.en.md',
  'docs/cloudflare-deployment.zh-CN.md', 'docs/cloudflare-deployment.en.md',
  'docs/server-deployment.zh-CN.md', 'docs/server-deployment.en.md',
  'docs/deployment.zh-CN.md', 'docs/deployment.en.md', 'docs/DEPLOYMENT.md',
];
const guides = [];
for (const file of guideCandidates) {
  try {
    await access(resolve(root, file));
    guides.push(file);
  } catch {
    // Platform-specific release archives intentionally omit the other backend's guide.
  }
}
const deploymentGuides = guides.filter(file => !['README.md', 'README.en.md'].includes(file));
const markdown = [...guides, 'docs/FEATURES.zh-CN.md', 'docs/FEATURES.en.md', 'CHANGELOG.md', 'docs/RELEASE.md', `release-notes-v${pkg.version}.md`];
const contents = new Map();
for (const file of markdown) {
  const text = await readFile(resolve(root, file), 'utf8');
  contents.set(file, text);
  if (deploymentGuides.includes(file) && !text.includes('INVITE_CODE')) throw new Error(`${file}: missing INVITE_CODE requirement`);
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
  for (const required of [`v${pkg.version}`, `/releases/tag/v${pkg.version}`, `pass-vault-v2-cloudflare-${pkg.version}.tar.gz`, 'SHA256SUMS']) {
    if (!text.includes(required)) throw new Error(`${file}: missing current release reference ${required}`);
  }
  if (text.includes('latest stable release (v1.1.59)') || text.includes('最新稳定版（v1.1.59）')) {
    throw new Error(`${file}: withdrawn v1.1.59 marked as latest stable release`);
  }
}
for (const [file, required] of [
  ['README.md', ['服务器辅助 Passkey 会改变默认零知识边界', '默认模式下，主密码与资料明文不上传', '项目尚未经过独立第三方安全审计']],
  ['README.en.md', ['Server-assisted Passkey changes the default zero-knowledge boundary', 'In the default mode, master passwords and record plaintext are not uploaded', 'has not undergone an independent third-party security audit']],
]) {
  const text = contents.get(file);
  for (const disclosure of required) {
    if (!text.includes(disclosure)) throw new Error(`${file}: missing server-assisted Passkey trust-boundary disclosure`);
  }
}
for (const [file, trustBoundary] of [
  ['docs/cloudflare-deployment.zh-CN.md', ['独立KEK加密包装', '改变默认零知识边界', '可以恢复vault key', '不保存明文vault key']],
  ['docs/cloudflare-deployment.en.md', ['wrapped under an independent KEK', 'changes the default zero-knowledge boundary', 'can recover the vault key', 'nor a plaintext vault key']],
]) {
  const text = contents.get(file);
  if (!text) continue;
  for (const required of [`v${pkg.version}`,'SHA256SUMS','apps/worker/migrations/','wrangler secret put INVITE_CODE','0008_session_metadata.sql','0009_passkey_assisted_unlock.sql','PASSKEY_UNLOCK_KEK','PASSKEY_RP_ID','PASSKEY_ORIGIN',...trustBoundary,'registration_unavailable','invalid_invite']) {
    if (!text.includes(required)) throw new Error(`${file}: missing ${required}`);
  }
}

for (const phrase of [
  '0011_r2_cleanup_queue.sql', '0012_backup_import_locks.sql',
  '0013_r2_inflight_uploads.sql', '0014_entries_revision.sql',
  '0015_attachments_revision.sql', '0016_revision_tombstones.sql',
  '0027_reset_user_quota_audit.sql', '0028_admin_quota_history_index.sql',
  '0029_f3_r2_consistency.sql', '0034_admin_control_center.sql',
  '17 * * * *', 'workers_dev',
  '--keep-vars', 'run_worker_first', 'migrations_dir', '100%',
  'passkey_unlock_unavailable',
]) {
  for (const file of ['docs/cloudflare-deployment.zh-CN.md', 'docs/cloudflare-deployment.en.md']) {
    if (contents.has(file) && !contents.get(file).includes(phrase)) throw new Error(`${file}: missing deployment regression guard ${phrase}`);
  }
}

for (const [file, phrase] of [
  ['docs/deployment.zh-CN.md','当前`main`全部迁移至`0034`'],
  ['docs/deployment.en.md','current `main` chain through `0034`'],
  ['docs/DEPLOYMENT.md','完整链至`0034_admin_control_center.sql`'],
  [`release-notes-v${pkg.version}.md`,'`0034_admin_control_center.sql`'],
  ['CHANGELOG.md','`0021`–`0028`'],
  ['docs/RELEASE.md','combined deployment navigation pages remain in both archives'],
]) {
  if (!contents.get(file)?.includes(phrase)) throw new Error(`${file}: stale Cloudflare migration-chain entry point`);
}

for (const phrase of ['CLIENT_IP_HEADER', 'INVITE_CODE', 'PASSKEY_UNLOCK_KEK']) {
  for (const file of ['docs/server-deployment.zh-CN.md', 'docs/server-deployment.en.md']) {
    if (contents.has(file) && !contents.get(file).includes(phrase)) throw new Error(`${file}: missing environment guard ${phrase}`);
  }
}

const forbiddenLinuxArtifactClaims = [
  /releases\/download\/v1\.1\.(?:65|66)\/pass-vault-v2-linux-/,
  /stable (?:Linux )?artifact remains[^\n]*v1\.1\.65/i,
  /Linux\s*稳定制品仍为[^\n]*v1\.1\.65/i,
];
for (const file of guides) {
  for (const pattern of forbiddenLinuxArtifactClaims) {
    if (pattern.test(contents.get(file))) throw new Error(`${file}: advertises a Linux Release artifact that does not exist`);
  }
}

console.log(`Documentation checks passed (${guides.length} deployment entry points, ${markdown.length} Markdown files).`);
