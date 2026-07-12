import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
const inviteCode=process.env.INVITE_CODE;if(!inviteCode)throw new Error('INVITE_CODE is required');

const VERSION = '1.1.12';
const knownSites = ['https://pass.23cm.me', 'https://passkey.23cm.me'];
const requested = (process.env.SITES || '').split(',').map(x => x.trim()).filter(Boolean);
const sites = requested.length ? knownSites.filter(x => requested.includes(x) || requested.includes(new URL(x).hostname)) : knownSites;
assert.ok(sites.length, 'SITES matched no production target');
const cases = [['chromium', chromium, 320, 800], ['webkit', webkit, 390, 844]];
const evidencePath = process.env.EVIDENCE_PATH || 'artifacts/prod-v112-geometry-smoke.json';
const password = `V112-${randomBytes(24).toString('base64url')}!`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const localHashes = Object.fromEntries(await Promise.all(['style.css', 'app.mjs'].map(async name => [name, sha256(await readFile(`dist/${name}`))])));
const evidence = { startedAt: new Date().toISOString(), version: VERSION, localHashes, assets: [], cases: [], cleanup: { usernames: [] }, status: 'RUNNING' };
const save = () => writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
const assetRefs = html => ({ style: html.match(/href="([^"?]*style\.css\?v=[^"]+)"/)?.[1], app: html.match(/src="([^"?]*app\.mjs\?v=[^"]+)"/)?.[1] });
const rect = element => { const r = element.getBoundingClientRect(), c = getComputedStyle(element); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height, text:element.textContent?.trim() || '', overflow:c.overflow, textOverflow:c.textOverflow, whiteSpace:c.whiteSpace }; };
const overlap = (a, b) => a.x < b.right - 0.5 && a.right > b.x + 0.5 && a.y < b.bottom - 0.5 && a.bottom > b.y + 0.5;

await save();
for (const base of sites) {
  const htmlResponse = await fetch(`${base}/`, { headers: { 'cache-control': 'no-cache' } });
  assert.ok(htmlResponse.ok, `${base} HTML ${htmlResponse.status}`);
  const html = await htmlResponse.text(), refs = assetRefs(html);
  assert.equal(refs.style, `/style.css?v=${VERSION}`, `${base} stylesheet ref`);
  assert.equal(refs.app, `/app.mjs?v=${VERSION}`, `${base} module ref`);
  const record = { base, html: { status: htmlResponse.status, cacheControl: htmlResponse.headers.get('cache-control'), refs }, files: {} };
  for (const [kind, ref] of Object.entries(refs)) {
    const response = await fetch(new URL(ref, base)); const bytes = Buffer.from(await response.arrayBuffer()); const name = kind === 'style' ? 'style.css' : 'app.mjs';
    record.files[name] = { status: response.status, cacheControl: response.headers.get('cache-control'), etag: response.headers.get('etag'), sha256: sha256(bytes), bytes: bytes.length };
    assert.ok(response.ok, `${base} ${name} ${response.status}`); assert.equal(record.files[name].sha256, localHashes[name], `${base} ${name} hash`);
  }
  evidence.assets.push(record); await save();
}

// Upgrade-cache proof: warm the exact v1.1.11 keys, then require v1.1.12 HTML and bytes in the same persistent context.
for (const base of sites) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    for (const name of ['style.css', 'app.mjs']) { const r = await page.request.get(`${base}/${name}?v=1.1.11`); assert.ok(r.ok(), `${base} warm ${name}`); }
    await page.goto(base, { waitUntil: 'networkidle' });
    const refs = await page.evaluate(() => ({ style: document.querySelector('link[rel=stylesheet]')?.getAttribute('href'), app: document.querySelector('script[type=module]')?.getAttribute('src') }));
    assert.deepEqual(refs, { style: `/style.css?v=${VERSION}`, app: `/app.mjs?v=${VERSION}` });
    evidence.assets.find(x => x.base === base).cacheUpgrade = { warmed: 'v1.1.11', refs, status: 'PASS' };
  } finally { await context.close(); await browser.close(); await save(); }
}

for (const base of sites) for (const [engineName, engine, width, height] of cases) {
  const username = `e2e_v112_${new URL(base).hostname.replaceAll('.', '_')}_${engineName}_${Date.now()}_${randomBytes(3).toString('hex')}`;
  evidence.cleanup.usernames.push({ base, username });
  const record = { base, engine: engineName, width, username, status: 'RUNNING' }; evidence.cases.push(record); await save();
  const browser = await engine.launch({ headless: true }); const context = await browser.newContext({ viewport: { width, height } }); const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(`pageerror:${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console:${m.text()}`); });
  page.on('requestfailed', r => { if (!/abort|cancel/i.test(r.failure()?.errorText || '')) errors.push(`request:${r.url()}:${r.failure()?.errorText}`); });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: '创建新库' }).click(); await page.getByLabel('邀请码').fill(inviteCode);
    await page.getByLabel('用户名').fill(username); await page.getByLabel('主密码', { exact: true }).fill(password); await page.getByRole('button', { name: '创建并进入' }).click(); await page.locator('#vault').waitFor({ state: 'visible' });
    await page.locator('nav').getByRole('button', { name: '附件', exact: true }).click(); await page.locator('#attachment-filter').waitFor({ state: 'visible' });
    const geometry = await page.evaluate(rectSource => { const pick = (0, eval)(`(${rectSource})`); return { search:pick(document.querySelector('#search')), group:pick(document.querySelector('#groups')), filter:pick(document.querySelector('#attachment-filter')), toolbar:pick(document.querySelector('.toolbar')), viewport:innerWidth, docWidth:document.documentElement.scrollWidth }; }, rect.toString());
    record.geometry = geometry; record.errors = errors;
    assert.ok(geometry.search.width >= 150, JSON.stringify(geometry)); assert.equal(geometry.group.text, '默认'); assert.ok(geometry.group.width >= 70, JSON.stringify(geometry));
    assert.notEqual(geometry.group.textOverflow, 'ellipsis', JSON.stringify(geometry)); assert.ok(geometry.filter.height >= 44, JSON.stringify(geometry)); assert.ok(geometry.filter.y >= Math.max(geometry.search.bottom, geometry.group.bottom) - 0.5, JSON.stringify(geometry));
    for (const [a,b] of [[geometry.search,geometry.group],[geometry.search,geometry.filter],[geometry.group,geometry.filter]]) assert.equal(overlap(a,b), false, JSON.stringify({a,b}));
    assert.ok(geometry.search.x >= geometry.toolbar.x && geometry.group.right <= geometry.toolbar.right + 0.5 && geometry.filter.right <= geometry.toolbar.right + 0.5, JSON.stringify(geometry)); assert.ok(geometry.docWidth <= geometry.viewport); assert.deepEqual(errors, []);
    record.status = 'PASS';
  } catch (error) { record.status = 'FAIL'; record.error = error.stack || String(error); evidence.status = 'FAIL'; throw error; }
  finally { await context.close(); await browser.close(); await save(); }
}
evidence.status = 'PASS'; evidence.finishedAt = new Date().toISOString(); await save(); console.log(JSON.stringify(evidence, null, 2));
