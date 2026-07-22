import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const VERSION = '1.1.37';
const expected = new Map([
  ['stylesheet', `/style.css?v=${VERSION}`],
  ['app-shell', `/app-shell.css?v=${VERSION}`],
  ['module', `/app.mjs?v=${VERSION}`],
]);

function refs(html) {
  return new Map([
    ['stylesheet', html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/i)?.[1]],
    ['app-shell', html.match(/<link\b[^>]*href="([^"]*app-shell\.css[^"]*)"/i)?.[1]],
    ['module', html.match(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/i)?.[1]],
  ]);
}

test('production HTML references current v1.1.37 frontend assets', async () => {
  for (const path of ['public/index.html', 'dist/index.html']) {
    const html = await readFile(path, 'utf8');
    assert.deepEqual(refs(html), expected, path);
    assert.doesNotMatch(html, /20260711-mobile-menu-1|\?v=1\.1\.11(?:[^0-9]|$)/, path);
  }
});
