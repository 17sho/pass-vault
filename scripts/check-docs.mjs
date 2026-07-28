import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const guides = [
  'README.md', 'README.en.md',
  'docs/cloudflare-deployment.zh-CN.md', 'docs/cloudflare-deployment.en.md',
  'docs/server-deployment.zh-CN.md', 'docs/server-deployment.en.md',
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
  for (const required of [`v${pkg.version}`, `/releases/tag/v${pkg.version}`, `pass-vault-v2-cloudflare-${pkg.version}.tar.gz`, `pass-vault-v2-linux-${pkg.version}.tar.gz`]) {
    if (!text.includes(required)) throw new Error(`${file}: missing current release reference ${required}`);
  }
  if (text.includes('latest stable release (v1.1.59)') || text.includes('最新稳定版（v1.1.59）')) {
    throw new Error(`${file}: withdrawn v1.1.59 marked as latest stable release`);
  }
}
for (const file of ['docs/cloudflare-deployment.zh-CN.md','docs/cloudflare-deployment.en.md']) {
  const text = contents.get(file);
  for (const required of [`v${pkg.version}`,'SHA256SUMS','apps/worker/migrations/','wrangler secret put INVITE_CODE','0008_session_metadata.sql','registration_unavailable','invalid_invite']) {
    if (!text.includes(required)) throw new Error(`${file}: missing ${required}`);
  }
}
for (const file of ['docs/server-deployment.zh-CN.md','docs/server-deployment.en.md']) {
  const text = contents.get(file);
  for (const required of [`v${pkg.version}`,'SHA256SUMS','/etc/pass-vault-v2/pass-vault-v2.env','0600','systemctl restart pass-vault-v2','registration_unavailable']) {
    if (!text.includes(required)) throw new Error(`${file}: missing ${required}`);
  }
}
console.log(`Documentation checks passed (${guides.length} deployment entry points, ${markdown.length} Markdown files).`);
