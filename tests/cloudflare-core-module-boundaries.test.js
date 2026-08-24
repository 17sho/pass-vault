import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { businessHistoryChanges, historyValue } from '../public/history-diff.mjs';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('核心 Worker 将运行时契约与 HTTP 响应边界拆为独立模块', async () => {
  const index = await source('../apps/worker/src/index.ts');
  const [runtime, http] = await Promise.all([
    source('../apps/worker/src/runtime.ts'),
    source('../apps/worker/src/http.ts'),
  ]);
  assert.match(index, /from ['"]\.\/runtime\.ts['"]/);
  assert.match(index, /from ['"]\.\/http\.ts['"]/);
  assert.doesNotMatch(index, /interface Env\s*\{/);
  assert.doesNotMatch(index, /const SECURITY_HEADERS\s*=/);
  assert.match(runtime, /export interface Env/);
  assert.match(http, /export const json/);
  assert.match(http, /export async function asset/);
});

test('主前端将纯历史差异计算拆为独立模块', async () => {
  const app = await source('../public/app.mjs');
  const history = await source('../public/history-diff.mjs');
  assert.match(app, /from ['"]\/history-diff\.mjs\?v=2\.2\.2['"]/);
  assert.doesNotMatch(app, /function businessHistoryChanges\s*\(/);
  assert.match(history, /export function businessHistoryChanges/);
});

test('历史差异纯模块保持隐藏操作字段、秘密遮挡元数据和展示格式', () => {
  const changes = businessHistoryChanges(
    { id:'old', type:'account', revision:1, pinned:true, title:'旧标题', tags:['旧'], credentials:[{username:'alice',password:'old-secret'}], fields:[{id:'a',label:'恢复码',type:'secret',value:'old-code'}] },
    { id:'new', type:'account', revision:2, pinned:false, title:'新标题', tags:['新'], credentials:[{username:'alice',password:'new-secret'}], fields:[{id:'a',label:'恢复码',type:'secret',value:'new-code'}] },
  );
  assert.equal(changes.some(change => ['id','type','revision','pinned'].includes(change.path)), false);
  assert.deepEqual(changes.find(change => change.label === '密码 1'), {kind:'modified',label:'密码 1',before:'old-secret',after:'new-secret',sensitive:true});
  assert.equal(changes.find(change => change.label === '恢复码')?.sensitive, true);
  assert.equal(historyValue('tags', ['甲','乙']), '甲 · 乙');
  assert.equal(historyValue('attachmentIds', ['a','b']), '2 个附件');
  assert.equal(historyValue('', undefined), '未设置');
});
