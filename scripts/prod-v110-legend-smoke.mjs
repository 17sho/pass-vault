import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
const inviteCode=process.env.INVITE_CODE;if(!inviteCode)throw new Error('INVITE_CODE is required');

const base = process.argv[2];
const evidencePath = process.argv[3];
const productionBase = /^https:\/\/(pass|passkey)\.23cm\.me\/?$/.test(base || '');
const localBase = process.env.V110_SMOKE_ALLOW_LOCAL === '1' && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(base || '');
if (!base || (!productionBase && !localBase)) {
  throw new Error('usage: node scripts/prod-v110-legend-smoke.mjs https://pass.23cm.me|https://passkey.23cm.me [evidence.json]');
}
const site = new URL(base).hostname.replaceAll('.', '_');
const run = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const username = `e2e_v110_${site}_${run}`;
const password = `V110-${randomBytes(24).toString('base64url')}!`;
const evidence = { base, run, username, cases: [], passed: false };
const engines = [['chromium', chromium], ['webkit', webkit]];

async function persist() {
  if (evidencePath) await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}
function observe(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror:${error.message}`));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errors.push(`console:${message.type()}:${message.text()}`);
  });
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText || '';
    if (!/ERR_ABORTED|cancelled/i.test(reason)) errors.push(`requestfailed:${request.url()}:${reason}`);
  });
  return errors;
}
async function assertLegends(page, editor, expected) {
  const legends = editor.locator('.credential-row legend');
  assert.equal(await legends.count(), expected, 'credential legend count');
  const metrics = await legends.evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = [...range.getClientRects()].filter(item => item.width || item.height);
    return { text: node.textContent?.trim(), whiteSpace: style.whiteSpace, width: rect.width, lineCount: lines.length };
  }));
  for (const [index, metric] of metrics.entries()) {
    assert.equal(metric.text, `账号 ${index + 1}`);
    assert.equal(metric.whiteSpace, 'nowrap');
    assert.equal(metric.lineCount, 1);
    assert.ok(metric.width > 0, `legend ${index + 1} has positive width`);
  }
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    body: document.body.scrollWidth > document.body.clientWidth,
  }));
  assert.deepEqual(overflow, { document: false, body: false });
  return { metrics, overflow };
}
async function fillRow(editor, index, label) {
  await editor.locator('input[name=credentialUsername]').nth(index).fill(`${label}-user-${index + 1}`);
  await editor.locator('input[name=credentialPassword]').nth(index).fill(`V110-row-${index + 1}-Secret!`);
}
async function saveByScrolling(page, editor) {
  const save = editor.getByRole('button', { name: '保存', exact: true });
  await save.evaluate(node => node.scrollIntoView({ block: 'center' }));
  const reachable = await save.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight && getComputedStyle(node).visibility === 'visible';
  });
  assert.equal(reachable, true, 'save is reachable after scrolling editor');
  await editor.evaluate(node => {
    window.__v110SubmitCount = 0;
    node.addEventListener('submit', () => { window.__v110SubmitCount += 1; }, { once: true });
  });
  const responsePromise = page.waitForResponse(response =>
    response.request().method() === 'PUT' && /\/api\/entries\//.test(response.url()));
  const validationBefore = await editor.locator('input,textarea,select').evaluateAll(nodes => nodes.map(node => ({
    name: node.name, valid: node.checkValidity(), validationMessage: node.validationMessage,
  })).filter(item => !item.valid || item.validationMessage));
  await save.click();
  const response = await responsePromise;
  const responseBody = await response.text();
  assert.equal(response.status(), 200, `save response: ${response.status()} ${responseBody}`);
  await editor.waitFor({ state: 'hidden' });
  const toast = await page.locator('#toast').evaluate(node => {
    const style = getComputedStyle(node);
    return { text: node.textContent?.trim(), className: node.className, display: style.display,
      visibility: style.visibility, opacity: style.opacity };
  });
  return { submitCount: await page.evaluate(() => window.__v110SubmitCount), validationBefore,
    response: { status: response.status(), body: responseBody }, dialogHidden: !(await editor.isVisible()), toast };
}
async function openCard(page, title) {
  const detail = page.locator('#detail');
  if (await detail.isVisible()) {
    const back = detail.getByRole('button', { name: '← 返回', exact: true });
    if (await back.isVisible()) await back.click();
    await detail.waitFor({ state: 'hidden' });
  }
  // Closing detail rerenders the list, so reacquire the card instead of forcing a stale click.
  const card = page.locator('.item-card', { hasText: title });
  await card.waitFor({ state: 'visible' });
  await card.click();
  await detail.waitFor({ state: 'visible' });
}

try {
  // Exactly one disposable account identity per production site; both engines use isolated contexts.
  const seedBrowser = await chromium.launch({ headless: true });
  try {
    const page = await seedBrowser.newPage({ viewport: { width: 320, height: 720 } });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '创建新库' }).click(); await page.getByLabel('邀请码').fill(inviteCode);
    await page.getByLabel('用户名').fill(username);
    await page.getByLabel('主密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '创建并进入' }).click();
    await page.locator('#vault').waitFor({ state: 'visible', timeout: 90000 });
  } finally { await seedBrowser.close(); }

  for (const [engine, launcher] of engines) {
    const started = Date.now();
    const title = `v110-${engine}-${run}`;
    const browser = await launcher.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
      const page = await context.newPage();
      page.setDefaultTimeout(45000);
      const errors = observe(page);
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.getByLabel('用户名').fill(username);
      await page.getByLabel('主密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: '登录并解锁' }).click();
      await page.locator('#vault').waitFor({ state: 'visible', timeout: 90000 });

      await page.getByRole('button', { name: '+ 新建', exact: true }).click();
      await page.locator('#picker').getByRole('button', { name: '账号', exact: true }).click();
      const editor = page.locator('#editor');
      await editor.getByLabel('平台').fill(title);
      await editor.getByLabel('登录网址').fill(`https://${engine}-${run}.example`);
      await fillRow(editor, 0, engine);
      const one = await assertLegends(page, editor, 1);
      const firstSave = await saveByScrolling(page, editor);
      assert.equal(firstSave.submitCount, 1);
      assert.deepEqual(firstSave.validationBefore, []);
      assert.equal(firstSave.dialogHidden, true);
      await openCard(page, title);
      assert.equal(await page.locator('#detail').getByRole('button', { name: '复制账号 1' }).count(), 1);

      await page.locator('#detail').getByRole('button', { name: '编辑' }).click();
      for (let index = 1; index < 3; index++) {
        await editor.getByRole('button', { name: '+ 添加账号' }).click();
        await fillRow(editor, index, engine);
      }
      const three = await assertLegends(page, editor, 3);
      const secondSave = await saveByScrolling(page, editor);
      assert.equal(secondSave.submitCount, 1);
      assert.deepEqual(secondSave.validationBefore, []);
      assert.equal(secondSave.dialogHidden, true);
      await openCard(page, title);
      assert.equal(await page.locator('#detail').getByRole('button', { name: /^复制账号 \d+$/ }).count(), 3);
      await page.locator('#detail').getByRole('button', { name: '编辑' }).click();
      assert.equal(await editor.locator('.credential-row').count(), 3, 'three rows persisted after edit/reopen');
      await assertLegends(page, editor, 3);
      assert.deepEqual(errors, [], 'no page/console/request errors');
      evidence.cases.push({ engine, title, status: 'PASS', durationMs: Date.now() - started,
        one, three, firstSave, secondSave, errors });
      await context.close();
    } catch (error) {
      evidence.cases.push({ engine, title, status: 'FAIL', durationMs: Date.now() - started, error: String(error?.stack || error) });
      throw error;
    } finally { await browser.close(); await persist(); }
  }
  evidence.passed = true;
} catch (error) {
  evidence.error = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  await persist();
  console.log(JSON.stringify(evidence));
}
