import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const docs=await readFile(new URL('../docs/cloudflare-deployment.zh-CN.md',import.meta.url),'utf8');
const docsEn=await readFile(new URL('../docs/cloudflare-deployment.en.md',import.meta.url),'utf8');

test('Cloudflare会话下发20MiB附件与完整备份能力并由前端执行',()=>{
 assert.match(app,/function applyCapabilities\(/);
 assert.match(app,/maxAttachmentBytes/);
 assert.match(app,/Math\.min\(limits\[kind\],serviceCapabilities\.maxAttachmentBytes\)/);
 assert.match(app,/完整备份所含附件总计不能超过/);
 assert.match(html,/id="attachment-limit-hint"/);
 assert.match(html,/id="backup-limit-hint"/);
 assert.match(docs,/Cloudflare[^\n]*20 MiB/);
 assert.match(docsEn,/Cloudflare[^\n]*20 MiB/);
});
