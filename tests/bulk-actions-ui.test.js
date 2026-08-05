import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { TEST_INVITE_CODE, startTestServer } from './fixtures.mjs';

async function register(page,base){
  await page.goto(base);
  await page.getByRole('button',{name:'创建新库'}).click();
  await page.getByLabel('邀请码').fill(TEST_INVITE_CODE);
  await page.locator('#auth-form input[name=username]').fill(`bulk-actions-${Date.now()}-${Math.random()}`);
  await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');
  await page.getByRole('button',{name:'创建并进入'}).click();
  await page.locator('#vault').waitFor({state:'visible'});
}
async function createNote(page,title){
  await page.getByRole('button',{name:'+ 新建'}).click();
  await page.locator('#picker').getByRole('button',{name:'笔记',exact:true}).click();
  const dialog=page.locator('#editor');
  await dialog.getByLabel('标题').fill(title);
  await dialog.getByLabel('正文').fill('批量操作测试');
  await dialog.getByRole('button',{name:'保存'}).click();
  await dialog.waitFor({state:'hidden'});
}
async function createTyped(page,label,name){
  await page.getByRole('button',{name:'+ 新建'}).click();
  await page.locator('#picker').getByRole('button',{name:label,exact:true}).click();
  if(label==='附件'){
    const dialog=page.getByRole('dialog',{name:'上传附件'});
    await dialog.getByLabel('选择文件').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from('bulk action')});
    await dialog.getByRole('button',{name:'加密并上传'}).click();
    await page.getByText('附件已上传',{exact:true}).waitFor();
    return;
  }
  const dialog=page.locator('#editor');
  if(label==='账号'){await dialog.getByLabel('平台').fill(name);await dialog.getByLabel('登录网址').fill('https://bulk.example');await dialog.getByLabel('账号 1',{exact:true}).fill('bulk-user');await dialog.getByLabel('密码 1',{exact:true}).fill('bulk-secret')}
  else if(label==='网站'){await dialog.getByLabel('名称').fill(name);await dialog.getByLabel('网址',{exact:true}).fill('https://bulk.example')}
  else if(label==='笔记'){await dialog.getByLabel('标题').fill(name);await dialog.getByLabel('正文').fill('批量操作测试')}
  else{await dialog.getByLabel('账号',{exact:true}).fill(name);await dialog.getByLabel('密钥').fill('JBSWY3DPEHPK3PXP')}
  await dialog.getByRole('button',{name:'保存'}).click();
  await dialog.waitFor({state:'hidden'});
}
async function enterBulk(page){
  await page.getByRole('button',{name:'更多',exact:true}).click();
  await page.getByRole('menuitem',{name:/批量/}).click();
  await page.locator('#bulk-bar:not([hidden])').waitFor();
}

for(const engine of [chromium,webkit])test(`${engine.name()} 批量置顶、取消置顶和移入回收站`,async()=>{
  const fixture=await startTestServer({dbPath:`/tmp/pass-vault-bulk-actions-${engine.name()}-${process.pid}.sqlite`});
  const browser=await engine.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try{
    await register(page,fixture.base);
    await page.locator('nav').getByRole('button',{name:'笔记',exact:true}).click();
    await createNote(page,'批量操作甲');
    await createNote(page,'批量操作乙');
    await enterBulk(page);
    await page.getByRole('button',{name:'全选当前结果'}).click();
    await page.getByRole('button',{name:'置顶所选'}).click();
    await page.getByText('已置顶 2 项资料',{exact:true}).waitFor();
    assert.equal(await page.locator('.pin-badge').count(),2);
    await enterBulk(page);
    await page.getByRole('button',{name:'全选当前结果'}).click();
    await page.getByRole('button',{name:'取消置顶所选'}).click();
    await page.getByText('已取消置顶 2 项资料',{exact:true}).waitFor();
    assert.equal(await page.locator('.pin-badge').count(),0);
    await enterBulk(page);
    await page.getByRole('button',{name:'全选当前结果'}).click();
    await page.getByRole('button',{name:'删除所选'}).click();
    const confirm=page.getByRole('dialog',{name:'批量移入回收站'});
    await confirm.waitFor();
    assert.match(await confirm.textContent(),/将 2 项资料移入回收站？/);
    await confirm.getByRole('button',{name:'移入回收站'}).click();
    await page.getByText('已将 2 项资料移入回收站',{exact:true}).waitFor();
    assert.equal(await page.locator('.item-card').count(),0);
    await page.getByRole('button',{name:'更多',exact:true}).click();
    await page.getByRole('menuitem',{name:'回收站'}).click();
    assert.equal(await page.locator('.trash-item').count(),2);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth<=1),true);
  }finally{await browser.close();await fixture.stop()}
});

