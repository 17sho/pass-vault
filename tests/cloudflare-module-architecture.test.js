import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import * as requestUtils from '../apps/worker/src/request-utils.ts';
import * as pinnedOrder from '../public/pinned-order.mjs';
import * as historyDiff from '../public/history-diff.mjs';
import * as httpHelpers from '../apps/worker/src/http.ts';
import { SECURITY_HEADERS, json, asset, error } from '../apps/worker/src/http.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');
const root = resolve(new URL('..', import.meta.url).pathname);
const staticModuleSpecifierPattern = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
function relativeSpecifiers(text,file='<inline>') {
  const specifiers = [...text.matchAll(staticModuleSpecifierPattern)].map(match=>match[1]);
  for (const match of text.matchAll(/\bimport\s*\(\s*/g)) {
    const expression = text.slice(match.index+match[0].length), literal = expression.match(/^(['"])([^'"]+)\1/);
    assert.ok(literal, `non-literal dynamic import cannot be audited: ${file}`);
    if (literal[2].startsWith('.')) specifiers.push(literal[2]);
  }
  return specifiers.map(specifier=>specifier.replace(/[?#].*$/,''));
}
const forbiddenSideEffects = /\b(?:fetch|document|window|navigator|indexedDB|localStorage|sessionStorage|crypto)\b|\.DB\b|\.ATTACHMENTS\b|\.ASSETS\b/;

test('纯辅助模块锁定最小导出集合且禁止浏览器、数据库、R2和密码学副作用', async () => {
  assert.deepEqual(Object.keys(requestUtils).sort(), ['body','emptyObject','exactKeys','limitedJson','namedCookie','validPassword']);
  assert.deepEqual(Object.keys(pinnedOrder), ['pinnedFirst']);
  assert.deepEqual(Object.keys(historyDiff).sort(), ['businessHistoryChanges','historyValue']);
  assert.deepEqual(Object.keys(httpHelpers).sort(), ['SECURITY_HEADERS','asset','error','json']);
  const [requests, pinned, history] = await Promise.all([
    source('../apps/worker/src/request-utils.ts'),
    source('../public/pinned-order.mjs'),
    source('../public/history-diff.mjs'),
  ]);
  for (const [name, text] of [['request-utils',requests],['pinned-order',pinned],['history-diff',history]]) {
    assert.doesNotMatch(text, forbiddenSideEffects, `${name} must remain side-effect free`);
  }
});

test('Cloudflare核心模块依赖保持单向且无入口反向依赖', async () => {
  const [runtime, http, requests, index] = await Promise.all([
    source('../apps/worker/src/runtime.ts'),
    source('../apps/worker/src/http.ts'),
    source('../apps/worker/src/request-utils.ts'),
    source('../apps/worker/src/index.ts'),
  ]);
  assert.deepEqual(relativeSpecifiers(runtime), []);
  assert.deepEqual(relativeSpecifiers(http), ['./runtime.ts']);
  assert.deepEqual(relativeSpecifiers(requests), []);
  assert.match(index, /from ['"]\.\/runtime\.ts['"]/);
  assert.match(index, /from ['"]\.\/http\.ts['"]/);
  assert.match(index, /from ['"]\.\/request-utils\.ts['"]/);
});

test('仓库受审源码相对导入图不存在循环依赖', async () => {
  const files = [], ignoredDirectories = new Set(['.git','node_modules','dist','release','coverage','.cache']);
  async function walk(directory='.') {
    for (const entry of await readdir(join(root,directory), {withFileTypes:true})) {
      if (entry.isDirectory()&&ignoredDirectories.has(entry.name)) continue;
      const path = normalize(join(directory,entry.name));
      if (entry.isDirectory()) await walk(path);
      else if (['.ts','.js','.mjs'].includes(extname(entry.name))) files.push(path.replace(/^\.\//,''));
    }
  }
  await walk();
  const known = new Set(files), graph = new Map(files.map(file=>[file,[]]));
  for (const file of files) {
    const text = await readFile(join(root,file),'utf8');
    for (const specifier of relativeSpecifiers(text,file)) {
      const base = normalize(join(dirname(file),specifier));
      const target = [base,`${base}.ts`,`${base}.js`,`${base}.mjs`,join(base,'index.ts'),join(base,'index.js'),join(base,'index.mjs')].find(candidate=>known.has(candidate));
      assert.ok(target, `unresolved relative import: ${file} -> ${specifier}`);
      graph.get(file).push(target);
    }
  }
  const visiting = new Set(), visited = new Set(), stack = [];
  function visit(file) {
    if (visiting.has(file)) assert.fail(`circular import: ${[...stack.slice(stack.indexOf(file)),file].map(x=>relative(root,join(root,x))).join(' -> ')}`);
    if (visited.has(file)) return;
    visiting.add(file);stack.push(file);
    for (const target of graph.get(file)) visit(target);
    stack.pop();visiting.delete(file);visited.add(file);
  }
  for (const file of files) visit(file);
  assert.ok(files.length>=115);
});

test('HTTP辅助响应级契约锁定全部安全头、no-store、错误体及分享页noindex', async () => {
  const expected = {
    'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'referrer-policy':'no-referrer',
    'strict-transport-security':'max-age=63072000; includeSubDomains; preload',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
  };
  assert.deepEqual(SECURITY_HEADERS, expected);
  for (const response of [json({ok:true}), error(418,'teapot')]) {
    for (const [name,value] of Object.entries(expected)) assert.equal(response.headers.get(name), value);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const failed = error(418,'teapot');
  assert.equal(failed.status, 418);
  assert.deepEqual(await failed.json(), {error:'teapot'});

  const env = {ASSETS:{fetch:async request => new Response('asset',{status:200,headers:{'cache-control':'public, max-age=60','x-upstream':'kept'}})}};
  for (const [path, noindex] of [['/',false],['/shared',false],['/shareevil',false],['/share',true],['/share/',true],['/share.html',true],['/share/opaque',true]]) {
    const response = await asset(new Request(`https://example.test${path}`), env);
    for (const [name,value] of Object.entries(expected)) assert.equal(response.headers.get(name), value);
    assert.equal(response.headers.get('x-upstream'), 'kept');
    assert.equal(response.headers.get('x-robots-tag'), noindex?'noindex, nofollow':null);
    assert.equal(await response.text(), 'asset');
  }
});
