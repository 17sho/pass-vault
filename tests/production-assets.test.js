import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const { version: VERSION } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expected = new Map([
  ['theme-init', `/theme-init.js?v=${VERSION}-theme-color-v2`],
  ['stylesheet', `/style.css?v=${VERSION}-custom-records-v15`],
  ['app-shell', `/app-shell.css?v=${VERSION}`],
  ['module', `/app.mjs?v=${VERSION}-custom-records-v15`],
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
    assert.doesNotMatch(html, new RegExp(`style\\.css\\?v=${VERSION.replaceAll('.', '\\.') }-(?!custom-records-v15(?:["']))`), path);
    assert.doesNotMatch(html, new RegExp(`app\\.mjs\\?v=${VERSION.replaceAll('.', '\\.') }-(?!custom-records-v15(?:["']))`), path);
    assert.doesNotMatch(html, /20260711-mobile-menu-1|\?v=1\.1\.11(?:[^0-9]|$)/, path);
  }
});

test('production HTML exposes the key-diamond brand icon and install manifest', async () => {
  for (const path of ['public/index.html', 'dist/index.html']) {
    const html = await readFile(path, 'utf8');
    assert.match(html, /<meta id="theme-color" name="theme-color" content="#f4f6f8">/, path);
    assert.match(html, new RegExp(`<script defer src="/theme-color\\.js\\?v=${VERSION.replaceAll('.', '\\.')}-theme-color-v2"></script>`), path);
    assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="any">/, path);
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/icon\.svg">/, path);
    assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/, path);
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/, path);
  }
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.name, '零知密码库');
  assert.equal(manifest.theme_color, '#0f5d49');
  assert.deepEqual(manifest.icons.map(({ src, sizes, purpose }) => ({ src, sizes, purpose })), [
    { src: '/icon-192.png', sizes: '192x192', purpose: 'any maskable' },
    { src: '/icon-512.png', sizes: '512x512', purpose: 'any maskable' },
  ]);
  for (const path of ['public/icon.svg','public/icon-192.png','public/icon-512.png','public/apple-touch-icon.png','public/favicon.ico']) {
    assert.ok((await stat(path)).size > 100, path);
  }
});

test(`quick-unlock submodule import uses current v${VERSION} cache key`, async () => {
  for (const path of ['public/app.mjs', 'dist/app.mjs']) {
    const source = await readFile(path, 'utf8');
    assert.match(source, new RegExp(`from ['\"]/quick-unlock-device\\.mjs\\?v=${VERSION.replaceAll('.', '\\.') }['\"]`), path);
    assert.doesNotMatch(source, /from ['"]\/quick-unlock-device\.mjs['"]/, path);
  }
});
