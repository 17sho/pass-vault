import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Admin Worker 将页面、样式和浏览器脚本拆为独立源码模块', async () => {
  const index = await source('../apps/admin-worker/src/index.ts');
  const [page, style, script] = await Promise.all([
    source('../apps/admin-worker/src/ui/page.ts'),
    source('../apps/admin-worker/src/ui/style.ts'),
    source('../apps/admin-worker/src/ui/script.ts'),
  ]);

  assert.match(index, /from ['"]\.\/ui\/page\.ts['"]/);
  assert.match(index, /from ['"]\.\/ui\/script\.ts['"]/);
  assert.doesNotMatch(index, /const page=\(\)=>`<!doctype html>/);
  assert.doesNotMatch(index, /const script=`/);
  assert.match(page, /<!doctype html>/);
  assert.match(page, /ADMIN_STYLE/);
  assert.match(style, /export const ADMIN_STYLE/);
  assert.match(script, /export const ADMIN_SCRIPT/);
});

test('Admin Worker 入口不再保留确认无调用的旧定义', async () => {
  const index = await source('../apps/admin-worker/src/index.ts');
  const script = await source('../apps/admin-worker/src/ui/script.ts');
  assert.doesNotMatch(index, /const escapeHtml=/);
  assert.doesNotMatch(script, /controlCenterLabels/);
});

test('Admin Worker 将运行时契约和 Access 鉴权拆为独立后端模块', async () => {
  const index = await source('../apps/admin-worker/src/index.ts');
  const [runtime, auth] = await Promise.all([
    source('../apps/admin-worker/src/runtime.ts'),
    source('../apps/admin-worker/src/access-auth.ts'),
  ]);

  assert.match(index, /from ['"]\.\/runtime\.ts['"]/);
  assert.match(index, /from ['"]\.\/access-auth\.ts['"]/);
  assert.doesNotMatch(index, /async function accessIdentity/);
  assert.match(runtime, /export type Env=/);
  assert.match(auth, /export async function accessIdentity/);
  assert.match(auth, /RS256/);
});
