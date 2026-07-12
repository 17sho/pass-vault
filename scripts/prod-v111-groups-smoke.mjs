import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
const inviteCode=process.env.INVITE_CODE;if(!inviteCode)throw new Error('INVITE_CODE is required');

const allSites = ['https://pass.23cm.me', 'https://passkey.23cm.me'];
const allEngines = [['chromium', chromium], ['webkit', webkit]];
const requestedSites = (process.env.SITES || '').split(',').map(value => value.trim()).filter(Boolean);
const requestedEngines = (process.env.ENGINES || '').split(',').map(value => value.trim()).filter(Boolean);
const sites = requestedSites.length ? allSites.filter(site => requestedSites.includes(site) || requestedSites.includes(new URL(site).hostname)) : allSites;
const engines = requestedEngines.length ? allEngines.filter(([name]) => requestedEngines.includes(name)) : allEngines;
assert.ok(sites.length, `SITES matched no known site: ${process.env.SITES}`);
assert.ok(engines.length, `ENGINES matched no known engine: ${process.env.ENGINES}`);
const evidencePath = process.env.EVIDENCE_PATH || 'artifacts/prod-v111-groups-smoke.json';
const password = `V111-${randomBytes(24).toString('base64url')}!`;
const evidence = { startedAt: new Date().toISOString(), status: 'RUNNING', cases: [] };
const save = async () => writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
const unique = prefix => `${prefix}-${randomBytes(6).toString('hex')}`;
const groupButton = (page, type) => page.getByRole('button', { name: new RegExp(`管理${type}分组`) });
const groupDialog = page => page.getByRole('dialog', { name: '分组', exact: true });
async function openGroups(page, type) { await groupButton(page, type).click(); const dialog = groupDialog(page); await dialog.waitFor({ state: 'visible' }); return dialog; }
async function createGroup(page, type, name, record) { const dialog = await openGroups(page, type); await dialog.getByLabel('新分组名称').fill(name); const settingsResponse = page.waitForResponse(response => response.request().method() === 'PUT' && /\/api\/entries\/settings_registry$/.test(response.url())); await dialog.getByRole('button', { name: '创建分组' }).click(); const row = dialog.getByRole('button', { name: new RegExp(`^${name}（0）$`) }); const outcome = await Promise.race([row.waitFor().then(() => ({ kind: 'row' })), settingsResponse.then(response => ({ kind: 'response', response }))]); const response = outcome.response || await settingsResponse; const body = await response.body().catch(() => Buffer.alloc(0)); record.settingsPuts ??= []; record.settingsPuts.push({ status: response.status(), responseBytes: body.length }); assert.ok(response.ok(), `settings PUT failed: ${response.status()}`); await row.waitFor(); await dialog.getByRole('button', { name: '关闭' }).click(); }
async function selectGroup(page, type, name) { const dialog = await openGroups(page, type); const choice = dialog.getByRole('button', { name: new RegExp(`^${name}（\\d+）$`) }); await choice.focus(); await choice.press('Enter'); await dialog.getByRole('button', { name: '关闭' }).click(); await expectActive(page, type, name); }
async function expectActive(page, type, name) { assert.match(await groupButton(page, type).textContent(), new RegExp(name)); }
async function login(page, username) { await page.getByLabel('用户名').fill(username); await page.getByLabel('主密码', { exact: true }).fill(password); await page.getByRole('button', { name: '登录并解锁' }).click(); await page.locator('#vault').waitFor({ state: 'visible' }); }
async function chooseType(page, type) { await page.getByRole('button', { name: '+ 新建', exact: true }).click(); await page.locator('#picker').getByRole('button', { name: type, exact: true }).click(); }
async function deleteCard(page, title) { const card = page.locator('.item-card').filter({ hasText: title }); await card.waitFor(); const more = card.getByRole('button', { name: /更多操作/ }); if (await more.count()) { await more.click(); await card.getByRole('menu').getByRole('menuitem', { name: '删除' }).click(); } else { await card.click(); await page.locator('#detail').waitFor({ state: 'visible' }); await page.locator('#detail').getByRole('button', { name: '删除', exact: true }).click(); } const confirm = page.getByRole('dialog', { name: /确认删除/ }); await confirm.getByRole('button', { name: /确认删除/ }).click(); await card.waitFor({ state: 'hidden' }); }