test('批量置顶第二项失败时补偿第一项并保留选择',async()=>{
  const fixture=await startTestServer({dbPath:`/tmp/pass-vault-bulk-pin-rollback-${process.pid}.sqlite`});
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try{
    await register(page,fixture.base);
    await page.locator('nav').getByRole('button',{name:'笔记',exact:true}).click();
    await createNote(page,'补偿甲');await createNote(page,'补偿乙');
    await enterBulk(page);await page.getByRole('button',{name:'全选当前结果'}).click();
    let writes=0;
    await page.route('**/api/entries/**',route=>{
      if(route.request().method()!=='PUT')return route.continue();
      writes++;
      return writes===2?route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal_error"}'}):route.continue();
    });
    await page.getByRole('button',{name:'置顶所选'}).click();
    await page.getByText(/批量置顶失败/).waitFor();
    assert.equal(writes,3);
    assert.equal(await page.locator('.bulk-select[aria-checked=true]').count(),2);
    assert.equal(await page.locator('.pin-badge').count(),0);
  }finally{await browser.close();await fixture.stop()}
});

test('批量置顶补偿和权威重载都失败时明确要求重新登录',async()=>{
  const fixture=await startTestServer({dbPath:`/tmp/pass-vault-bulk-pin-reload-fail-${process.pid}.sqlite`});
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try{
    await register(page,fixture.base);
    await page.locator('nav').getByRole('button',{name:'笔记',exact:true}).click();
    await createNote(page,'失同步甲');await createNote(page,'失同步乙');
    await enterBulk(page);await page.getByRole('button',{name:'全选当前结果'}).click();
    let writes=0;
    await page.route('**/api/entries/**',route=>{
      if(route.request().method()!=='PUT')return route.continue();
      writes++;
      return writes===1?route.continue():route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal_error"}'});
    });
    await page.route('**/api/entries',route=>route.request().method()==='GET'?route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal_error"}'}):route.continue());
    await page.getByRole('button',{name:'置顶所选'}).click();
    await page.getByText('批量置顶失败且重新同步失败，请锁定后重新登录',{exact:true}).waitFor();
    assert.equal(writes,3);
    assert.equal(await page.locator('.bulk-select[aria-checked=true]').count(),2);
  }finally{await browser.close();await fixture.stop()}
});

test('批量删除笔记时未共享附件随父项进入回收站',async()=>{
  const fixture=await startTestServer({dbPath:`/tmp/pass-vault-bulk-note-files-${process.pid}.sqlite`});
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try{
    await register(page,fixture.base);
    await page.locator('nav').getByRole('button',{name:'笔记',exact:true}).click();
    await createNote(page,'附件批量父项');
    await page.locator('.item-card',{hasText:'附件批量父项'}).click();
    await page.locator('#detail').getByRole('button',{name:'编辑'}).click();
    const editor=page.locator('#editor');
    await editor.getByLabel('添加图片').setInputFiles({name:'bulk-child.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});
    await editor.getByRole('button',{name:'保存'}).click();
    await editor.waitFor({state:'hidden'});
    await enterBulk(page);
    await page.getByRole('checkbox',{name:'选择 附件批量父项'}).click();
    await page.getByRole('button',{name:'删除所选'}).click();
    await page.getByRole('dialog',{name:'批量移入回收站'}).getByRole('button',{name:'移入回收站'}).click();
    await page.getByText('已将 1 项资料移入回收站',{exact:true}).waitFor();
    await page.getByRole('button',{name:'更多',exact:true}).click();
    await page.getByRole('menuitem',{name:'回收站'}).click();
    assert.equal(await page.locator('.trash-item').count(),2);
    await page.getByText('随笔记“附件批量父项”处理',{exact:true}).waitFor();
  }finally{await browser.close();await fixture.stop()}
});

test('账号、网站、笔记、TOTP 与附件均支持批量置顶和软删除',async()=>{
  const fixture=await startTestServer({dbPath:`/tmp/pass-vault-bulk-action-types-${process.pid}.sqlite`});
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try{
    await register(page,fixture.base);
    for(const [label,name] of [['账号','批量账号'],['网站','批量网站'],['笔记','批量笔记'],['TOTP','批量动态码'],['附件','批量附件.txt']]){
      await page.locator('nav').getByRole('button',{name:label,exact:true}).click();
      await createTyped(page,label,name);
      await enterBulk(page);
      await page.getByRole('checkbox',{name:`选择 ${name}`}).click();
      await page.getByRole('button',{name:'置顶所选'}).click();
      await page.getByText('已置顶 1 项资料',{exact:true}).waitFor();
      await enterBulk(page);
      await page.getByRole('checkbox',{name:`选择 ${name}`}).click();
      await page.getByRole('button',{name:'删除所选'}).click();
      await page.getByRole('dialog',{name:'批量移入回收站'}).getByRole('button',{name:'移入回收站'}).click();
      await page.getByText('已将 1 项资料移入回收站',{exact:true}).waitFor();
    }
    await page.getByRole('button',{name:'更多',exact:true}).click();
    await page.getByRole('menuitem',{name:'回收站'}).click();
    assert.equal(await page.locator('.trash-item').count(),5);
  }finally{await browser.close();await fixture.stop()}
});
