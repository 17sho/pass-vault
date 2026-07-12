import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium, webkit, devices } from 'playwright';
const inviteCode=process.env.INVITE_CODE;if(!inviteCode)throw new Error('INVITE_CODE is required');

const base = process.argv[2];
if (!base || !/^https:\/\/(pass|passkey)\.23cm\.me\/?$/.test(base)) throw new Error('usage: node scripts/prod-v117-login-stability.mjs https://pass.23cm.me|https://passkey.23cm.me');
const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const username = `e2e_v117_final_${suffix}`;
const password = `V117-${randomBytes(24).toString('base64url')}`;
const evidence = { base, username, seededEntries: 0, cases: [], passed: false };

async function createEntry(page, i) {
  await page.getByRole('button', { name: '+ 新建' }).click();
  await page.locator('#picker').getByRole('button', { name: '账号', exact: true }).click();
  const editor = page.locator('#editor');
  const values = { 平台: `v117-final-${suffix}-${i}`, 登录网址: `https://v117-${i}.example`, 备注: 'v1.1.7 final stability probe', '标签（逗号分隔）': 'e2e' };
  for (const [label, value] of Object.entries(values)) await editor.getByLabel(label, { exact: true }).fill(value);
  await editor.locator('input[name=credentialUsername]').fill(`user-${i}`);
  await editor.locator('input[name=credentialPassword]').fill(`fixture-${i}`);
  await editor.getByRole('button', { name: '保存' }).click();
  await editor.waitFor({ state: 'hidden' });
  evidence.seededEntries++;
}

async function seed() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '创建新库' }).click(); await page.getByLabel('邀请码').fill(inviteCode);
    await page.getByLabel('用户名').fill(username);
    await page.getByLabel('主密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '创建并进入' }).click();
    await page.locator('#vault').waitFor({ state: 'visible', timeout: 30_000 });
    for (let i = 1; i <= 3; i++) await createEntry(page, i);
    await page.getByRole('button', { name: '更多', exact: true }).click();
    await page.getByRole('menuitem', { name: '退出' }).click();
    await page.locator('#auth').waitFor({ state: 'visible' });
  } finally { await browser.close(); }
}

async function runCase(launcher, label, contextOptions, reducedMotion) {
  const browser = await launcher.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...contextOptions, reducedMotion });
    await context.addInitScript(() => {
      window.__v117Errors = [];
      window.addEventListener('error', e => window.__v117Errors.push(`pageerror:${e.message}`));
      window.addEventListener('unhandledrejection', e => window.__v117Errors.push(`unhandledrejection:${String(e.reason)}`));
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(`console:${m.text()}`); });
    page.on('pageerror', e => errors.push(`pageerror:${e.message}`));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByLabel('用户名').fill(username);
    await page.getByLabel('主密码', { exact: true }).fill(password);
    const result = await page.evaluate(async () => {
      const vault = document.querySelector('#vault');
      const list = document.querySelector('#list');
      const ids = new WeakMap(); let nextId = 1; let mutations = 0;
      const id = node => { if (!ids.has(node)) ids.set(node, nextId++); return ids.get(node); };
      const style = node => { const s = getComputedStyle(node); return { opacity: s.opacity, transform: s.transform, animationName: s.animationName }; };
      const sample = mark => { const cards = [...list.querySelectorAll('.item-card')]; return { mark, vault: style(vault), listIdentity: id(list), cardIdentities: cards.map(id), cards: cards.map(style), childCount: cards.length, mutations }; };
      const reveal = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { observer.disconnect(); reject(new Error('vault reveal timeout')); }, 30_000);
        const observer = new MutationObserver(() => {
          if (!vault.hidden) { clearTimeout(timer); observer.disconnect(); resolve(); }
        });
        observer.observe(vault, { attributes: true, attributeFilter: ['hidden'] });
      });
      document.querySelector('#auth-form').requestSubmit();
      await reveal;
      const observer = new MutationObserver(ms => { if (ms.some(m => m.target === list || m.target.closest?.('#list'))) mutations++; });
      observer.observe(list, { subtree: true, childList: true, attributes: true });
      const samples = [sample('reveal-same-frame')];
      let elapsed = 0;
      for (const ms of [0, 16, 50, 120, 180, 240]) { await new Promise(r => setTimeout(r, ms - elapsed)); elapsed = ms; samples.push(sample(`${ms}ms`)); }
      observer.disconnect();
      return { samples, windowErrors: window.__v117Errors };
    });
    errors.push(...result.windowErrors);
    assert.equal(result.samples.length, 7);
    const first = result.samples[0];
    for (const s of result.samples) {
      assert.deepEqual(s.vault, { opacity: '1', transform: 'none', animationName: 'none' });
      assert.equal(s.childCount, 3);
      assert.equal(s.listIdentity, first.listIdentity);
      assert.deepEqual(s.cardIdentities, first.cardIdentities);
      assert.ok(s.cards.every(x => x.opacity === '1' && x.transform === 'none' && x.animationName === 'none'));
      assert.equal(s.mutations, 0);
    }
    assert.deepEqual(errors, []);
    evidence.cases.push({ browser: label, reducedMotion, sampleMarks: result.samples.map(x => x.mark), entries: first.childCount, stableIdentity: true, stableStyles: true, mutationsAfterReveal: 0, consoleErrors: 0 });
    await context.close();
  } finally { await browser.close(); }
}

try {
  await seed();
  for (const [launcher, label, options] of [[chromium, 'chromium-390', { viewport: { width: 390, height: 844 } }], [webkit, 'webkit-iphone13', { ...devices['iPhone 13'] }]]) {
    for (const motion of ['no-preference', 'reduce']) await runCase(launcher, label, options, motion);
  }
  evidence.passed = true;
  console.log(JSON.stringify(evidence));
} catch (error) {
  console.log(JSON.stringify({ ...evidence, error: error.message }));
  process.exitCode = 1;
}