await save();
for (const base of sites) for (const [engineName, engine] of engines) {
  const username = `e2e_v111_${new URL(base).hostname.replaceAll('.', '_')}_${engineName}_${Date.now()}_${randomBytes(3).toString('hex')}`;
  const names = { account: unique('acctg'), accountRenamed: unique('acctr'), website: unique('webg'), attachment: unique('attg') };
  const item = { account: unique('Alpha-Service'), website: unique('Independent-Site'), attachment: unique('tiny') + '.txt' };
  const record = { base, engine: engineName, username, names, item, status: 'RUNNING', checkpoints: [] };
  evidence.cases.push(record); await save();
  const browser = await engine.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  const errors = [], requestBodies = [];
  page.on('pageerror', error => errors.push(`pageerror:${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console:${message.text()}`); });
  page.on('requestfailed', request => { if (!/abort|cancel/i.test(request.failure()?.errorText || '')) errors.push(`request:${request.url()}:${request.failure()?.errorText}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`http:${response.status()}:${response.url()}`); });
  page.on('request', request => { if (['POST', 'PUT', 'PATCH'].includes(request.method())) requestBodies.push(`${request.postData() || ''}${request.headers()['x-attachment-metadata'] || ''}`); });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '创建新库' }).click(); await page.getByLabel('邀请码').fill(inviteCode);
    await page.getByLabel('用户名').fill(username); await page.getByLabel('主密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '创建并进入' }).click(); await page.locator('#vault').waitFor({ state: 'visible' });
    await expectActive(page, '账号', '默认'); await createGroup(page, '账号', names.account, record); record.checkpoints.push('account-empty-group-created'); await save();

    await page.reload(); await login(page, username);
    await expectActive(page, '账号', '默认'); // active selection is intentionally session-memory only
    await selectGroup(page, '账号', names.account); // explicitly restore the desired active group
    await chooseType(page, '账号'); const editor = page.locator('#editor');
    await editor.getByLabel('平台').fill(item.account); await editor.getByLabel('登录网址').fill('https://example.invalid');
    await editor.getByLabel('账号 1', { exact: true }).fill('alpha-user'); await editor.getByLabel('密码 1', { exact: true }).fill('not-real');
    await editor.getByLabel('分组').selectOption({ label: names.account }); await editor.getByRole('button', { name: '保存' }).click();
    await page.locator('.item-card').filter({ hasText: item.account }).waitFor();
    await page.getByPlaceholder('搜索当前分类').fill(item.account.replace('Alpha', 'Alhpa')); assert.equal(await page.locator('.item-card').count(), 1);
    record.checkpoints.push('account-create-search-filter');

    let dialog = await openGroups(page, '账号'); await dialog.getByRole('button', { name: `重命名 ${names.account}` }).click();
    const rename = page.getByRole('dialog', { name: '重命名分组' }); await rename.getByLabel('分组名称', { exact: true }).fill(names.accountRenamed); await rename.getByRole('button', { name: '保存名称' }).click();
    await dialog.getByRole('button', { name: `删除 ${names.accountRenamed}` }).waitFor(); await dialog.getByRole('button', { name: `删除 ${names.accountRenamed}` }).click();
    await page.getByRole('dialog', { name: '确认删除分组' }).getByRole('button', { name: '确认删除' }).click();
    await page.getByText('分组已删除，资料已移至默认', { exact: true }).waitFor(); await page.getByPlaceholder('搜索当前分类').fill('');
    await expectActive(page, '账号', '默认'); await page.locator('.item-card').filter({ hasText: item.account }).waitFor(); record.checkpoints.push('account-rename-delete-to-default');

    await page.locator('nav').getByRole('button', { name: '网站', exact: true }).click(); await expectActive(page, '网站', '默认'); await createGroup(page, '网站', names.website, record); await selectGroup(page, '网站', names.website);
    await chooseType(page, '网站'); const websiteEditor = page.locator('#editor'); await websiteEditor.getByLabel('名称').fill(item.website); await websiteEditor.getByLabel('网址').fill('https://website.example.invalid'); await websiteEditor.getByLabel('分组').selectOption({ label: names.website }); await websiteEditor.getByRole('button', { name: '保存' }).click();
    await page.locator('.item-card').filter({ hasText: item.website }).waitFor(); record.checkpoints.push('independent-website-group-create');

    await page.locator('nav').getByRole('button', { name: '附件', exact: true }).click(); await expectActive(page, '附件', '默认'); await createGroup(page, '附件', names.attachment, record); await selectGroup(page, '附件', names.attachment);
    await chooseType(page, '附件'); const upload = page.getByRole('dialog', { name: '上传附件' }); await upload.getByLabel('分组').selectOption({ label: names.attachment }); await upload.getByLabel('选择文件').setInputFiles({ name: item.attachment, mimeType: 'text/plain', buffer: Buffer.from('tiny') }); await upload.getByRole('button', { name: '加密并上传' }).click();
    await page.getByRole('button', { name: item.attachment, exact: true }).waitFor(); await page.getByLabel('附件分类').selectOption('image'); assert.equal(await page.getByRole('button', { name: item.attachment, exact: true }).count(), 0); await page.getByLabel('附件分类').selectOption('other');
    await page.getByRole('button', { name: item.attachment, exact: true }).click(); await page.locator('#detail').getByRole('button', { name: '重命名' }).click(); const attachmentRename = page.getByRole('dialog', { name: '重命名附件' }); await attachmentRename.getByLabel('分组').selectOption(''); await attachmentRename.getByRole('button', { name: '保存' }).click(); await page.locator('#detail').getByRole('button', { name: '← 返回' }).click();
    dialog = await openGroups(page, '附件'); await dialog.getByRole('button', { name: `删除 ${names.attachment}` }).click(); await page.getByRole('dialog', { name: '确认删除分组' }).getByRole('button', { name: '确认删除' }).click(); await page.getByText('分组已删除，资料已移至默认', { exact: true }).waitFor(); await page.getByLabel('附件分类').selectOption('other'); await deleteCard(page, item.attachment); record.checkpoints.push('attachment-upload-group-move-category-delete');

    await page.locator('nav').getByRole('button', { name: '网站', exact: true }).click(); await deleteCard(page, item.website);
    await page.locator('nav').getByRole('button', { name: '账号', exact: true }).click(); await deleteCard(page, item.account); record.checkpoints.push('card-flows-delete');
    for (const width of [320, 1440]) { await page.setViewportSize({ width, height: 800 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `overflow at ${width}`); }
    for (const body of requestBodies) for (const plaintext of Object.values(names)) assert.ok(!body.includes(plaintext), `group plaintext leaked: ${plaintext}`);
    assert.ok(requestBodies.length > 0); assert.deepEqual(errors, []);
    record.requestBodiesChecked = requestBodies.length; record.errors = errors; record.status = 'PASS'; record.checkpoints.push('plaintext-clean-no-overflow-no-errors');
  } catch (error) { record.status = 'FAIL'; record.error = error.stack || String(error); record.errors = errors; throw error; }
  finally { await browser.close(); await save(); }
}
evidence.status = 'PASS'; evidence.finishedAt = new Date().toISOString(); await save();
console.log(JSON.stringify(evidence, null, 2));
