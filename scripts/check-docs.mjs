import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const guides = [
  'README.md', 'README.en.md',
  'docs/cloudflare-deployment.zh-CN.md', 'docs/cloudflare-deployment.en.md',
  'docs/server-deployment.zh-CN.md', 'docs/server-deployment.en.md',
  'docs/deployment.zh-CN.md', 'docs/deployment.en.md', 'docs/DEPLOYMENT.md',
];
const markdown = [...guides, 'release-notes-v1.1.13.md'];
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
for (const file of ['docs/cloudflare-deployment.zh-CN.md','docs/cloudflare-deployment.en.md']) {
  const text = contents.get(file);
  for (const required of ['wrangler secret put INVITE_CODE','0005_invite_attempts.sql','registration_unavailable','invalid_invite']) {
    if (!text.includes(required)) throw new Error(`${file}: missing ${required}`);
  }
}
for (const file of ['docs/server-deployment.zh-CN.md','docs/server-deployment.en.md']) {
  const text = contents.get(file);
  for (const required of ['/etc/pass-vault-v2/pass-vault-v2.env','0600','systemctl restart pass-vault-v2','registration_unavailable']) {
    if (!text.includes(required)) throw new Error(`${file}: missing ${required}`);
  }
}
console.log(`Documentation checks passed (${guides.length} deployment entry points, ${markdown.length} Markdown files).`);
