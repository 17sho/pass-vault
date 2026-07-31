import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { version: VERSION } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expected = new Map([
  ['theme-init', `/theme-init.js?v=${VERSION}`],
  ['stylesheet', `/style.css?v=${VERSION}`],
  ['app-shell', `/app-shell.css?v=${VERSION}`],
  ['module', `/app.mjs?v=${VERSION}-session-auth`],
]);

function refs(html) {
  return new Map([
    ['theme-init', html.match(/<script\b[^>]*src="([^"]*theme-init\.js[^"]*)"/i)?.[1]],
    ['stylesheet', html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/i)?.[1]],
    ['app-shell', html.match(/<link\b[^>]*href="([^"]*app-shell\.css[^"]*)"/i)?.[1]],
    ['module', html.match(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/i)?.[1]],
  ]);
}

test(`production HTML references current v${VERSION} frontend assets`, async () => {
  for (const path of ['public/index.html', 'dist/index.html']) {
    const html = await readFile(path, 'utf8');
    assert.deepEqual(refs(html), expected, path);
    assert.doesNotMatch(html, new RegExp(`app\\.mjs\\?v=${VERSION.replaceAll('.', '\\.') }-(?!session-auth(?:["']))`), path);
    assert.doesNotMatch(html, /20260711-mobile-menu-1|\?v=1\.1\.11(?:[^0-9]|$)/, path);
  }
});

test(`quick-unlock submodule import uses current v${VERSION} cache key`, async () => {
  for (const path of ['public/app.mjs', 'dist/app.mjs']) {
    const source = await readFile(path, 'utf8');
    assert.match(source, new RegExp(`from ['\"]/quick-unlock-device\\.mjs\\?v=${VERSION.replaceAll('.', '\\.') }['\"]`), path);
    assert.doesNotMatch(source, /from ['"]\/quick-unlock-device\.mjs['"]/, path);
  }
});
