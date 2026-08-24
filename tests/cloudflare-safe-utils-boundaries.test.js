import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { body, limitedJson, validPassword, emptyObject, exactKeys, namedCookie } from '../apps/worker/src/request-utils.ts';
import { pinnedFirst } from '../public/pinned-order.mjs';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Worker 请求纯辅助模块保持严格输入与 Cookie 行为', async () => {
  assert.equal(validPassword('x'), true);
  assert.equal(validPassword(''), false);
  assert.equal(validPassword('x'.repeat(1024)), true);
  assert.equal(validPassword('x'.repeat(1025)), false);
  assert.equal(validPassword('😀'.repeat(512)), true);
  assert.equal(validPassword('😀'.repeat(513)), false);
  for (const value of [null, 1, [], {}]) assert.equal(validPassword(value), false);
  assert.equal(emptyObject({}), true);
  for (const value of [null, [], {x:1}, '']) assert.equal(emptyObject(value), false);
  assert.equal(exactKeys({b:2,a:1}, ['a','b']), true);
  assert.equal(exactKeys({a:1,c:3}, ['a','b']), false);
  const request = new Request('https://example.test', {headers:{cookie:'first=one; target=a=b=c; empty='}});
  assert.equal(namedCookie(request, 'target'), 'a=b=c');
  assert.equal(namedCookie(request, 'empty'), '');
  assert.equal(namedCookie(request, 'missing'), null);
});

test('Worker 请求体辅助保持大小限制、空正文及 JSON 异常语义', async () => {
  assert.deepEqual(await body(new Request('https://example.test', {method:'POST',body:''})), {});
  assert.deepEqual(await body(new Request('https://example.test', {method:'POST',body:'{"ok":true}'})), {ok:true});
  await assert.rejects(body(new Request('https://example.test', {method:'POST',body:'{'})), SyntaxError);
  await assert.rejects(body(new Request('https://example.test', {method:'POST',headers:{'content-length':'2000001'},body:'{}'})), RangeError);
  assert.deepEqual(await limitedJson(new Request('https://example.test', {method:'POST',body:'{"x":1}'}), 7), {x:1});
  await assert.rejects(limitedJson(new Request('https://example.test', {method:'POST',body:'12345'}), 4), RangeError);
});

test('置顶纯排序保持置顶优先、rank、稳定性且不突变输入', () => {
  const rows = [
    {id:'normal-a'},
    {id:'legacy',pinned:true},
    {id:'rank-b',pinned:true,pinRank:2},
    {id:'rank-a',pinned:true,pinRank:1},
    {id:'normal-b'},
    {id:'same-a',pinned:true,pinRank:3},
    {id:'same-b',pinned:true,pinRank:3},
  ];
  const snapshot = structuredClone(rows);
  assert.deepEqual(pinnedFirst(rows).map(x=>x.id), ['rank-a','rank-b','same-a','same-b','legacy','normal-a','normal-b']);
  assert.deepEqual(rows, snapshot);
});

test('入口只导入新纯模块且不再重复定义', async () => {
  const [worker, app] = await Promise.all([
    source('../apps/worker/src/index.ts'),
    source('../public/app.mjs'),
  ]);
  assert.match(worker, /from ['"]\.\/request-utils\.ts['"]/);
  for (const name of ['body','limitedJson','validPassword','emptyObject','namedCookie']) assert.doesNotMatch(worker, new RegExp(`(?:function|const)\\s+${name}\\b`));
  assert.match(app, /from ['"]\/pinned-order\.mjs\?v=2\.2\.2['"]/);
  assert.doesNotMatch(app, /function pinnedFirst\s*\(/);
});
