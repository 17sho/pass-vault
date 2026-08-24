import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright';
import { TEST_INVITE_CODE, startTestServer } from './fixtures.mjs';
import { mkdir } from 'node:fs/promises';

let fixture, base, browser;
async function stopFixture() {
  await browser?.close(); browser = undefined;
  await fixture?.stop(); fixture = undefined;
}
test.beforeEach(async () => {
  await mkdir('artifacts', { recursive: true });
  fixture = await startTestServer({ dbPath: `/tmp/pass-vault-ui-${process.pid}.sqlite` });
  base = fixture.base;
  browser = await chromium.launch({headless:true});
});
test.afterEach(stopFixture);

test('注册页允许任意非空主密码并发送注册请求',async()=>{const page=await browser.newPage();try{await page.goto(base);await page.getByRole('button',{name:'创建新库'}).click();await page.getByLabel('邀请码').fill(TEST_INVITE_CODE);await page.locator('#auth-form input[name="username"]').fill('11');await page.getByLabel('主密码',{exact:true}).fill('1');let requests=0;page.on('request',r=>{if(r.url().endsWith('/api/register'))requests++});await page.getByRole('button',{name:'创建并进入'}).click();await page.waitForFunction(()=>document.querySelector('#vault')?.hidden===false);assert.equal(requests,1)}finally{await page.close()}});

async function detailAction(page,name){const detail=page.locator('#detail');await detail.getByRole('button',{name:'更多',exact:true}).click();const menu=page.getByRole('dialog',{name:'更多操作'});await menu.getByRole('button',{name,exact:true}).click()}

async function detailHasAction(page,name){const detail=page.locator('#detail');await detail.getByRole('button',{name:'更多',exact:true}).click();const menu=page.getByRole('dialog',{name:'更多操作'});const count=await menu.getByRole('button',{name,exact:true}).count();await menu.getByRole('button',{name:'取消',exact:true}).click();return count}

async function register(page) {
  await page.goto(base);
  assert.equal(await page.getByLabel('邀请码').isHidden(),true);
  await page.getByRole('button',{name:'创建新库'}).click();
  assert.equal(await page.getByLabel('邀请码').isVisible(),true);
  await page.getByLabel('邀请码').fill(TEST_INVITE_CODE);
  const username='tester'+Date.now();
  await page.locator('#auth-form input[name="username"]').fill(username);
  await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');
  await page.getByRole('button',{name:'创建并进入'}).click();
  try{await page.locator('#vault').waitFor({state:'visible',timeout:10000})}catch{throw Error(`auth failed: ${await page.locator('#auth-error').textContent()} url=${page.url()}`)}
  return username;
}
test('操作提醒进入顶层并浮在模态弹窗之上',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{await register(page);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();await page.getByRole('dialog',{name:'标签',exact:true}).getByRole('button',{name:'按使用量排序'}).click();const toast=page.locator('#toast');await page.waitForFunction(()=>{const el=document.querySelector('#toast');return el?.matches(':popover-open')&&getComputedStyle(el).opacity==='1'});const state=await toast.evaluate(el=>({popover:el.matches(':popover-open'),position:getComputedStyle(el).position,visible:getComputedStyle(el).opacity==='1',dialogs:[...document.querySelectorAll('dialog[open]')].length}));assert.equal(state.popover,true,JSON.stringify(state));assert.equal(state.position,'fixed',JSON.stringify(state));assert.equal(state.visible,true,JSON.stringify(state));assert.equal(state.dialogs,1,JSON.stringify(state))}finally{await page.close();if(own!==browser)await own.close()}}});

test('资料与附件的分组选择使用自有弹窗而非浏览器原生下拉',async()=>{
 for(const engine of [chromium,webkit]){
  const own=engine===chromium?browser:await engine.launch({headless:true});
  const page=await own.newPage({viewport:{width:390,height:844},colorScheme:'dark'});
  try{
    await register(page);
    await page.getByRole('button',{name:/管理账号分组/}).click();
    const manage=page.getByRole('dialog',{name:'分组',exact:true});
    await manage.getByLabel('新分组名称').fill('云服务');
    await manage.getByRole('button',{name:'创建分组'}).click();
    await manage.getByRole('button',{name:/^云服务（/}).waitFor();
    await manage.getByRole('button',{name:'关闭'}).click();
    await page.getByRole('button',{name:'+ 新建'}).click();
    await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'新建账号'});
    assert.equal(await editor.locator('select[name="groupId"]').count(),0);
    const trigger=editor.locator('.group-picker-trigger');
    assert.equal(await trigger.getAttribute('aria-label'),'选择分组，当前默认');
    await trigger.click();
    const picker=page.getByRole('dialog',{name:'选择分组'});
    await picker.getByRole('radio',{name:'云服务',exact:true}).click();
    await picker.waitFor({state:'hidden'});
    assert.equal(await trigger.textContent(),'云服务');
    assert.equal(await editor.locator('input[type="hidden"][name="groupId"]').inputValue().then(Boolean),true);
    await editor.getByRole('button',{name:'取消'}).click();

    await page.getByRole('button',{name:'+ 新建'}).click();
    await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();
    const upload=page.getByRole('dialog',{name:'上传附件'});
    assert.equal(await upload.locator('select[name="groupId"]').count(),0);
    assert.equal(await upload.getByRole('button',{name:'选择分组，当前默认'}).count(),1);
    await upload.getByRole('button',{name:'取消'}).click();
  }finally{await page.close();if(engine!==chromium)await own.close()}
 }
});

test('隐私模式弹窗在窄屏无标题焦点框且保护级别不逐字换行',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:320,height:700}});try{await register(page);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'隐私模式'}).click();const dialog=page.getByRole('dialog',{name:'保护级别'});const geometry=await dialog.evaluate(d=>{const title=d.querySelector('#privacy-title'),level=d.querySelector('.privacy-head h2'),options=[...d.querySelectorAll('.privacy-options label')],actions=d.querySelector('.dialog-actions'),dr=d.getBoundingClientRect(),lr=level.getBoundingClientRect();return{outline:getComputedStyle(title).outlineStyle,shadow:getComputedStyle(title).boxShadow,levelWidth:lr.width,levelHeight:lr.height,dialogLeft:dr.left,dialogRight:dr.right,viewport:innerWidth,optionWidths:options.map(x=>x.getBoundingClientRect().width),actionBottom:actions.getBoundingClientRect().bottom,dialogBottom:dr.bottom,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}});assert.equal(geometry.outline,'none');assert.equal(geometry.shadow,'none');assert.ok(geometry.levelWidth>60,JSON.stringify(geometry));assert.ok(geometry.levelHeight<40,JSON.stringify(geometry));assert.ok(geometry.dialogLeft>=11&&geometry.viewport-geometry.dialogRight>=11,JSON.stringify(geometry));assert.ok(geometry.optionWidths.every(width=>width>240),JSON.stringify(geometry));assert.ok(geometry.dialogBottom-geometry.actionBottom>=-1,JSON.stringify(geometry));assert.equal(geometry.overflow,0)}finally{await page.close();if(own!==browser)await own.close()}}});

test('标题可见档位保留标题并隐藏列表敏感摘要',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{await register(page);await create(page,'账号',{'平台':'标题可见银行','登录网址':'https://title-secret.example','备注':'标题模式私密摘要','账号':'title-private@example.com','密码':'TitleSecret-123'});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'隐私模式'}).click();const dialog=page.getByRole('dialog',{name:'保护级别'});await dialog.getByLabel('标题可见').check();await dialog.getByRole('button',{name:'保存'}).click();await dialog.waitFor({state:'hidden'});const card=page.locator('.item-card').first(),text=await card.textContent(),aria=await card.locator('.item-more').getAttribute('aria-label');assert.ok(text.includes('标题可见银行'),text);for(const secret of ['title-private@example.com','https://title-secret.example','标题模式私密摘要'])assert.equal(text.includes(secret),false,secret);assert.ok(text.includes('••••'),text);assert.ok(aria.includes('标题可见银行'),aria);await card.click();const detail=await page.locator('#detail').textContent();assert.ok(detail.includes('title-private@example.com'),detail)}finally{await page.close();if(own!==browser)await own.close()}}});

test('两个隐私行为开关独立保存并控制后台遮挡与重开恢复',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),context=await own.newContext({viewport:{width:390,height:844}}),page=await context.newPage();try{const username=await register(page),password='correct horse battery staple';await page.locator('#menu').click();await page.getByRole('menuitem',{name:'隐私模式'}).click();const dialog=page.getByRole('dialog',{name:'保护级别'});await dialog.getByLabel('标题可见').check();const background=dialog.getByRole('checkbox',{name:/切到后台时立即遮挡/}),persist=dialog.getByRole('checkbox',{name:/重新打开页面时保持开启/});assert.equal(await background.isChecked(),true);assert.equal(await persist.isChecked(),true);await background.uncheck();await persist.uncheck();await dialog.getByRole('button',{name:'保存'}).click();assert.deepEqual(await page.evaluate(()=>window.__privacySettingsForTest()),{level:'titles',background:false,persist:false});await page.evaluate(()=>window.__privacyBackgroundForTest());assert.equal(await page.locator('#privacy-shield').isHidden(),true);assert.equal(JSON.stringify(await page.evaluate(()=>({level:localStorage.getItem('pass-vault-privacy'),background:localStorage.getItem('pass-vault-privacy-background'),persist:localStorage.getItem('pass-vault-privacy-persist')}))),JSON.stringify({level:null,background:'false',persist:'false'}));await page.reload();await page.getByLabel('用户名').fill(username);await page.locator('#auth-form input[name="password"]').fill(password);await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor();assert.deepEqual(await page.evaluate(()=>window.__privacySettingsForTest()),{level:'off',background:false,persist:false});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'隐私模式'}).click();const reopened=page.getByRole('dialog',{name:'保护级别'});await reopened.getByLabel('完整隐私').check();await reopened.getByRole('checkbox',{name:/切到后台时立即遮挡/}).check();await reopened.getByRole('checkbox',{name:/重新打开页面时保持开启/}).check();await reopened.getByRole('button',{name:'保存'}).click();await page.reload();await page.getByLabel('用户名').fill(username);await page.locator('#auth-form input[name="password"]').fill(password);await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor();assert.deepEqual(await page.evaluate(()=>window.__privacySettingsForTest()),{level:'full',background:true,persist:true});await page.evaluate(()=>window.__privacyBackgroundForTest());await page.locator('#privacy-shield').waitFor({state:'visible'})}finally{await context.close();if(own!==browser)await own.close()}}});

test('隐私模式替换列表明文并在后台使用中性遮罩',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{await register(page);await create(page,'账号',{'平台':'隐私测试银行','登录网址':'https://secret-bank.example','备注':'私密备注','账号':'private@example.com','密码':'Secret-123'});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'隐私模式'}).click();const dialog=page.getByRole('dialog',{name:'保护级别'});await dialog.getByLabel('列表隐私').check();await dialog.getByRole('button',{name:'保存'}).click();await dialog.waitFor({state:'hidden'});const card=page.locator('.item-card').first();assert.equal((await card.textContent()).includes('隐私测试银行'),false,`card=${await card.textContent()}`);assert.equal((await card.textContent()).includes('private@example.com'),false,`card=${await card.textContent()}`);assert.match(await card.textContent(),/账号资料/);await page.evaluate(()=>window.__privacyBackgroundForTest());const shield=page.locator('#privacy-shield');await shield.waitFor({state:'visible'});const shieldText=await shield.textContent();assert.equal(shieldText.includes('隐私测试银行'),false);assert.equal(shieldText.includes('private@example.com'),false);await shield.getByRole('button',{name:'恢复显示'}).click();await shield.waitFor({state:'hidden'});assert.equal((await card.textContent()).includes('隐私测试银行'),false)}finally{await page.close();if(own!==browser)await own.close()}}});

test('完整隐私隐藏详情明文且锁库清除临时显示状态',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});try{await register(page);await create(page,'账号',{'平台':'完整隐私资料','登录网址':'https://full-private.example','备注':'详情秘密','账号':'full@example.com','密码':'FullSecret-456'});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'隐私模式'}).click();const dialog=page.getByRole('dialog',{name:'保护级别'});await dialog.getByLabel('完整隐私').check();await dialog.getByRole('button',{name:'保存'}).click();await dialog.waitFor({state:'hidden'});let attachmentRequests=0;await page.route('**/api/attachments/*/content',route=>{attachmentRequests++;return route.abort()});await page.getByRole('button',{name:'附件'}).click();await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传附件'});await upload.getByLabel('选择文件').setInputFiles({name:'private-file.txt',mimeType:'text/plain',buffer:Buffer.from('secret-file-body')});await upload.getByRole('button',{name:'加密并上传'}).click();await upload.waitFor({state:'hidden'});await page.locator('.attachment-card').first().click();assert.match(await page.locator('#detail').textContent(),/附件资料/);assert.equal(attachmentRequests,0);await page.getByRole('button',{name:'账号'}).click();await page.locator('.item-card').first().click();const detail=page.locator('#detail');const text=await detail.textContent();for(const secret of ['完整隐私资料','full@example.com','FullSecret-456','https://full-private.example','详情秘密'])assert.equal(text.includes(secret),false,secret);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'退出并锁定'}).click();await page.locator('#auth').waitFor({state:'visible'});assert.equal(await page.locator('#privacy-shield').isHidden(),true)}finally{await page.close()}});

test('后台遮挡清除历史标题与分享选择DOM及其事件闭包',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});try{await register(page);await page.evaluate(()=>{const secret={title:'闭包中的解密资料'};document.querySelector('#history-subtitle').textContent=secret.title;const option=document.createElement('button');option.textContent=secret.title;option.onclick=()=>secret;document.querySelector('#share-item-options').append(option);window.__privacyBackgroundForTest()});assert.equal(await page.locator('#history-subtitle').textContent(),'');assert.equal(await page.locator('#share-item-options').count(),1);assert.equal(await page.locator('#share-item-options').evaluate(node=>node.childElementCount),0)}finally{await page.close()}});

async function create(page,type, values){
  await page.getByRole('button',{name:'+ 新建'}).click();
  await page.locator('#picker').getByRole('button',{name:type,exact:true}).click();
  const editor = page.locator('#editor'), fields={...values};
  if(type==='账号'){
    await editor.locator('input[name=credentialUsername]').fill(fields['账号']??'');
    await editor.locator('input[name=credentialPassword]').fill(fields['密码']??'');
    delete fields['账号']; delete fields['密码'];
  }
  if('标签（逗号分隔）' in fields){const raw=String(fields['标签（逗号分隔）']||'');delete fields['标签（逗号分隔）'];if(raw){await editor.getByRole('button',{name:'选择标签'}).click();const picker=page.getByRole('dialog',{name:'选择标签'});for(const tag of raw.split(',').map(x=>x.trim()).filter(Boolean)){await picker.getByLabel('新标签名称').fill(tag);await picker.getByRole('button',{name:'添加标签'}).click()}await picker.getByRole('button',{name:'完成'}).click();await picker.waitFor({state:'hidden'})}}
  for(const [label,value] of Object.entries(fields)) await editor.getByLabel(label,{exact:true}).fill(value);
  await editor.getByRole('button',{name:'保存'}).click();
  await editor.waitFor({state:'hidden'});
}

test('账号详情保留下方标签字段并将顶部标签重新设计为摘要条',async()=>{const page=await browser.newPage({viewport:{width:1280,height:760}});try{await register(page);await create(page,'账号',{'平台':'x-ui','登录网址':'http://192.0.2.1:8002/','备注':'节点','账号':'admin','密码':'secret','标签（逗号分隔）':'11'});await page.locator('.item-card',{hasText:'admin'}).click();const detail=page.locator('#detail'),strip=detail.locator('.detail-tag-strip'),chip=strip.locator('.tag-chip',{hasText:'11'});assert.equal(await strip.count(),1);assert.equal(await strip.locator('.detail-tag-strip-label',{hasText:'标签'}).count(),1);assert.equal(await chip.count(),1);const lower=detail.locator('[data-detail-field="tags"]');assert.equal(await lower.count(),1);assert.match(await lower.textContent(),/标签.*11/s);await chip.evaluate(e=>{e.dataset.tagColor='red'});const style=await strip.evaluate(e=>{const chip=e.querySelector('.tag-chip'),s=getComputedStyle(e),cs=getComputedStyle(chip),r=e.getBoundingClientRect();return{background:s.backgroundColor,border:s.borderStyle,width:s.borderWidth,padding:s.paddingLeft,radius:s.borderRadius,height:r.height,chipColor:cs.color,chipBackground:cs.backgroundColor,chipBorder:cs.borderColor,chipShadow:cs.boxShadow}});assert.notEqual(style.background,'rgba(0, 0, 0, 0)',JSON.stringify(style));assert.equal(style.border,'solid');assert.ok(parseFloat(style.width)>=1);assert.ok(parseFloat(style.padding)>=10);assert.ok(parseFloat(style.radius)>=8);assert.ok(style.height>=44);assert.match(style.chipColor,/rgb\(220, 76, 76\)/);assert.notEqual(style.chipBackground,'rgba(0, 0, 0, 0)');assert.notEqual(style.chipBorder,'rgba(0, 0, 0, 0)');assert.equal(style.chipShadow.includes('inset 3px'),false)}finally{await page.close()}});

test('列表中的收藏和置顶状态圈同一行并排且不增加卡片纵向层级',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});try{await register(page);await create(page,'账号',{'平台':'open code额度','登录网址':'https://example.com/','备注':'','账号':'admin','密码':'secret','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'open code额度'}).click();const detail=page.locator('#detail');await detail.getByRole('button',{name:'收藏',exact:true}).click();await page.getByText('已收藏',{exact:true}).waitFor();await detailAction(page,'置顶');await page.getByText('已置顶',{exact:true}).waitFor();await page.getByRole('button',{name:'返回'}).click();const badges=page.locator('.item-card',{hasText:'open code额度'}).locator('.item-marker-badges');assert.equal(await badges.count(),1);assert.deepEqual(await badges.locator(':scope > *').allTextContents(),['收藏','置顶']);const geometry=await badges.evaluate(e=>{const r=e.getBoundingClientRect(),children=[...e.children].map(x=>x.getBoundingClientRect()),s=getComputedStyle(e);return{display:s.display,wrap:s.flexWrap,height:r.height,tops:children.map(x=>x.top),rights:children.map(x=>x.right),cardRight:e.closest('.item-card').getBoundingClientRect().right}});assert.equal(geometry.display,'flex');assert.equal(geometry.wrap,'nowrap');assert.ok(Math.abs(geometry.tops[0]-geometry.tops[1])<2,JSON.stringify(geometry));assert.ok(geometry.rights[1]<=geometry.cardRight,JSON.stringify(geometry));const sizes=await badges.locator(':scope > *').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{width:r.width,height:r.height,font:getComputedStyle(node).fontSize}}));assert.ok(Math.abs(sizes[0].width-sizes[1].width)<1,JSON.stringify(sizes));assert.ok(Math.abs(sizes[0].height-sizes[1].height)<1,JSON.stringify(sizes));assert.equal(sizes[0].font,sizes[1].font)}finally{await page.close()}});

test('并发冲突时编辑器保持打开、保留未保存输入并显示明确提示',async()=>{const page=await browser.newPage();await register(page);await create(page,'笔记',{'标题':'并发原始标题','正文':'原始正文','标签（逗号分隔）':''});await page.getByRole('button',{name:'并发原始标题的更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'编辑'}).click();const editor=page.locator('#editor'),title=editor.getByLabel('标题',{exact:true});await title.fill('本页尚未保存的标题');let intercepted=0,requestBody='';await page.route('**/api/entries/*',async route=>{if(route.request().method()==='PUT'){intercepted++;requestBody=route.request().postData()||'';await route.fulfill({status:409,contentType:'application/json',body:'{"error":"conflict","currentRevision":2}'})}else await route.continue()});await editor.getByRole('button',{name:'保存'}).click();await editor.getByRole('alert').getByText('此资料已在其他页面或设备更新，本次修改尚未保存。').waitFor();assert.equal(intercepted,1);assert.equal(JSON.parse(requestBody).revision,1);assert.equal(await editor.isVisible(),true);assert.equal(await title.inputValue(),'本页尚未保存的标题');const refresh=page.waitForRequest(request=>request.method()==='GET'&&new URL(request.url()).pathname==='/api/entries',{timeout:5000});await editor.getByRole('button',{name:'关闭'}).click();await refresh;await page.close()});

test('笔记附件上传已提交后锁库仍以原会话补偿且不留孤儿',async()=>{const page=await browser.newPage();await register(page);await create(page,'笔记',{'标题':'上传锁库笔记','正文':'原正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'上传锁库笔记'}).click();await page.locator('#detail').getByRole('button',{name:'编辑'}).click();const editor=page.locator('#editor');await editor.getByLabel('添加图片').setInputFiles({name:'lock-mid-upload.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});let release,seen,uploadedId,deletedId;const held=new Promise(resolve=>{release=resolve}),committed=new Promise(resolve=>{seen=resolve});await page.route('**/api/attachments/**',async route=>{const path=new URL(route.request().url()).pathname,upload=path.match(/^\/api\/attachments\/([^/]+)$/),cleanup=path.match(/^\/api\/attachments\/([^/]+)\/compensation$/);if(route.request().method()==='POST'&&upload){uploadedId=upload[1];const response=await route.fetch();seen();await held;return route.fulfill({response})}if(route.request().method()==='DELETE'&&cleanup){deletedId=cleanup[1];return route.continue()}await route.continue()});await editor.getByRole('button',{name:'保存'}).click();await committed;await page.evaluate(()=>window.__lockVaultForTest());release();for(let i=0;i<50&&!deletedId;i++)await page.waitForTimeout(20);assert.equal(deletedId,uploadedId);const list=await page.evaluate(async()=>await (await fetch('/api/attachments')).json());assert.equal(list.items.some(item=>item.id===uploadedId),false);await page.close()});

test('笔记附件上传提交后切换账户仍用旧会话专用凭据补偿',async()=>{const page=await browser.newPage();await register(page);await create(page,'笔记',{'标题':'跨账户补偿笔记','正文':'原正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'跨账户补偿笔记'}).click();await page.locator('#detail').getByRole('button',{name:'编辑'}).click();const editor=page.locator('#editor');await editor.getByLabel('添加图片').setInputFiles({name:'cross-account.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});let release,seen,uploadedId,compensation;const held=new Promise(r=>release=r),committed=new Promise(r=>seen=r);await page.route('**/api/attachments/**',async route=>{const path=new URL(route.request().url()).pathname,upload=path.match(/^\/api\/attachments\/([^/]+)$/),cleanup=path.match(/^\/api\/attachments\/([^/]+)\/compensation$/);if(route.request().method()==='POST'&&upload){uploadedId=upload[1];const response=await route.fetch();seen();await held;return route.fulfill({response})}if(route.request().method()==='DELETE'&&cleanup){compensation={id:cleanup[1],headers:route.request().headers(),response:await route.fetch()};return route.fulfill({response:compensation.response})}return route.continue()});await editor.getByRole('button',{name:'保存'}).click();await committed;await page.evaluate(()=>window.__lockVaultForTest());await page.getByRole('button',{name:'创建新库'}).click();await page.getByLabel('邀请码').fill(TEST_INVITE_CODE);await page.locator('#auth-form input[name="username"]').fill('cleanup-second'+Date.now());await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'创建并进入'}).click();await page.locator('#vault').waitFor({state:'visible'});release();for(let i=0;i<100&&!compensation;i++)await page.waitForTimeout(20);assert.equal(compensation?.id,uploadedId);assert.equal(compensation?.response.status(),204);assert.ok(compensation?.headers['x-source-session-id']);assert.ok(compensation?.headers['x-csrf-token']);await page.close()});

test('笔记冲突补偿删除失败后重试不得重复上传同一文件',async()=>{const page=await browser.newPage();await register(page);await create(page,'笔记',{'标题':'补偿失败笔记','正文':'原正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'补偿失败笔记'}).click();await page.locator('#detail').getByRole('button',{name:'编辑'}).click();const editor=page.locator('#editor');await editor.getByLabel('添加图片').setInputFiles({name:'retry-once.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});let uploads=0,entryPuts=0;page.on('request',request=>{if(request.method()==='POST'&&/^\/api\/attachments\/[^/]+$/.test(new URL(request.url()).pathname))uploads++});await page.route('**/api/attachments/**',async route=>{if(route.request().method()==='DELETE'&&/\/compensation$/.test(new URL(route.request().url()).pathname))return route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal_error"}'});await route.continue()});await page.route('**/api/entries/*',async route=>{if(route.request().method()==='PUT'&&route.request().postDataJSON()?.revision&&entryPuts++===0)return route.fulfill({status:409,contentType:'application/json',body:'{"error":"conflict","currentRevision":2}'});await route.continue()});await editor.getByRole('button',{name:'保存'}).click();await editor.getByRole('alert').filter({hasText:'其他页面或设备更新'}).waitFor();assert.equal(uploads,1);await editor.getByRole('button',{name:'保存'}).click();await editor.waitFor({state:'hidden'});assert.equal(uploads,1);await page.close()});

test('笔记保存冲突时补偿删除本次新上传附件并保留草稿',async()=>{const page=await browser.newPage();await register(page);await create(page,'笔记',{'标题':'附件冲突笔记','正文':'原正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'附件冲突笔记'}).click();await page.locator('#detail').getByRole('button',{name:'编辑'}).click();const editor=page.locator('#editor');await editor.getByLabel('正文').fill('冲突草稿正文');await editor.getByLabel('添加图片').setInputFiles({name:'conflict-orphan.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});let uploadedId,deletedId,deleteIfMatch,deleted;const deleteSeen=new Promise(resolve=>{deleted=resolve});page.on('request',request=>{const path=new URL(request.url()).pathname,upload=path.match(/^\/api\/attachments\/([^/]+)$/),cleanup=path.match(/^\/api\/attachments\/([^/]+)\/compensation$/);if(request.method()==='POST'&&upload)uploadedId=upload[1];if(request.method()==='DELETE'&&cleanup){deletedId=cleanup[1];deleteIfMatch=request.headers()['if-match'];deleted()}});await page.route('**/api/entries/*',async route=>{if(route.request().method()==='PUT'&&route.request().postDataJSON()?.revision){await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'conflict',currentRevision:2})});return}await route.continue()});await editor.getByRole('button',{name:'保存'}).click();await editor.getByRole('alert').filter({hasText:'其他页面或设备更新'}).waitFor();await deleteSeen;assert.ok(uploadedId);assert.equal(deletedId,uploadedId);assert.ok(Number(deleteIfMatch)>=1);assert.equal(await editor.getByLabel('正文').inputValue(),'冲突草稿正文');assert.equal(await editor.getByLabel('添加图片').evaluate(input=>input.files.length),1);const list=await page.evaluate(async()=>await (await fetch('/api/attachments')).json());assert.equal(list.items.some(x=>x.id===uploadedId),false);await page.close()});

test('旧会话分组保存晚到不得污染锁库后新账户的分组和 settings revision',async()=>{const page=await browser.newPage();await register(page);await page.locator('nav').getByRole('button',{name:'笔记',exact:true}).click();await page.getByRole('button',{name:/管理笔记分组/}).click();const groupsDialog=page.getByRole('dialog',{name:'分组',exact:true});await groupsDialog.getByLabel('新分组名称').fill('旧会话分组');let releaseOld,seenOld;const oldSeen=new Promise(resolve=>{seenOld=resolve}),oldRelease=new Promise(resolve=>{releaseOld=resolve});let settingsWrites=0,newBody,seenNew;const newSeen=new Promise(resolve=>{seenNew=resolve});await page.route('**/api/entries/settings_registry',async route=>{if(route.request().method()!=='PUT')return route.continue();settingsWrites++;if(settingsWrites===1){seenOld();await oldRelease;return route.fulfill({status:200,contentType:'application/json',body:'{"id":"settings_registry","type":"settings","version":1,"iv":"iv","ciphertext":"cipher","createdAt":1,"revision":9}'})}newBody=JSON.parse(route.request().postData()||'{}');seenNew();return route.continue()});await groupsDialog.getByRole('button',{name:'创建分组'}).click();await oldSeen;await page.evaluate(()=>window.__lockVaultForTest());await page.locator('#auth').waitFor({state:'visible'});await page.getByRole('button',{name:'创建新库'}).click();await page.getByLabel('邀请码').fill(TEST_INVITE_CODE);await page.locator('#auth-form input[name="username"]').fill('second'+Date.now());await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'创建并进入'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.locator('nav').getByRole('button',{name:'笔记',exact:true}).click();await page.getByRole('button',{name:/管理笔记分组/}).click();const secondGroups=page.getByRole('dialog',{name:'分组',exact:true});await secondGroups.getByLabel('新分组名称').fill('新账户分组');await secondGroups.getByRole('button',{name:'创建分组'}).click();await newSeen;assert.equal(settingsWrites,2);assert.equal('revision' in newBody,false);releaseOld();await page.waitForTimeout(200);assert.equal(await secondGroups.getByRole('button',{name:/^新账户分组（/}).count(),1);assert.equal(await secondGroups.getByRole('button',{name:/^旧会话分组（/}).count(),0);await page.close()});

test('同一密码库分组写请求严格串行且后发写等待前一项完成',async()=>{const page=await browser.newPage();await register(page);await page.locator('nav').getByRole('button',{name:'笔记',exact:true}).click();await page.getByRole('button',{name:/管理笔记分组/}).click();const dialog=page.getByRole('dialog',{name:'分组',exact:true}),input=dialog.getByLabel('新分组名称'),button=dialog.getByRole('button',{name:'创建分组'});let release,seen,writes=0;const held=new Promise(r=>release=r),firstSeen=new Promise(r=>seen=r);await page.route('**/api/entries/settings_registry',async route=>{if(route.request().method()!=='PUT')return route.continue();writes++;if(writes===1){seen();await held}return route.continue()});await input.fill('串行分组一');await button.click();await firstSeen;await input.fill('串行分组二');await button.click();await page.waitForTimeout(200);assert.equal(writes,1,`首请求未释放前观察到 ${writes} 次settings写`);release();await dialog.getByRole('button',{name:/^串行分组二（/}).waitFor();assert.equal(writes,2);await page.close()});

test('置顶排序晚到响应不得向锁库后新账户写入旧账户资料',async()=>{const page=await browser.newPage();await register(page);for(const title of ['旧置顶一','旧置顶二']){await create(page,'笔记',{'标题':title,'正文':'正文','标签（逗号分隔）':''});const card=page.locator('.item-card',{hasText:title});await card.getByRole('button',{name:`${title}的更多操作`}).click();await card.getByRole('menuitem',{name:'置顶'}).click();await page.getByText('已置顶',{exact:true}).waitFor()}await page.locator('#menu').click();await page.getByRole('menuitem',{name:'置顶排序'}).click();const order=page.getByRole('dialog',{name:'置顶排序'});let release,seen,writes=0;const held=new Promise(r=>release=r),firstSeen=new Promise(r=>seen=r);await page.route('**/api/entries/*',async route=>{if(route.request().method()!=='PUT'||new URL(route.request().url()).pathname.endsWith('/settings_registry'))return route.continue();writes++;if(writes===1){seen();await held}return route.continue()});await order.getByRole('button',{name:'上移 旧置顶二'}).click();await firstSeen;await page.evaluate(()=>window.__lockVaultForTest());await page.locator('#auth').waitFor({state:'visible'});await page.getByRole('button',{name:'创建新库'}).click();await page.getByLabel('邀请码').fill(TEST_INVITE_CODE);await page.locator('#auth-form input[name="username"]').fill('pin-second'+Date.now());await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'创建并进入'}).click();await page.locator('#vault').waitFor({state:'visible'});release();await page.waitForTimeout(300);assert.equal(writes,1);await create(page,'笔记',{'标题':'新账户资料','正文':'未污染','标签（逗号分隔）':''});assert.equal(await page.locator('.item-card',{hasText:'新账户资料'}).count(),1);assert.equal(await page.locator('.item-card',{hasText:'旧置顶一'}).count(),0);await page.close()});

test('附件重命名晚到响应不得污染锁库后新账户的目标',async()=>{const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();let upload=page.getByRole('dialog',{name:'上传附件'});await upload.locator('input[type=file]').setInputFiles({name:'old-account.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByText('附件已上传',{exact:true}).waitFor();await page.locator('nav').getByRole('button',{name:'附件',exact:true}).click();await page.getByRole('button',{name:'old-account.png',exact:true}).click();await page.locator('#detail').getByRole('button',{name:'重命名'}).click();let dialog=page.getByRole('dialog',{name:'重命名附件'});await dialog.getByLabel('文件名').fill('old-response.png');let release,seen;const held=new Promise(resolve=>{release=resolve}),requestSeen=new Promise(resolve=>{seen=resolve});await page.route('**/api/attachments/*/metadata',async route=>{if(route.request().method()==='PUT'){seen();await held;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'old_attachment',metadata:{version:1,iv:'aXY=',ciphertext:'Y2lwaGVy'},ciphertextSize:16,createdAt:1,updatedAt:2,revision:2})})}await route.continue()});await dialog.getByRole('button',{name:'保存'}).click();await requestSeen;await page.evaluate(()=>window.__lockVaultForTest());await page.getByRole('button',{name:'创建新库'}).click();await page.getByLabel('邀请码').fill(TEST_INVITE_CODE);await page.locator('#auth-form input[name="username"]').fill('rename-second'+Date.now());await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'创建并进入'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();upload=page.getByRole('dialog',{name:'上传附件'});await upload.locator('input[type=file]').setInputFiles({name:'new-account.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByText('附件已上传',{exact:true}).waitFor();await page.locator('nav').getByRole('button',{name:'附件',exact:true}).click();await page.getByRole('button',{name:'new-account.png',exact:true}).click();await page.locator('#detail').getByRole('button',{name:'重命名'}).click();dialog=page.getByRole('dialog',{name:'重命名附件'});const newName=dialog.getByLabel('文件名');await newName.fill('new-draft.png');release();await page.waitForTimeout(200);assert.equal(await dialog.isVisible({timeout:1000}),true);assert.equal(await newName.inputValue({timeout:1000}),'new-draft.png');assert.deepEqual(errors,[]);await page.close()});

test('附件重命名冲突时保留窗口和输入，关闭后加载服务器最新版',async()=>{const page=await browser.newPage();await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传附件'});await upload.locator('input[type=file]').setInputFiles({name:'conflict.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByText('附件已上传',{exact:true}).waitFor();await page.locator('nav').getByRole('button',{name:'附件',exact:true}).click();await page.getByRole('button',{name:'conflict.png',exact:true}).click();await page.locator('#detail').getByRole('button',{name:'重命名'}).click();const dialog=page.getByRole('dialog',{name:'重命名附件'}),name=dialog.getByLabel('文件名');await name.fill('本页未保存.png');let requestBody;const handler=async route=>{if(route.request().method()==='PUT'){requestBody=route.request().postDataJSON();await route.fulfill({status:409,contentType:'application/json',body:'{"error":"conflict","currentRevision":2}'})}else await route.continue()};await page.route('**/api/attachments/*/metadata',handler);await dialog.getByRole('button',{name:'保存'}).click();await dialog.getByRole('alert').getByText('此附件已在其他页面或设备更新，本次重命名尚未保存。').waitFor();assert.equal(requestBody.revision,1);assert.equal(await dialog.isVisible(),true);assert.equal(await name.inputValue(),'本页未保存.png');await page.unroute('**/api/attachments/*/metadata',handler);const refresh=page.waitForRequest(request=>request.method()==='GET'&&new URL(request.url()).pathname==='/api/entries',{timeout:5000});await dialog.getByRole('button',{name:'取消'}).click();await refresh;await page.close()});

test('更多里的全站搜索跨五类本地匹配、排除密码与TOTP密钥并打开对应详情',async()=>{
 for(const engine of [chromium,webkit]){
  const ownBrowser=await engine.launch({headless:true}),page=await ownBrowser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),requests=[];
  page.on('request',request=>requests.push(request.url()));
  try{
   await register(page);
   await create(page,'账号',{'平台':'搜索账号 Alpha','登录网址':'https://alpha.example','账号':'alpha-user','密码':'never-global-secret','备注':'账号备注','标签（逗号分隔）':''});
   await page.getByText('已保存',{exact:true}).waitFor();
   await create(page,'网站',{'名称':'搜索网站 Beta','网址':'https://beta.example','说明':'网站说明','标签（逗号分隔）':''});
   await page.getByText('已保存',{exact:true}).waitFor();
   await create(page,'笔记',{'标题':'搜索笔记 Gamma','正文':'正文检索词 delta-body','标签（逗号分隔）':''});
   await page.getByText('已保存',{exact:true}).waitFor();
   await create(page,'TOTP',{'账号':'搜索验证码 Zeta','密钥':'JBSWY3DPEHPK3PXP','标签（逗号分隔）':'otp-searchable'});
   await page.getByText('已保存',{exact:true}).waitFor();
   await page.getByRole('button',{name:'+ 新建'}).click();
   await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();
   const upload=page.getByRole('dialog',{name:'上传附件'});
   await upload.getByLabel('选择文件').setInputFiles({name:'search-document-epsilon.txt',mimeType:'text/plain',buffer:Buffer.from('attachment body must not be searched')});
   await upload.getByRole('button',{name:'加密并上传'}).click();
   await page.getByText('附件已上传',{exact:true}).waitFor();
   await page.locator('#menu').click();
   await page.getByRole('menuitem',{name:'全站搜索'}).click();
   const dialog=page.getByRole('dialog',{name:'全站搜索'}),input=dialog.getByRole('searchbox',{name:'搜索全部资料'}),results=dialog.locator('#global-search-results');
   await input.fill('delta-body');
   await results.getByRole('button',{name:/搜索笔记 Gamma/}).click();
   await page.locator('#detail').getByRole('heading',{name:'搜索笔记 Gamma'}).waitFor();
   await page.locator('#menu').click();await page.getByRole('menuitem',{name:'全站搜索'}).click();
   await input.fill('epsilon');
   await results.getByRole('button',{name:/search-document-epsilon.txt/}).click();
   await page.locator('#detail').getByRole('heading',{name:'search-document-epsilon.txt'}).waitFor();
   await page.locator('#menu').click();await page.getByRole('menuitem',{name:'全站搜索'}).click();
   await input.fill('otp-searchable');
   await results.getByRole('button',{name:/搜索验证码 Zeta/}).click();
   await page.locator('#detail').getByRole('heading',{name:'搜索验证码 Zeta'}).waitFor();
   await page.locator('#menu').click();await page.getByRole('menuitem',{name:'全站搜索'}).click();
   const before=requests.length;await input.fill('never-global-secret');
   await dialog.getByText('没有找到匹配资料',{exact:true}).waitFor();
   assert.equal(requests.length,before,'输入查询词不得发起网络请求');
   await input.fill('JBSWY3DPEHPK3PXP');await dialog.getByText('没有找到匹配资料',{exact:true}).waitFor();
   const geometry=await dialog.evaluate(el=>{const r=el.getBoundingClientRect(),list=el.querySelector('#global-search-results').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth-innerWidth,left:r.left,right:innerWidth-r.right,listHeight:list.height,inputHeight:el.querySelector('input').getBoundingClientRect().height}});
   assert.ok(geometry.left>=0&&geometry.right>=0);assert.ok(geometry.overflow<=1);assert.ok(geometry.listHeight>0);assert.ok(geometry.inputHeight>=44);
   await input.fill('alpha');await results.getByRole('button',{name:/搜索账号 Alpha/}).waitFor();
   await dialog.getByRole('button',{name:'关闭'}).click();await dialog.waitFor({state:'hidden'});
   await page.locator('#menu').click();await page.getByRole('menuitem',{name:'退出并锁定'}).click();
   await page.locator('#auth').waitFor({state:'visible'});
   const cleared=await page.evaluate(()=>({key:window.__vaultKeyPresent(),query:document.querySelector('#global-search-input').value,text:document.querySelector('#global-search-results').textContent}));
   assert.deepEqual(cleared,{key:false,query:'',text:'输入关键词开始搜索'});
  }finally{await ownBrowser.close()}
 }
});

test('标签拖拽排序经Pointer Events在Chromium与WebKit保存并重载保持',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{const username=await register(page);await page.getByRole('button',{name:'更多'}).click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();const dialog=page.getByRole('dialog',{name:'标签',exact:true});for(const name of ['标签甲','标签乙']){await dialog.getByLabel('新标签名称').fill(name);await dialog.getByRole('button',{name:'新建标签'}).click()}const handle=dialog.getByRole('button',{name:'拖动标签 标签乙'}),target=dialog.locator('.tag-manage-row',{hasText:'标签甲'}),hb=await handle.boundingBox(),tb=await target.boundingBox();assert.ok(hb&&tb);await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(tb.x+tb.width/2,tb.y+2,{steps:5});await page.mouse.up();await page.getByText('标签顺序已保存',{exact:true}).waitFor();assert.deepEqual(await dialog.locator('.tag-manage-row b').allTextContents(),['标签乙','标签甲']);await page.reload();await page.getByLabel('用户名').fill(username);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.getByRole('button',{name:'更多'}).click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();assert.deepEqual(await page.getByRole('dialog',{name:'标签',exact:true}).locator('.tag-manage-row b').allTextContents(),['标签乙','标签甲'])}finally{await page.close();if(engine!==chromium)await own.close()}}});

test('标签颜色排序清理与组合筛选可用',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});try{await register(page);await page.getByRole('button',{name:'更多'}).click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();const dialog=page.getByRole('dialog',{name:'标签',exact:true});await dialog.getByLabel('新标签名称').fill('工作');await dialog.getByRole('button',{name:'新建标签'}).click();await dialog.getByLabel('新标签名称').fill('空标签');await dialog.getByRole('button',{name:'新建标签'}).click();await page.getByRole('button',{name:'管理标签 工作'}).click();await page.locator('#tag-manage-form input[value="blue"]').check();await page.locator('#tag-manage-form').getByRole('button',{name:'保存'}).click();assert.equal(await page.locator('#tag-manage-form input[value="blue"]').isChecked(),true);await page.locator('#tag-manage-dialog').waitFor({state:'hidden'});await page.getByRole('button',{name:'清理未使用标签'}).click();await dialog.getByText('空标签',{exact:true}).waitFor({state:'detached'});assert.equal(await dialog.getByText('空标签',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'管理标签 工作'}).count(),0)}finally{await page.close()}});

test('空标签弹窗移动端保持紧凑并有独立滚动内容区',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();const dialog=page.locator('#tags-dialog'),metrics=await dialog.evaluate(d=>{const h=d.querySelector('.dialog-head'),list=d.querySelector('#tags-list'),title=d.querySelector('h2'),close=d.querySelector('.icon-close'),dr=d.getBoundingClientRect(),hr=h.getBoundingClientRect(),tr=title.getBoundingClientRect(),cr=close.getBoundingClientRect(),ls=getComputedStyle(list);return{height:dr.height,headLeft:hr.left-dr.left,headRight:dr.right-hr.right,titleCenter:tr.top+tr.height/2,closeCenter:cr.top+cr.height/2,listOverflow:ls.overflowY,listMinHeight:parseFloat(ls.minHeight)}});assert.ok(metrics.height<=330,JSON.stringify(metrics));assert.ok(metrics.headLeft<=1&&metrics.headRight<=1,JSON.stringify(metrics));assert.ok(Math.abs(metrics.titleCenter-metrics.closeCenter)<=12,JSON.stringify(metrics));assert.equal(metrics.listOverflow,'auto');assert.ok(metrics.listMinHeight>=0);await page.close()});

test('标签可跨资料改名合并和删除且不改变收藏置顶',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}}),username=await register(page);await create(page,'网站',{'名称':'标签管理网站','网址':'https://manage-tags.example','说明':'','标签（逗号分隔）':'旧标签,合并目标'});await page.locator('.item-card',{hasText:'标签管理网站'}).click();await page.locator('#detail').getByRole('button',{name:'收藏'}).click();await detailAction(page,'置顶');await page.getByRole('button',{name:'返回'}).click();await page.locator('#menu').click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();await page.getByRole('button',{name:'管理标签 旧标签'}).click();const manage=page.getByRole('dialog',{name:'管理标签'});await manage.getByLabel('标签名称').fill('合并目标');await manage.getByRole('button',{name:'保存'}).click();await page.getByRole('dialog',{name:'标签'}).getByRole('button',{name:/合并目标.*1/}).click();await page.getByRole('dialog',{name:'标签：合并目标'}).getByRole('button',{name:/标签管理网站/}).click();await page.locator('#tag-results-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#detail').getByRole('button',{name:'取消收藏'}).count(),1);assert.equal(await detailHasAction(page,'取消置顶'),1);await page.getByRole('button',{name:'返回'}).click();await page.locator('#menu').click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();await page.getByRole('button',{name:'管理标签 合并目标'}).click();await page.getByRole('dialog',{name:'管理标签'}).getByRole('button',{name:'删除标签'}).click();await page.getByRole('dialog',{name:'删除标签？'}).getByRole('button',{name:'确认删除'}).click();await page.locator('#tag-delete-dialog').waitFor({state:'hidden'});await page.locator('#tag-manage-dialog').waitFor({state:'hidden'});assert.equal(await page.getByRole('dialog',{name:'标签'}).getByRole('button',{name:'管理标签 合并目标'}).count(),0);await page.reload();await page.getByLabel('用户名').fill(username);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.locator('nav').getByRole('button',{name:'网站',exact:true}).click();await page.locator('.item-card',{hasText:'标签管理网站'}).click();assert.equal(await page.locator('#detail').getByRole('button',{name:'取消收藏'}).count(),1);assert.equal(await detailHasAction(page,'取消置顶'),1);assert.equal(await page.locator('#detail').getByRole('button',{name:/标签 /}).count(),0);await page.close()});

test('空标签选择器移动端有统一内边距且不接近全屏',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'笔记',exact:true}).click();await page.getByRole('dialog',{name:'新建笔记'}).getByRole('button',{name:'选择标签'}).click();const metrics=await page.locator('#tag-picker-dialog').evaluate(d=>{const head=d.querySelector('.dialog-head'),options=d.querySelector('#tag-picker-options'),form=d.querySelector('#tag-picker-form'),actions=d.querySelector('.dialog-actions'),title=d.querySelector('h2'),close=d.querySelector('.icon-close'),dr=d.getBoundingClientRect(),tr=title.getBoundingClientRect(),cr=close.getBoundingClientRect(),hs=getComputedStyle(head),fs=getComputedStyle(form),as=getComputedStyle(actions),os=getComputedStyle(options);return{height:dr.height,headPadLeft:parseFloat(hs.paddingLeft),headPadRight:parseFloat(hs.paddingRight),formPadLeft:parseFloat(fs.paddingLeft),formPadRight:parseFloat(fs.paddingRight),actionPadRight:parseFloat(as.paddingRight),actionPadBottom:parseFloat(as.paddingBottom),titleCenter:tr.top+tr.height/2,closeCenter:cr.top+cr.height/2,formColumns:fs.gridTemplateColumns,optionsOverflow:os.overflowY}});assert.ok(metrics.height<=430,JSON.stringify(metrics));for(const n of ['headPadLeft','headPadRight'])assert.ok(metrics[n]>=16,JSON.stringify(metrics));for(const n of ['formPadLeft','formPadRight','actionPadRight','actionPadBottom'])assert.ok(metrics[n]>=13,JSON.stringify(metrics));assert.ok(Math.abs(metrics.titleCenter-metrics.closeCenter)<=12,JSON.stringify(metrics));assert.equal(metrics.optionsOverflow,'auto');assert.ok(metrics.formColumns.split(' ').length<=2);await page.close()});

test('WebKit真机式视口标签弹窗按内容高度收缩',async()=>{const own=await webkit.launch({headless:true}),page=await own.newPage({...devices['iPhone 13']});const settledGeometry=async selector=>{await page.locator(selector).waitFor();await page.waitForFunction(value=>{const dialog=document.querySelector(value);return dialog&&dialog.open&&dialog.getAnimations().every(animation=>animation.playState==='finished')},selector);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.locator(selector).evaluate(d=>{const natural=[...d.children].reduce((sum,node)=>{const style=getComputedStyle(node);return sum+node.offsetHeight+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0)},0),cap=Math.max(240,innerHeight-24);return{height:d.getBoundingClientRect().height,natural,expected:Math.min(Math.ceil(natural),cap),inline:d.style.height,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}})};try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'网站',exact:true}).click();const editor=page.getByRole('dialog',{name:'新建网站'});await editor.getByRole('button',{name:'选择标签'}).click();let g=await settledGeometry('#tag-picker-dialog');assert.ok(g.height<430&&Math.abs(g.height-g.expected)<=1&&g.overflow===0,JSON.stringify(g));await page.locator('#tag-picker-dialog [data-close="tag-picker-dialog"]').click();await editor.locator('.icon-close').click();await page.locator('#menu').click();await page.locator('#tags-open').click();g=await settledGeometry('#tags-dialog');assert.ok(g.height<360&&Math.abs(g.height-g.expected)<=1&&g.overflow===0,JSON.stringify(g))}finally{await page.close();await own.close()}});
test('三个标签弹窗移动端布局紧凑统一且不重复文字',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'网站',exact:true}).click();const editor=page.getByRole('dialog',{name:'新建网站'});await editor.getByLabel('名称',{exact:true}).fill('布局网站');await editor.getByLabel('网址',{exact:true}).fill('https://layout.example');await editor.getByRole('button',{name:'选择标签'}).click();const picker=page.locator('#tag-picker-dialog');await picker.getByLabel('新标签名称').fill('布局');await picker.getByRole('button',{name:'添加标签'}).click();let g=await picker.evaluate(d=>{const form=d.querySelector('#tag-picker-form'),done=d.querySelector('.dialog-actions button'),dr=d.getBoundingClientRect(),fr=form.getBoundingClientRect(),br=done.getBoundingClientRect();return{h:dr.height,inlineHeight:d.style.height,natural:[...d.children].reduce((sum,x)=>sum+x.offsetHeight,0),formCols:getComputedStyle(form).gridTemplateColumns.split(' ').length,doneWidth:br.width,inner:dr.width-28,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}});assert.ok(g.h<500&&Math.abs(g.h-g.natural)<=3&&g.formCols===2&&g.doneWidth>=g.inner-2&&g.overflow===0,JSON.stringify(g));await picker.getByRole('button',{name:'完成'}).click();await editor.getByRole('button',{name:'保存'}).click();await page.getByText('已保存',{exact:true}).waitFor();await page.locator('#menu').click();await page.locator('#tags-open').click();const tags=page.locator('#tags-dialog');assert.equal(await tags.getByText('布局',{exact:true}).count(),1);g=await tags.evaluate(d=>{const row=d.querySelector('.tag-manage-row'),menu=d.querySelector('.tag-manage-button'),r=row.getBoundingClientRect(),m=menu.getBoundingClientRect();return{rowHeight:r.height,menuWidth:m.width,menuHeight:m.height,align:getComputedStyle(row).alignItems}});assert.ok(g.rowHeight<=80&&g.menuWidth>=43&&g.menuHeight>=43&&g.align==='center',JSON.stringify(g));await tags.getByRole('button',{name:'管理标签 布局'}).click();const manage=page.locator('#tag-manage-dialog');g=await manage.evaluate(d=>{const form=d.querySelector('form'),r=d.getBoundingClientRect(),f=form.getBoundingClientRect(),buttons=[...d.querySelectorAll('.split-actions button')].map(b=>b.getBoundingClientRect().height);return{h:r.height,padLeft:f.left-r.left,buttons}});assert.ok(g.h<500&&g.buttons.every(x=>x>=40),JSON.stringify(g));await page.close()});
test('更多标签可新建未使用标签并在重登后选择',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}}),username=await register(page);await page.locator('#menu').click();await page.locator('#tags-open').click();const dialog=page.getByRole('dialog',{name:'标签',exact:true});await dialog.getByLabel('新标签名称').fill('稍后处理');await dialog.getByRole('button',{name:'新建标签'}).click();await dialog.getByText('稍后处理',{exact:true}).waitFor();await page.reload();await page.getByLabel('用户名').fill(username);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('[data-new="website"]').click();await page.getByRole('button',{name:'选择标签',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'选择标签'}).getByText('稍后处理',{exact:true}).count(),1);await page.close()});
test('完整标签系统使用自有多选并跨五类筛选',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}}),username=await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'笔记',exact:true}).click();const editor=page.getByRole('dialog',{name:'新建笔记'});assert.equal(await editor.getByLabel('标签（逗号分隔）').count(),0);await editor.getByLabel('标题',{exact:true}).fill('标签测试笔记');await editor.getByLabel('正文').fill('正文');await editor.getByRole('button',{name:'选择标签'}).click();const picker=page.getByRole('dialog',{name:'选择标签'});await picker.getByLabel('新标签名称').fill('重要');await picker.getByRole('button',{name:'添加标签'}).click();await picker.getByLabel('新标签名称').fill('待处理');await picker.getByRole('button',{name:'添加标签'}).click();await picker.getByRole('button',{name:'完成'}).click();await editor.getByRole('button',{name:'保存'}).click();await page.getByText('已保存',{exact:true}).waitFor();await page.locator('.item-card',{hasText:'标签测试笔记'}).click();assert.equal(await page.locator('#detail').getByRole('button',{name:'标签 重要'}).count(),1);assert.equal(await page.locator('#detail').getByRole('button',{name:'标签 待处理'}).count(),1);await page.getByRole('button',{name:'返回'}).click();await page.locator('#menu').click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();const tags=page.getByRole('dialog',{name:'标签'});await tags.getByRole('button',{name:/重要.*1/}).click();const resultDialog=page.getByRole('dialog',{name:'标签：重要'});await resultDialog.waitFor({state:'visible'});assert.equal(await resultDialog.getByRole('button',{name:/标签测试笔记/}).count(),1);await page.reload();await page.getByLabel('用户名').fill(username);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'标签'}).getByRole('button',{name:/重要.*1/}).count(),1);await page.close()});

test('附件标签加密持久化并可从标签结果打开',async()=>{const page=await browser.newPage(),username=await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传附件'});await upload.locator('input[type=file]').setInputFiles({name:'tagged.txt',mimeType:'text/plain',buffer:Buffer.from('tagged')});await upload.getByRole('button',{name:'选择标签'}).click();const picker=page.getByRole('dialog',{name:'选择标签'});await picker.getByLabel('新标签名称').fill('附件资料');await picker.getByRole('button',{name:'添加标签'}).click();await picker.getByRole('button',{name:'完成'}).click();await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByText('附件已上传',{exact:true}).waitFor();await page.reload();await page.getByLabel('用户名').fill(username);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();await page.getByRole('dialog',{name:'标签'}).getByRole('button',{name:/附件资料.*1/}).click();await page.getByRole('dialog',{name:'标签：附件资料'}).getByRole('button',{name:/tagged.txt/}).click();await page.locator('#tag-results-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#detail').getByRole('button',{name:'重命名'}).count(),1);await page.close()});

test('WebKit 移动端标签多选和跨分类入口可用',async()=>{const own=await webkit.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'网站',exact:true}).click();const editor=page.getByRole('dialog',{name:'新建网站'});await editor.getByLabel('名称').fill('WebKit标签网站');await editor.getByLabel('网址').fill('https://webkit-tags.example');await editor.getByLabel('说明').fill('');await editor.getByRole('button',{name:'选择标签'}).click();const picker=page.getByRole('dialog',{name:'选择标签'});await picker.getByLabel('新标签名称').fill('Safari');await picker.getByRole('button',{name:'添加标签'}).click();await picker.getByRole('button',{name:'完成'}).click();await editor.getByRole('button',{name:'保存'}).click();await editor.waitFor({state:'hidden'});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'标签',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'标签'}).getByRole('button',{name:/Safari.*1/}).count(),1)}finally{await own.close()}});

test('收藏夹标题获得初始焦点但不显示蓝色焦点框',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await page.getByRole('button',{name:'打开收藏夹'}).click();const title=page.locator('#favorites-title');assert.equal(await title.evaluate(e=>document.activeElement===e),true);const style=await title.evaluate(e=>{const s=getComputedStyle(e);return{outline:s.outlineStyle,shadow:s.boxShadow}});assert.equal(style.outline,'none');assert.equal(style.shadow,'none');await page.close()});

test('独立收藏夹跨五类聚合且不改变置顶状态',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});const username=await register(page);
 await create(page,'笔记',{'标题':'收藏测试笔记','正文':'正文','标签（逗号分隔）':''});
 const card=page.locator('.item-card',{hasText:'收藏测试笔记'});await card.click();const detail=page.locator('#detail');
 await detail.getByRole('button',{name:'收藏'}).click();await page.getByText('已收藏',{exact:true}).waitFor();
 assert.equal(await detailHasAction(page,'置顶'),1,'收藏后仍应独立提供置顶操作');
 await page.getByRole('button',{name:'返回'}).click();assert.equal(await card.locator('.favorite-badge').count(),1);assert.equal(await card.locator('.pin-badge').count(),0);
 await page.reload();await page.getByLabel('用户名').fill(username);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});
 await page.getByRole('button',{name:'打开收藏夹'}).click();const favorites=page.getByRole('dialog',{name:'收藏夹'});await favorites.getByRole('button',{name:/收藏测试笔记/}).click();
 await detailAction(page,'置顶');await page.getByText('已置顶',{exact:true}).waitFor();assert.equal(await detail.getByRole('button',{name:'取消收藏'}).count(),1);
 await detail.getByRole('button',{name:'取消收藏'}).click();await page.getByText('已取消收藏',{exact:true}).waitFor();assert.equal(await detailHasAction(page,'取消置顶'),1,'取消收藏不得取消置顶');
 await page.getByRole('button',{name:'打开收藏夹'}).click();await favorites.getByText('还没有收藏资料',{exact:true}).waitFor();await page.close()
});

test('附件收藏加密持久化并在重登后保留',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}}),username=await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传附件'});await upload.locator('input[type=file]').setInputFiles({name:'favorite-attachment.txt',mimeType:'text/plain',buffer:Buffer.from('favorite')});await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByText('附件已上传',{exact:true}).waitFor();await page.locator('.attachment-card',{hasText:'favorite-attachment.txt'}).click();await page.locator('#detail').getByRole('button',{name:'收藏'}).click();await page.getByText('已收藏',{exact:true}).waitFor();await page.reload();await page.getByLabel('用户名').fill(username);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.getByRole('button',{name:'打开收藏夹'}).click();await page.getByRole('dialog',{name:'收藏夹'}).getByRole('button',{name:/favorite-attachment.txt/}).waitFor();await page.close()});

test('WebKit 移动端收藏夹可打开并保留独立置顶按钮',async()=>{const own=await webkit.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{await register(page);await create(page,'网站',{'名称':'WebKit收藏网站','网址':'https://example.com','说明':'','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'WebKit收藏网站'}).click();await page.locator('#detail').getByRole('button',{name:'收藏'}).click();await page.getByText('已收藏',{exact:true}).waitFor();assert.equal(await detailHasAction(page,'置顶'),1);await page.getByRole('button',{name:'返回'}).click();await page.getByRole('button',{name:'打开收藏夹'}).click();await page.getByRole('dialog',{name:'收藏夹'}).getByRole('button',{name:/WebKit收藏网站/}).click();await page.locator('#detail').waitFor({state:'visible'});assert.equal(await page.locator('#detail').getByRole('button',{name:'取消收藏'}).count(),1)}finally{await own.close()}});

test('WebKit 网站新建与列表菜单编辑保存不把 null 当作当前详情', async()=>{
 const safari=await webkit.launch({headless:true});
 const context=await safari.newContext({...devices['iPhone 13']});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 try {
  await register(page);
  await create(page,'网站',{'名称':'Safari One','网址':'https://one.example','说明':'one','标签（逗号分隔）':''});
  await page.getByText('已保存',{exact:true}).waitFor();
  await create(page,'网站',{'名称':'Safari Two','网址':'https://two.example','说明':'two','标签（逗号分隔）':''});
  await page.getByText('已保存',{exact:true}).waitFor();
  const card=page.locator('.item-card',{hasText:'Safari One'});
  await card.getByRole('button',{name:'Safari One的更多操作'}).click();
  await card.getByRole('menuitem',{name:'编辑'}).click();
  const editor=page.locator('#editor');await editor.getByLabel('名称').fill('Safari One Edited');await editor.getByRole('button',{name:'保存'}).click();
  await page.getByText('已保存',{exact:true}).waitFor();
  assert.deepEqual(await page.locator('.item-card b').allTextContents(),['Safari One Edited','Safari Two']);
  assert.deepEqual(errors,[]);
 } finally {await context.close();await safari.close()}
});

test('旧版 iPhone Safari 无 crypto.randomUUID 仍可保存笔记', async()=>{
 const safari=await webkit.launch({headless:true});
 const context=await safari.newContext({...devices['iPhone 13']});
 await context.addInitScript(()=>{Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true})});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(base);await page.getByRole('button',{name:'创建新库'}).click();await page.getByLabel('邀请码').fill(TEST_INVITE_CODE);
  await page.locator('#auth-form input[name=username]').fill('iphone'+Date.now());await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');
  await page.getByRole('button',{name:'创建并进入'}).click();await page.locator('#vault').waitFor({state:'visible'});
  await create(page,'笔记',{'标题':'测试','正文':'测试','标签（逗号分隔）':'测试'});
  await page.locator('.item-card',{hasText:'测试'}).click();
  assert.match(await page.locator('#detail').textContent(),/标题测试.*正文测试.*标签测试/s);
  assert.deepEqual(errors,[]);
 } finally {await context.close();await safari.close()}
});

test('三类字段隔离、当前分类搜索、编辑锁类型、危险区删除与备份', async()=>{
 const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));
 await register(page);
 await page.getByRole('button',{name:'+ 新建'}).click();
 await page.locator('#picker').getByRole('button',{name:'网站',exact:true}).click();
 const editor=page.locator('#editor');
 assert.deepEqual(await page.locator('#fields label:not(.group-picker-label)').allTextContents(),['名称','网址','说明']);assert.equal(await page.locator('#fields .tag-select .field-label').textContent(),'标签');
 assert.equal(await page.locator('#fields .group-picker-label').textContent(),'分组');
 assert.equal(await page.locator('#fields .group-picker-trigger').textContent(),'默认');
 assert.equal(await editor.getByLabel('账号',{exact:true}).count(),0); assert.equal(await editor.getByLabel('密码',{exact:true}).count(),0);
 await editor.getByLabel('名称',{exact:true}).fill('Example');await page.getByLabel('网址',{exact:true}).fill('https://example.com');await page.getByRole('button',{name:'保存'}).click();
 await create(page,'笔记',{'标题':'购物清单','正文':'牛奶','标签（逗号分隔）':'生活'});
 await page.locator('nav').getByRole('button',{name:'网站',exact:true}).click();await page.getByPlaceholder('搜索当前分类').fill('牛奶');assert.equal(await page.locator('.item-card').count(),0);
 await page.getByPlaceholder('搜索当前分类').fill('example');assert.equal(await page.locator('.item-card').count(),1);await page.locator('.item-card').click();await page.getByRole('button',{name:'编辑'}).click();
 assert.equal(await page.locator('#editor button[data-type], #editor select[name="type"], #editor input[name="type"]').count(),0);
 assert.equal(await page.getByRole('button',{name:'删除此条目'}).count(),1);
 await page.getByRole('button',{name:'取消'}).click();
 await page.locator('#editor').waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'删除此条目'}).isVisible(),false);
 await page.locator('#menu').click();
 assert.equal(await page.locator('#menu-panel').getByRole('menuitem').count(),16);assert.equal(await page.getByRole('menuitem',{name:'全站搜索'}).count(),1);assert.equal(await page.getByRole('menuitem',{name:'自定义资料'}).count(),1);assert.equal(await page.getByRole('menuitem',{name:'标签',exact:true}).count(),1);assert.equal(await page.getByRole('menuitem',{name:'恢复中心'}).count(),1);assert.equal(await page.getByRole('menuitem',{name:'批量设置分组'}).count(),1);
 await page.screenshot({path:'artifacts/desktop-1440.png',fullPage:true});assert.deepEqual(errors,[]);await page.close();
});

test('从笔记新建账号后，列表分类与顶部菜单同步切换到账号',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await page.locator('nav').getByRole('button',{name:'笔记',exact:true}).click();await create(page,'账号',{'平台':'同步测试账号','登录网址':'https://sync.example','账号':'alice','密码':'secret','备注':'','标签（逗号分隔）':''});await page.getByText('已保存',{exact:true}).waitFor();assert.equal(await page.locator('nav [data-type="account"]').getAttribute('aria-current'),'page');assert.equal(await page.locator('nav [data-type="note"]').getAttribute('aria-current'),'false');assert.equal(await page.locator('.item-card',{hasText:'同步测试账号'}).count(),1);await page.close();
});

test('320/768/1440 响应式、手机全屏详情、键盘可达',async()=>{
 for(const width of [320,768,1440]){const page=await browser.newPage({viewport:{width,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await register(page);await create(page,'账号',{'平台':'GitHub','登录网址':'https://github.com','账号':'alice','密码':'secret','备注':'工作','标签（逗号分隔）':'开发'});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);assert.equal(overflow,false);
 const layout=await page.locator('.item-card').evaluate(card=>{const content=card.querySelector('.item-content'),actions=card.querySelector('.item-actions'),more=card.querySelector('.item-more'),cs=getComputedStyle(card),ccs=getComputedStyle(content),acs=getComputedStyle(actions),cr=card.getBoundingClientRect(),rr=more.getBoundingClientRect();return{direction:cs.flexDirection,width:cr.width,parentWidth:card.parentElement.clientWidth-parseFloat(getComputedStyle(card.parentElement).paddingLeft)-parseFloat(getComputedStyle(card.parentElement).paddingRight),contentDirection:ccs.flexDirection,contentAlign:ccs.alignItems,contentFlex:ccs.flexGrow,contentMinWidth:ccs.minWidth,actionsWidth:acs.width,moreRight:rr.right,cardRight:cr.right}});
 assert.equal(layout.direction,'row');assert.ok(Math.abs(layout.width-layout.parentWidth)<1);assert.equal(layout.contentDirection,'column');assert.equal(layout.contentAlign,'flex-start');assert.equal(layout.contentFlex,'1');assert.equal(layout.contentMinWidth,'0px');assert.ok(parseFloat(layout.actionsWidth)>=40&&parseFloat(layout.actionsWidth)<=44);assert.ok(layout.moreRight<=layout.cardRight&&layout.cardRight-layout.moreRight<16);
 await page.getByRole('button',{name:'+ 新建'}).focus();await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'BODY');
 await page.locator('.item-card').click();const pos=await page.locator('#detail').evaluate(e=>getComputedStyle(e).position);assert.equal(pos,'static');
 await page.screenshot({path:`artifacts/layout-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();}
});

test('WebKit iPhone 长列表的顶部、中部和末行菜单始终在视口内且可点击',async()=>{
 const safari=await webkit.launch({headless:true});const context=await safari.newContext({...devices['iPhone 13']});const page=await context.newPage();
 try{await register(page);for(let i=1;i<=12;i++){await create(page,'网站',{'名称':`长列表网站 ${String(i).padStart(2,'0')}`,'网址':`https://site-${i}.example`,'说明':'移动菜单回归','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:`长列表网站 ${String(i).padStart(2,'0')}`}).waitFor()}
  const currentCard=async index=>{let last;for(let attempt=0;attempt<4;attempt++){const card=page.locator('.item-card').nth(index);try{await card.waitFor({state:'visible'});await card.scrollIntoViewIfNeeded();return card}catch(error){last=error;if(!/not attached|detached/i.test(String(error)))throw error;await page.waitForTimeout(50)}}throw last};
  const evidence=[];for(const index of [0,5,11]){const card=await currentCard(index),more=card.getByRole('button',{name:/的更多操作/});await more.click();const menu=card.getByRole('menu');const state=await menu.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),card=el.closest('.item-card'),list=el.closest('#list'),collection=el.closest('.collection');return{rect:{top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height},hidden:el.hidden,display:s.display,visibility:s.visibility,position:s.position,zIndex:s.zIndex,viewport:{width:innerWidth,height:innerHeight},overflow:{card:getComputedStyle(card).overflow,list:getComputedStyle(list).overflow,collection:getComputedStyle(collection).overflow},documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}});evidence.push({index,...state});assert.equal(state.hidden,false);assert.ok(state.rect.top>=0&&state.rect.bottom<=state.viewport.height,JSON.stringify(state));assert.ok(state.rect.left>=0&&state.rect.right<=state.viewport.width,JSON.stringify(state));assert.equal(state.documentOverflow,false);await menu.getByRole('menuitem',{name:'编辑'}).click();assert.equal(await page.locator('#editor').isVisible(),true);await page.locator('#editor').getByRole('button',{name:'取消'}).click();await page.locator('#editor').waitFor({state:'hidden'})}
  await page.screenshot({path:'artifacts/mobile-overflow-menu-webkit.png',fullPage:false});console.log('MOBILE_MENU_EVIDENCE '+JSON.stringify(evidence));
 }finally{await context.close();await safari.close()}
});

test('列表更多操作不冒泡，可取消并支持外部点击与 Escape 关闭',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:800}});await register(page);await create(page,'笔记',{'标题':'待删除笔记','正文':'正文','标签（逗号分隔）':''});
 const card=page.locator('.item-card',{hasText:'待删除笔记'}),more=card.getByRole('button',{name:'待删除笔记的更多操作'});
 await more.click();assert.equal(await page.locator('#detail').getByText('待删除笔记').count(),0);assert.equal(await page.getByRole('menuitem',{name:'编辑'}).isVisible(),true);
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('menuitem',{name:'编辑'}).isVisible(),false);
 await more.click();await page.locator('.collection').click({position:{x:2,y:2}});assert.equal(await page.getByRole('menuitem',{name:'编辑'}).isVisible(),false);
 await more.click();await page.getByRole('menuitem',{name:'删除'}).click();assert.match(await page.getByRole('dialog',{name:'确认删除'}).textContent(),/待删除笔记/);
 await page.getByRole('button',{name:'取消删除'}).click();assert.equal(await card.count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);await page.close();
});

test('软删除资料从最近查看、置顶排序、当前分类搜索和全站搜索同时排除',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await create(page,'笔记',{'标题':'四处过滤目标','正文':'唯一过滤词 trash-filter-key','标签（逗号分隔）':''});await page.getByText('已保存',{exact:true}).waitFor();const card=page.locator('.item-card',{hasText:'四处过滤目标'});await card.click();await detailAction(page,'置顶');await page.getByText('已置顶',{exact:true}).waitFor();await page.locator('#detail .mobile-back').click();assert.equal(await page.locator('.recents').getByRole('button',{name:/四处过滤目标/}).count(),1);await page.getByPlaceholder('搜索当前分类').fill('trash-filter-key');assert.equal(await card.count(),1);await page.getByPlaceholder('搜索当前分类').fill('');await card.getByRole('button',{name:'四处过滤目标的更多操作'}).click();await card.getByRole('menuitem',{name:'删除'}).click();await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor();assert.equal(await page.locator('.recents').getByRole('button',{name:/四处过滤目标/}).count(),0);await page.getByPlaceholder('搜索当前分类').fill('trash-filter-key');assert.equal(await card.count(),0);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'置顶排序'}).click();const pins=page.getByRole('dialog',{name:'置顶排序'});assert.doesNotMatch(await pins.textContent(),/四处过滤目标/);await pins.getByRole('button',{name:'关闭'}).click();await page.locator('#menu').click();await page.getByRole('menuitem',{name:'全站搜索'}).click();const global=page.getByRole('dialog',{name:'全站搜索'});await global.getByRole('searchbox').fill('trash-filter-key');await global.getByText('没有找到匹配资料',{exact:true}).waitFor();await global.getByRole('button',{name:'关闭'}).click();await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();assert.equal(await page.getByRole('dialog',{name:'恢复中心'}).locator('.trash-item',{hasText:'四处过滤目标'}).count(),1);await page.close()});

test('回收站软删除隐藏资料并可恢复，操作不调用永久删除 API',async()=>{for(const engine of [chromium,webkit]){const ownBrowser=await engine.launch({headless:true});try{const page=await ownBrowser.newPage({viewport:{width:390,height:844}});await register(page);await create(page,'笔记',{'标题':'可恢复笔记','正文':'回收站正文','标签（逗号分隔）':''});let deleteCalls=0;page.on('request',request=>{if(request.method()==='DELETE'&&request.url().includes('/api/entries/'))deleteCalls++});await page.getByRole('button',{name:'可恢复笔记的更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'删除'}).click();assert.match(await page.getByRole('dialog',{name:'确认删除'}).textContent(),/移入回收站/);await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor();assert.equal(deleteCalls,0);assert.equal(await page.locator('.item-card',{hasText:'可恢复笔记'}).count(),0);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();const trash=page.getByRole('dialog',{name:'恢复中心'}),row=trash.locator('.trash-item',{hasText:'可恢复笔记'});assert.equal(await row.count(),1);assert.match(await row.textContent(),/笔记/);await row.getByRole('button',{name:'恢复 可恢复笔记'}).click();await page.getByText('已恢复',{exact:true}).waitFor();assert.equal(await row.count(),0);await trash.getByRole('button',{name:'关闭'}).click();await page.getByRole('button',{name:'笔记',exact:true}).click();assert.equal(await page.locator('.item-card',{hasText:'可恢复笔记'}).count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false)}finally{await ownBrowser.close()}}});

test('回收站恢复遇到一次 revision 冲突时同步最新版并安全完成恢复',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});try{await register(page);await create(page,'笔记',{'标题':'恢复冲突资料','正文':'服务器最新版正文','标签（逗号分隔）':''});await page.getByRole('button',{name:'恢复冲突资料的更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'删除'}).click();await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor();let conflicts=0,reloads=0,puts=0;page.on('request',request=>{if(request.method()==='GET'&&request.url().endsWith('/api/entries'))reloads++;if(request.method()==='PUT'&&/\/api\/entries\//.test(request.url()))puts++});await page.route('**/api/entries/*',async route=>{if(route.request().method()==='PUT'&&!conflicts){conflicts++;return route.fulfill({status:409,contentType:'application/json',body:'{"error":"conflict","currentRevision":99}'})}await route.continue()});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();const trash=page.getByRole('dialog',{name:'恢复中心'}),row=trash.locator('.trash-item',{hasText:'恢复冲突资料'});await row.getByRole('button',{name:'恢复 恢复冲突资料'}).click();await page.getByText('已恢复',{exact:true}).waitFor();assert.equal(conflicts,1);assert.equal(reloads,1);assert.equal(puts,2);assert.equal(await row.count(),0)}finally{await page.close()}});

test('删除笔记时关联附件同批进入回收站并随笔记恢复',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await create(page,'笔记',{'标题':'附件联动笔记','正文':'正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'附件联动笔记'}).click();await page.locator('#detail').getByRole('button',{name:'编辑'}).click();const editor=page.locator('#editor');await editor.getByLabel('添加图片').setInputFiles({name:'linked-trash.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await editor.getByRole('button',{name:'保存'}).click();await page.locator('#detail img[alt="linked-trash.png"]').waitFor();await detailAction(page,'删除');await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor();await page.getByRole('button',{name:'附件',exact:true}).click();assert.equal(await page.getByRole('button',{name:'linked-trash.png',exact:true}).count(),0);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();const trash=page.getByRole('dialog',{name:'恢复中心'});assert.equal(await trash.locator('.trash-item[data-trash-type="note"]',{hasText:'附件联动笔记'}).count(),1);assert.equal(await trash.locator('.trash-item[data-trash-type="attachment"]',{hasText:'linked-trash.png'}).count(),1);await trash.getByRole('button',{name:'恢复 附件联动笔记'}).click();await page.getByText('已恢复',{exact:true}).waitFor();assert.equal(await trash.locator('.trash-item',{hasText:'linked-trash.png'}).count(),0);await trash.getByRole('button',{name:'关闭'}).click();await page.getByRole('button',{name:'附件',exact:true}).click();assert.equal(await page.getByRole('button',{name:'linked-trash.png',exact:true}).count(),1);await page.close()});

test('锁定时关闭回收站危险确认并清除解密标题，320px 无横向溢出',async()=>{const page=await browser.newPage({viewport:{width:320,height:700}});await register(page);await create(page,'笔记',{'标题':'锁定前敏感回收站标题很长很长很长','正文':'秘密正文','标签（逗号分隔）':''});await page.getByRole('button',{name:'锁定前敏感回收站标题很长很长很长的更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'删除'}).click();await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor();await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();const trash=page.getByRole('dialog',{name:'恢复中心'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);await trash.getByRole('button',{name:/彻底删除 锁定前敏感/}).click();await page.evaluate(()=>window.__lastActivityAt(Date.now()-600000));await page.evaluate(()=>window.__checkIdleDeadline());await page.locator('#auth').waitFor({state:'visible'});assert.equal(await page.locator('#trash-delete-dialog').evaluate(el=>el.open),false);assert.equal(await page.locator('#trash-delete-name').textContent(),'');assert.doesNotMatch(await page.locator('#trash-list').textContent(),/锁定前敏感|秘密正文/);await page.close()});

test('回收站危险确认弹窗在 Chromium/WebKit 手机宽度保持内边距、等宽操作和安全边界',async()=>{for(const engine of [chromium,webkit])for(const width of [320,390,430]){const b=await engine.launch({headless:true}),page=await b.newPage({viewport:{width,height:760}});try{await register(page);await create(page,'笔记',{'标题':'超长确认名称用于验证手机危险弹窗不会贴边或横向溢出','正文':'正文','标签（逗号分隔）':''});await page.getByRole('button',{name:'超长确认名称用于验证手机危险弹窗不会贴边或横向溢出的更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'删除'}).click();await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor();await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();await page.locator('#trash-list .trash-item').getByRole('button',{name:/彻底删除/}).click();await page.locator('#trash-delete-dialog').evaluate(async dialog=>{await Promise.all(dialog.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})))});for(const id of ['trash-delete-dialog']){const geometry=await page.locator(`#${id}`).evaluate(dialog=>{const form=dialog.querySelector('form'),actions=form.querySelector('.dialog-actions'),buttons=[...actions.querySelectorAll('button')],dr=dialog.getBoundingClientRect(),fr=form.getBoundingClientRect(),ar=actions.getBoundingClientRect(),br=buttons.map(x=>x.getBoundingClientRect()),fs=getComputedStyle(form),as=getComputedStyle(actions);return{dialogLeft:dr.left,dialogRight:dr.right,viewport:innerWidth,formLeft:fr.left,formRight:fr.right,paddingLeft:parseFloat(fs.paddingLeft),paddingRight:parseFloat(fs.paddingRight),columns:as.gridTemplateColumns,gap:parseFloat(as.gap),actionsLeft:ar.left,actionsRight:ar.right,buttons:br.map((x,i)=>({left:x.left,right:x.right,height:x.height,width:x.width,minHeight:parseFloat(getComputedStyle(buttons[i]).minHeight)})),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}});assert.ok(geometry.dialogLeft>=8);assert.ok(geometry.viewport-geometry.dialogRight>=8);assert.ok(geometry.paddingLeft>=15.5&&geometry.paddingRight>=15.5);assert.equal(geometry.overflow,false);assert.ok(geometry.gap>=8);assert.ok(geometry.actionsLeft-geometry.formLeft>=15.5);assert.ok(geometry.formRight-geometry.actionsRight>=15.5);assert.equal(geometry.buttons.length,2);assert.ok(geometry.buttons.every(x=>x.height>=43.5&&x.minHeight>=44));assert.ok(Math.abs(geometry.buttons[0].width-geometry.buttons[1].width)<1);assert.ok(geometry.buttons[0].left>=geometry.formLeft+15.5);assert.ok(geometry.buttons[1].right<=geometry.formRight-15.5)}await page.locator('#trash-delete-dialog [data-close="trash-delete-dialog"]').click();await page.getByRole('button',{name:'清空恢复中心'}).click();await page.locator('#trash-empty-dialog').waitFor({state:'visible'});await page.locator('#trash-empty-dialog').evaluate(async dialog=>{await Promise.all(dialog.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})))});const empty=await page.locator('#trash-empty-dialog').evaluate(dialog=>{const form=dialog.querySelector('form'),buttons=[...form.querySelectorAll('.dialog-actions button')],dr=dialog.getBoundingClientRect(),fr=form.getBoundingClientRect(),br=buttons.map(x=>x.getBoundingClientRect()),fs=getComputedStyle(form);return{left:dr.left,right:dr.right,viewport:innerWidth,paddingLeft:parseFloat(fs.paddingLeft),paddingRight:parseFloat(fs.paddingRight),buttons:br.map((x,i)=>({left:x.left,right:x.right,height:x.height,width:x.width,minHeight:parseFloat(getComputedStyle(buttons[i]).minHeight)})),formLeft:fr.left,formRight:fr.right}});assert.ok(empty.left>=8&&empty.viewport-empty.right>=8);assert.ok(empty.paddingLeft>=15.5&&empty.paddingRight>=15.5);assert.ok(empty.buttons.every(x=>x.height>=43.5&&x.minHeight>=44),JSON.stringify(empty));assert.ok(Math.abs(empty.buttons[0].width-empty.buttons[1].width)<1);assert.ok(empty.buttons[0].left>=empty.formLeft+15.5&&empty.buttons[1].right<=empty.formRight-15.5)}finally{await b.close()}}});

test('父笔记彻底删除后附件失败时转为独立回收站项并可重试',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await create(page,'笔记',{'标题':'部分清理笔记','正文':'正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'部分清理笔记'}).click();await page.locator('#detail').getByRole('button',{name:'编辑'}).click();const editor=page.locator('#editor');await editor.getByLabel('添加图片').setInputFiles({name:'retry-linked.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await editor.getByRole('button',{name:'保存'}).click();await page.locator('#detail img[alt="retry-linked.png"]').waitFor();await detailAction(page,'删除');await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor();await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();const trash=page.getByRole('dialog',{name:'恢复中心'});await trash.getByRole('button',{name:'彻底删除 部分清理笔记'}).click();await page.route('**/api/attachments/*',route=>route.request().method()==='DELETE'?route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal_error"}'}):route.continue());await page.getByRole('dialog',{name:'确认彻底删除'}).getByRole('button',{name:'彻底删除'}).click();await page.locator('#toast').getByText(/关联附件未全部删除/).waitFor();assert.equal(await page.locator('#trash-delete-dialog').evaluate(el=>el.open),false);assert.equal(await trash.locator('.trash-item[data-trash-type="note"]',{hasText:'部分清理笔记'}).count(),0);const attachment=trash.locator('.trash-item[data-trash-type="attachment"]',{hasText:'retry-linked.png'});assert.equal(await attachment.count(),1);assert.equal(await attachment.getByRole('button',{name:'彻底删除 retry-linked.png'}).count(),1);await page.unroute('**/api/attachments/*');await attachment.getByRole('button',{name:'彻底删除 retry-linked.png'}).click();await page.getByRole('dialog',{name:'确认彻底删除'}).getByRole('button',{name:'彻底删除'}).click();await page.getByText('已彻底删除',{exact:true}).waitFor();assert.equal(await attachment.count(),0);await page.close()});

test('回收站彻底删除附件才调用 DELETE 并清除密文对象',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传附件'});await upload.getByLabel('选择文件').setInputFiles({name:'trash-proof.txt',mimeType:'text/plain',buffer:Buffer.from('recoverable encrypted attachment')});const uploaded=page.waitForResponse(response=>response.request().method()==='POST'&&/\/api\/attachments\//.test(response.url()));await upload.getByRole('button',{name:'加密并上传'}).click();const attachmentId=(await (await uploaded).json()).id;await page.getByText('附件已上传',{exact:true}).waitFor();await page.getByRole('button',{name:'trash-proof.txt',exact:true}).click();await detailAction(page,'删除');await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor();let deletes=0;page.on('request',request=>{if(request.method()==='DELETE'&&request.url().includes('/api/attachments/'))deletes++});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();const trash=page.getByRole('dialog',{name:'恢复中心'}),row=trash.locator('.trash-item',{hasText:'trash-proof.txt'});await row.getByRole('button',{name:'彻底删除 trash-proof.txt'}).click();const confirm=page.getByRole('dialog',{name:'确认彻底删除'});assert.match(await confirm.textContent(),/无法撤销/);await confirm.getByRole('button',{name:'彻底删除'}).click();await page.getByText('已彻底删除',{exact:true}).waitFor();assert.equal(deletes,1);assert.equal(await row.count(),0);const contentStatus=await page.evaluate(id=>fetch(`/api/attachments/${id}/content`).then(response=>response.status),attachmentId);assert.equal(contentStatus,404);await page.close()});

test('清空回收站需二次确认并彻底删除全部资料',async()=>{const page=await browser.newPage();await register(page);for(const title of ['清空甲','清空乙']){await create(page,'笔记',{'标题':title,'正文':'正文','标签（逗号分隔）':''});await page.getByRole('button',{name:`${title}的更多操作`,exact:true}).click();await page.getByRole('menuitem',{name:'删除'}).click();await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor()}let deletes=0;page.on('request',request=>{if(request.method()==='DELETE'&&request.url().includes('/api/entries/'))deletes++});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();const trash=page.getByRole('dialog',{name:'恢复中心'});await trash.getByRole('button',{name:'清空恢复中心'}).click();const confirm=page.getByRole('dialog',{name:'确认清空回收站'});assert.match(await confirm.textContent(),/2 项/);await confirm.getByRole('button',{name:'确认清空'}).click();await page.getByText('回收站已清空',{exact:true}).waitFor();assert.equal(deletes,2);assert.equal(await trash.locator('.trash-item').count(),0);await page.close()});

test('恰好30天清理而少1毫秒仍保留，清理失败提示并在下次解锁重试',async()=>{const page=await browser.newPage();const user=await register(page),T=Date.now()+86400000;const removeAt=async(title,deletedAt)=>{await create(page,'笔记',{'标题':title,'正文':'边界正文','标签（逗号分隔）':''});await page.evaluate(value=>{Date.now=()=>value},deletedAt);await page.getByRole('button',{name:`${title}的更多操作`,exact:true}).click();await page.getByRole('menuitem',{name:'删除'}).click();await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor()};await removeAt('恰好三十天',T-30*86400000);await removeAt('少一毫秒',T-30*86400000+1);await removeAt('失败后重试',T-31*86400000);await page.addInitScript(value=>{Date.now=()=>value},T);let failedOnce=false,retryDeletes=0;await page.route('**/api/entries/*',async route=>{if(route.request().method()==='DELETE'){retryDeletes++;if(!failedOnce){failedOnce=true;return route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal_error"}'})}}await route.continue()});await page.reload();await page.getByLabel('用户名').fill(user);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.getByText('部分过期资料清理失败，已保留并将在下次解锁时重试',{exact:true}).waitFor();await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();let trash=page.getByRole('dialog',{name:'恢复中心'});assert.equal(await trash.locator('.trash-item',{hasText:'少一毫秒'}).count(),1);assert.equal(await trash.locator('.trash-item').count(),2);await trash.getByRole('button',{name:'关闭'}).click();const firstDeletes=retryDeletes;await page.reload();await page.getByLabel('用户名').fill(user);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});assert.ok(retryDeletes>firstDeletes);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();trash=page.getByRole('dialog',{name:'恢复中心'});assert.equal(await trash.locator('.trash-item').count(),1);assert.equal(await trash.locator('.trash-item',{hasText:'少一毫秒'}).count(),1);await page.close()});

test('解锁后自动彻底删除超过30天的回收站资料',async()=>{const page=await browser.newPage();const user=await register(page);await create(page,'笔记',{'标题':'过期资料','正文':'正文','标签（逗号分隔）':''});await page.evaluate(()=>{const old=Date.now()-31*24*60*60*1000;Date.now=()=>old});await page.getByRole('button',{name:'过期资料的更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'删除'}).click();await page.getByRole('button',{name:'移入回收站'}).click();await page.getByText('已移入回收站',{exact:true}).waitFor();let deletes=0;page.on('request',request=>{if(request.method()==='DELETE'&&request.url().includes('/api/entries/'))deletes++});await page.reload();await page.getByLabel('用户名').fill(user);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});assert.equal(deletes,1);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'恢复中心'}).click();assert.equal(await page.getByRole('dialog',{name:'恢复中心'}).locator('.trash-item').count(),0);await page.close()});

test('列表快速删除成功且剩余列表不重复入场',async()=>{
 const page=await browser.newPage();await register(page);await create(page,'笔记',{'标题':'保留条目','正文':'正文','标签（逗号分隔）':''});await create(page,'笔记',{'标题':'快速删除成功','正文':'正文','标签（逗号分隔）':''});
 await page.getByRole('button',{name:'快速删除成功的更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'删除'}).click();
 await page.route('**/api/entries/*',async route=>{if(route.request().method()==='PUT'){await new Promise(r=>setTimeout(r,150));await route.continue()}else await route.continue()});
 const confirm=page.getByRole('button',{name:'移入回收站'});await confirm.click();const deleting=page.getByRole('button',{name:'删除中…'});await deleting.waitFor();assert.equal(await deleting.isDisabled(),true);
 await page.getByText('已移入回收站',{exact:true}).waitFor();assert.equal(await page.locator('.item-card',{hasText:'快速删除成功'}).count(),0);const remaining=page.locator('.item-card',{hasText:'保留条目'});assert.equal(await remaining.evaluate(e=>e.classList.contains('list-enter')),false);assert.equal(await remaining.evaluate(e=>getComputedStyle(e).animationName),'none');await page.close();
});

test('详情可直接删除且失败显示中文反馈并保留条目',async()=>{
 const page=await browser.newPage();await register(page);await create(page,'笔记',{'标题':'删除失败条目','正文':'正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'删除失败条目'}).click();
 await page.route('**/api/entries/*',route=>route.request().method()==='PUT'?route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal_error"}'}):route.continue());
 await detailAction(page,'删除');await page.getByRole('button',{name:'移入回收站'}).click();await page.locator('#delete-error').getByText(/删除失败：服务器暂时异常，请稍后再试/).waitFor();
 assert.equal(await page.getByRole('dialog',{name:'确认删除'}).isVisible(),true);assert.equal(await page.locator('.item-card',{hasText:'删除失败条目'}).count(),1);await page.close();
});

test('详情用北京时间显示四类创建时间，时间页脚是最后子元素且移动端不溢出',async()=>{const page=await browser.newPage({viewport:{width:320,height:800}});await register(page);await create(page,'笔记',{'标题':'时间笔记','正文':'正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'时间笔记'}).click();const footer=page.locator('#detail .detail-created');assert.equal(await footer.textContent(),await footer.evaluate(e=>'创建于 '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(e.dateTime))));assert.equal(await footer.evaluate(e=>e===e.parentElement.lastElementChild),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);await page.close()});

test('改密弹窗显隐状态复位、统一焦点环与响应式截图',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:800}});await register(page);
 const open=async()=>{await page.locator('#menu').click();await page.getByRole('menuitem',{name:'修改密码'}).click()};
 await open();const dialog=page.getByRole('dialog',{name:'修改主密码'}),inputs=dialog.locator('input[type="password"]'),toggles=dialog.locator('[data-password-toggle]');assert.equal(await inputs.count(),3);
 await toggles.first().click();assert.equal(await dialog.locator('input[name="current"]').getAttribute('type'),'text');assert.equal(await toggles.first().getAttribute('aria-pressed'),'true');
 await dialog.getByRole('button',{name:'取消'}).click();await open();assert.deepEqual(await dialog.locator('input').evaluateAll(xs=>xs.map(x=>x.type)),['password','password','password']);assert.deepEqual(await toggles.allTextContents(),['显示','显示','显示']);assert.deepEqual(await toggles.evaluateAll(xs=>xs.map(x=>x.getAttribute('aria-pressed'))),['false','false','false']);
 const emptyError=await dialog.locator('#current-error').evaluate(e=>({height:e.getBoundingClientRect().height,display:getComputedStyle(e).display}));assert.equal(emptyError.height,0);assert.equal(emptyError.display,'none');
 const group=dialog.locator('.password-input').first(),input=dialog.locator('input[name="current"]');const styles=await input.evaluate(e=>({border:getComputedStyle(e).borderTopWidth,outline:getComputedStyle(e).outlineStyle}));assert.equal(styles.border,'0px');await input.focus();await group.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#password-form .password-input')?.matches(':focus-within'));const focused=await group.evaluate(e=>({outline:getComputedStyle(e).outlineStyle,shadow:getComputedStyle(e).boxShadow}));assert.equal(focused.outline,'none');assert.match(focused.shadow,/inset/);
 await dialog.getByRole('button',{name:'确认修改'}).click();const error=dialog.locator('#current-error');assert.equal(await error.isVisible(),true);assert.ok((await error.boundingBox()).height<30);
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);await page.screenshot({path:`artifacts/change-password-${width}.png`,fullPage:true})}
 await page.keyboard.press('Escape');await open();assert.deepEqual(await dialog.locator('input').evaluateAll(xs=>xs.map(x=>x.type)),['password','password','password']);await page.close();
});

test('空说明详情留白且间距略大，不显示破折号',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:800}});await register(page);await create(page,'网站',{'名称':'空说明网站','网址':'https://empty.example','说明':'','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'空说明网站'}).click();const row=page.locator('[data-detail-field="description"]'),value=row.locator('.field-value');assert.equal(await value.textContent(),'');assert.equal(await row.getByText('—',{exact:true}).count(),0);const css=await value.evaluate(e=>({minHeight:parseFloat(getComputedStyle(e).minHeight),marginTop:parseFloat(getComputedStyle(e).marginTop),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}));assert.ok(css.minHeight>=24);assert.ok(css.marginTop>=7);assert.equal(css.overflow,false);await page.close();
});

test('详情字段快捷操作：复制、密码显隐复位、安全网址与 fallback',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:800}});await page.addInitScript(()=>{
  window.__copied=[];window.__opened=[];
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.__copied.push(value),readText:async()=>window.__copied.at(-1)||''}});
  window.open=(url,target,features)=>{window.__opened.push({url,target,features});return null};
 });
 await register(page);await create(page,'账号',{'平台':'Account A','登录网址':'https://account.example/login','账号':'alice','密码':'secret-value','备注':'工作','标签（逗号分隔）':''});
 await page.locator('.item-card',{hasText:'Account A'}).click();const detail=page.locator('#detail');
 assert.match(await detail.locator('.credential-detail').nth(1).locator('.field-value').textContent(),/^•+$/);assert.doesNotMatch(await detail.textContent(),/secret-value/);
 await detail.getByRole('button',{name:'复制账号 1'}).click();await page.getByText('账号 1 已复制',{exact:true}).waitFor();
 await detail.getByRole('button',{name:'复制密码 1'}).click();await page.getByText('密码 1 已复制',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__copied.slice(0,2)),['alice','secret-value']);
 await detail.getByRole('button',{name:'显示密码 1'}).click();assert.equal(await detail.locator('.credential-detail').nth(1).locator('.field-value').textContent(),'secret-value');
 await detail.getByRole('button',{name:'编辑'}).click();await page.locator('#editor').getByLabel('登录网址',{exact:true}).fill('account.example/login');await page.locator('#editor').getByRole('button',{name:'保存'}).click();
 await detail.getByRole('button',{name:'打开登录网址'}).click();assert.deepEqual(await page.evaluate(()=>window.__opened[0]),{url:'https://account.example/login',target:'_blank',features:'noopener,noreferrer'});
 await detail.getByRole('button',{name:'复制登录网址'}).click();await page.getByText('网址已复制',{exact:true}).waitFor();
 await detail.getByRole('button',{name:'← 返回'}).click();await detail.waitFor({state:'hidden'});await page.locator('nav').getByRole('button',{name:'网站',exact:true}).click();assert.doesNotMatch(await page.locator('#detail').textContent(),/secret-value/);
 await create(page,'网站',{'名称':'Safe Site','网址':'https://example.com','说明':'说明','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'Safe Site'}).click();
 await detail.getByRole('button',{name:'打开网址'}).click();await detail.getByRole('button',{name:'复制网址'}).click();assert.equal((await page.evaluate(()=>window.__opened.at(-1).url)),'https://example.com/');
 await detail.getByRole('button',{name:'编辑'}).click();await page.locator('#editor').getByLabel('网址',{exact:true}).fill('javascript:alert(1)');await page.locator('#editor').getByRole('button',{name:'保存'}).click();await detail.getByRole('button',{name:'打开网址'}).click();await page.getByText('仅支持打开 http/https 网址',{exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.__opened.length)),2);
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}});document.execCommand=command=>{if(command==='copy'){window.__fallbackValue=document.activeElement.value;return true}return false}});
 await detail.getByRole('button',{name:'复制网址'}).click();await page.getByText('网址已复制',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__fallbackValue),'javascript:alert(1)');
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false)}await page.close();
});

test('笔记详情正文提供小按钮：复制全部与选择复制',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.addInitScript(()=>{
    window.__copied=[];
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.__copied.push(value),readText:async()=>window.__copied.at(-1)||''}});
  });
  try{
    await register(page);
    const body='第一行配置说明\n第二行：https://example.com/api/health\n第三行收尾';
    await create(page,'笔记',{'标题':'配置域名','正文':body,'标签（逗号分隔）':'运维'});
    await page.locator('.item-card',{hasText:'配置域名'}).click();
    const detail=page.locator('#detail');
    const bodyRow=detail.locator('.detail-row[data-detail-field="body"]');
    await bodyRow.waitFor();
    const copyAll=bodyRow.getByRole('button',{name:'复制全部',exact:true});
    const selectCopy=bodyRow.getByRole('button',{name:'选择复制',exact:true});
    assert.equal(await copyAll.count(),1);
    assert.equal(await selectCopy.count(),1);
    // compact buttons, not oversized primary actions
    const sizes=await bodyRow.locator('.field-actions.note-body-actions button').evaluateAll(nodes=>nodes.map(n=>{
      const s=getComputedStyle(n);
      return{h:n.getBoundingClientRect().height,minH:parseFloat(s.minHeight)||0,fw:s.fontWeight,pad:s.padding};
    }));
    assert.equal(sizes.length,2);
    for(const s of sizes){
      assert.ok(s.h<=40,JSON.stringify(s));
      assert.ok(s.minH<=36,JSON.stringify(s));
    }
    await copyAll.click();
    await page.getByText('正文已复制',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__copied.at(-1)),body);

    // first 选择复制: select all body text
    await selectCopy.click();
    await page.getByText('已选中正文，可拖动手柄后再次点击复制',{exact:true}).waitFor();
    const selected1=await page.evaluate(()=>{
      const value=document.querySelector('#detail .detail-row[data-detail-field="body"] .field-value');
      const sel=window.getSelection();
      return{text:sel?.toString()||'',inBody:value?value.contains(sel.anchorNode):false};
    });
    assert.equal(selected1.inBody,true);
    assert.equal(selected1.text,body);

    // partial selection then 选择复制 copies only selection
    await page.evaluate(()=>{
      const value=document.querySelector('#detail .detail-row[data-detail-field="body"] .field-value');
      const range=document.createRange();
      const node=value.firstChild;
      range.setStart(node,0);
      range.setEnd(node,3); // 第一行
      const sel=window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await selectCopy.click();
    await page.getByText('已复制选中内容',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__copied.at(-1)),'第一行');

    // title/tags should not show these two buttons
    assert.equal(await detail.locator('.detail-row[data-detail-field="title"]').getByRole('button',{name:'复制全部'}).count(),0);
    assert.equal(await detail.locator('.detail-row[data-detail-field="tags"]').getByRole('button',{name:'选择复制'}).count(),0);
  }finally{
    await page.close();
  }
});

test('改密弹窗字段校验阻止请求，服务端错误就地显示，成功后回登录',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}}),runtimeErrors=[];page.on('pageerror',e=>runtimeErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')runtimeErrors.push(m.text())});await register(page);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'修改密码'}).click();
 const dialog=page.getByRole('dialog',{name:'修改主密码'});assert.doesNotMatch(await dialog.textContent(),/至少 12 个字符/);assert.equal(await dialog.locator('input[name="next"]').getAttribute('minlength'),null);assert.equal(await dialog.locator('input[name="confirm"]').count(),1);
 let requests=0;page.on('request',r=>{if(r.url().endsWith('/api/change-password'))requests++});
 await dialog.locator('input[name="current"]').fill('correct horse battery staple');await dialog.locator('input[name="next"]').fill('another secure password');await dialog.locator('input[name="confirm"]').fill('different secure password');await dialog.getByRole('button',{name:'确认修改'}).click();
 assert.equal(requests,0);assert.match(await dialog.textContent(),/两次输入的新密码不一致/);
 await dialog.locator('input[name="confirm"]').fill('another secure password');await dialog.locator('input[name="current"]').fill('another secure password');await dialog.getByRole('button',{name:'确认修改'}).click();assert.equal(requests,0);assert.match(await dialog.textContent(),/新密码不能与当前密码相同/);
 await dialog.locator('input[name="current"]').fill('wrong password here');await dialog.getByRole('button',{name:'确认修改'}).click();await dialog.getByText('当前密码不正确').waitFor();assert.equal(await dialog.isVisible(),true);runtimeErrors.length=0;
 await dialog.locator('input[name="current"]').fill('correct horse battery staple');const successResponse=page.waitForResponse(r=>r.url().endsWith('/api/change-password'));await dialog.getByRole('button',{name:'确认修改'}).click();const changed=await successResponse;assert.equal(changed.status(),200,await changed.text());await page.waitForTimeout(500);const uiState=await page.evaluate(()=>({authHidden:document.querySelector('#auth').hidden,vaultHidden:document.querySelector('#vault').hidden,dialogOpen:document.querySelector('#password-dialog').open,passwordError:document.querySelector('#password-error').textContent,currentError:document.querySelector('#current-error').textContent}));assert.deepEqual(runtimeErrors,[],JSON.stringify(uiState));assert.equal(uiState.authHidden,false,JSON.stringify(uiState));await page.locator('#auth').waitFor({state:'visible'});assert.equal(await dialog.isVisible(),false);assert.match(await page.locator('#auth-error').textContent(),/主密码已修改，请使用新密码重新登录/);
 await page.close();
});

test('修改登录名弹窗在 Chromium/WebKit 手机宽度保持三组单列几何和可用操作',async()=>{
 for(const engine of [chromium,webkit])for(const width of [320,390]){
  const b=await engine.launch({headless:true}),context=await b.newContext({viewport:{width,height:844}}),page=await context.newPage();
  try{
   await register(page);await page.locator('#menu').click();await page.getByRole('menuitem',{name:'修改用户名'}).click();
   const dialog=page.getByRole('dialog',{name:'修改登录名'});await dialog.waitFor({state:'visible'});await page.waitForTimeout(250);
   const geometry=await dialog.evaluate(d=>{const labels=[...d.querySelectorAll('label')],controls=labels.map(l=>l.querySelector('input,.password-input'));const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};return {viewport:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,dialog:rect(d),labels:labels.map((l,i)=>({label:rect(l),control:rect(controls[i]),associated:l.contains(controls[i]),textTop:rect(l).top})),inputs:[...d.querySelectorAll('input')].map(rect),toggle:rect(d.querySelector('.password-toggle')),actions:[...d.querySelectorAll('.dialog-actions button')].map(rect)}});
   assert.equal(geometry.labels.length,3);assert.equal(geometry.scrollWidth,geometry.viewport);
   for(const group of geometry.labels){assert.equal(group.associated,true);assert.ok(group.control.top>group.textTop);assert.ok(group.label.left<=group.control.left&&group.label.right>=group.control.right);assert.ok(group.control.left>=geometry.dialog.left&&group.control.right<=geometry.dialog.right)}
   for(let i=1;i<geometry.labels.length;i++)assert.ok(geometry.labels[i].label.top>=geometry.labels[i-1].label.bottom);
   for(const input of geometry.inputs){assert.ok(input.height>=44);assert.ok(input.left>=geometry.dialog.left&&input.right<=geometry.dialog.right)}assert.ok(geometry.toggle.height>=44&&geometry.toggle.width>=44);assert.ok(geometry.toggle.left>=geometry.dialog.left&&geometry.toggle.right<=geometry.dialog.right);
   for(const action of geometry.actions){assert.ok(action.height>=44);assert.ok(action.left>=geometry.dialog.left&&action.right<=geometry.dialog.right)}
   for(const label of geometry.labels)for(const input of geometry.inputs)if(!(input.top>=label.control.top&&input.bottom<=label.control.bottom))assert.ok(input.top>=label.label.bottom||input.bottom<=label.label.top);
   await page.screenshot({path:`artifacts/change-username-${engine.name()}-${width}.png`,fullPage:true});
  }finally{await context.close();await b.close()}
 }
});

test('改用户名弹窗校验、显隐复位、错误就地显示，成功后新用户名以原密码解锁原数据',async()=>{for(const engine of [chromium,webkit])for(const width of [320,390]){const b=await engine.launch({headless:true}),context=await b.newContext({viewport:{width,height:844}}),page=await context.newPage();try{await register(page);await create(page,'笔记',{'标题':'改名后仍可解密','正文':'保留的加密资料','标签（逗号分隔）':''});const old=await page.evaluate(()=>fetch('/api/session').then(r=>r.json()).then(x=>x.username));await page.locator('#menu').click();await page.getByRole('menuitem',{name:'修改用户名'}).click();const d=page.getByRole('dialog',{name:'修改登录名'});await d.waitFor({state:'visible'});assert.equal(await d.getByLabel('当前账户名').inputValue(),old);assert.equal(await d.getByLabel('当前账户名').isEditable(),false);let requests=0;page.on('request',r=>{if(r.url().endsWith('/api/change-username'))requests++});await d.getByRole('button',{name:'确认修改'}).click();assert.equal(requests,0);assert.match(await d.textContent(),/请输入新用户名.*请输入当前主密码/s);await d.getByLabel('新账户名').fill(old);await d.locator('input[name=currentPassword]').fill('correct horse battery staple');await d.getByRole('button',{name:'确认修改'}).click();assert.equal(requests,0);assert.match(await d.textContent(),/新用户名不能与当前用户名相同/);await d.getByLabel('新账户名').fill(`renamed-${width}-${engine.name()}-${Date.now()}`);await d.locator('input[name=currentPassword]').fill('wrong password here');await d.getByRole('button',{name:'显示当前主密码'}).click();assert.equal(await d.locator('input[name=currentPassword]').getAttribute('type'),'text');await d.getByRole('button',{name:'确认修改'}).click();await d.getByText('当前密码不正确').waitFor();await d.getByRole('button',{name:'取消'}).click();await page.locator('#menu').click();await page.getByRole('menuitem',{name:'修改用户名'}).click();await d.waitFor({state:'visible'});assert.equal(await d.locator('input[name=currentPassword]').getAttribute('type'),'password');assert.equal(await d.locator('input[name=currentPassword]').inputValue(),'');const next=`new-${width}-${engine.name()}-${Date.now()}`;await d.getByLabel('新账户名').fill(next);await d.locator('input[name=currentPassword]').fill('correct horse battery staple');await d.getByRole('button',{name:'确认修改'}).click();await page.locator('#auth').waitFor({state:'visible'});assert.match(await page.locator('#auth-error').textContent(),/用户名已修改/);await page.locator('#auth-form input[name=username]').fill(old);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.getByText('用户名或密码不正确').waitFor();await page.locator('#auth-form input[name=username]').fill(next);await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.locator('nav').getByRole('button',{name:'笔记'}).click();await page.getByText('改名后仍可解密',{exact:true}).click();assert.match(await page.locator('#detail').textContent(),/保留的加密资料/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false)}finally{await context.close();await b.close()}}});

test('所有程序聚焦的弹窗标题不显示蓝色焦点框，交互控件仍保留克制焦点',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();const editor=page.getByRole('dialog',{name:'新建账号'}),title=page.locator('#formTitle');assert.equal(await title.evaluate(e=>document.activeElement===e),true);const titleStyle=await title.evaluate(e=>{const s=getComputedStyle(e);return{outline:s.outlineStyle,shadow:s.boxShadow}});assert.equal(titleStyle.outline,'none');assert.equal(titleStyle.shadow,'none');await editor.getByLabel('平台').focus();const input=editor.getByLabel('平台');assert.equal(await input.evaluate(e=>e.matches(':focus-visible')),true);assert.equal(await input.evaluate(e=>getComputedStyle(e).outlineStyle),'none');assert.notEqual(await input.evaluate(e=>getComputedStyle(e).boxShadow),'none')}finally{await page.close();if(own!==browser)await own.close()}}});

test('新建类型弹窗焦点不显示绿色框并保留键盘定位反馈',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await page.getByRole('button',{name:'+ 新建'}).click();const picker=page.locator('#picker'),title=page.locator('#picker-title'),close=picker.getByRole('button',{name:'关闭'});assert.equal(await picker.evaluate(e=>e.contains(document.activeElement)&&document.activeElement===e.querySelector('h2')),true);assert.equal(await title.evaluate(e=>getComputedStyle(e).outlineStyle),'none');assert.equal(await title.evaluate(e=>getComputedStyle(e).boxShadow),'none');await close.focus();const closeFocus=await close.evaluate(e=>({outline:getComputedStyle(e).outlineStyle,shadow:getComputedStyle(e).boxShadow}));assert.equal(closeFocus.outline,'none');assert.equal(closeFocus.shadow,'none');await page.keyboard.press('Tab');const account=picker.getByRole('button',{name:'账号',exact:true}),focus=await account.evaluate(e=>({visible:e.matches(':focus-visible'),outline:getComputedStyle(e).outlineStyle,color:getComputedStyle(e).outlineColor,shadow:getComputedStyle(e).boxShadow}));assert.equal(focus.visible,true);assert.equal(focus.outline,'none');assert.doesNotMatch(`${focus.color} ${focus.shadow}`,/139, 203, 187|85, 189, 162/);await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement?.id),'add');await page.close();
});

test('统一 motion：dialog 退场、reduced motion 与视口无溢出',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await register(page);
 const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return [s.getPropertyValue('--motion-fast').trim(),s.getPropertyValue('--motion-base').trim(),s.getPropertyValue('--motion-slow').trim()]});assert.deepEqual(tokens,['120ms','180ms','240ms']);
 await page.getByRole('button',{name:'+ 新建'}).click();const picker=page.locator('#picker');assert.equal(await picker.getAttribute('data-motion'),'open');await picker.getByRole('button',{name:'关闭'}).click();assert.equal(await picker.getAttribute('data-motion'),'closing');await picker.waitFor({state:'hidden'});assert.equal(await picker.evaluate(e=>e.open),false);
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'+ 新建'}).click();await picker.getByRole('button',{name:'关闭'}).click();assert.equal(await picker.evaluate(e=>e.open),false);
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false)}assert.deepEqual(errors,[]);await page.close();
});

test('附件分类使用自有选择弹窗而非 Safari 原生下拉',async()=>{
 for(const engine of [chromium,webkit]){
  const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844},colorScheme:'dark'});
  try{
   await register(page);
   await page.locator('nav').getByRole('button',{name:'附件',exact:true}).click();
   assert.equal(await page.locator('select#attachment-filter').count(),0);
   const trigger=page.locator('#attachment-filter');
   assert.equal(await trigger.getAttribute('aria-label'),'附件分类，当前全部附件');
   await trigger.click();
   const picker=page.getByRole('dialog',{name:'选择附件分类'});
   assert.deepEqual(await picker.getByRole('radio').allTextContents(),['全部附件','图片','视频','其他']);
   await picker.getByRole('radio',{name:'图片',exact:true}).click();
   await picker.waitFor({state:'hidden'});
   assert.equal(await trigger.textContent(),'图片');
   assert.equal(await trigger.getAttribute('aria-label'),'附件分类，当前图片');
  }finally{await page.close();if(engine!==chromium)await own.close()}
 }
});

test('夜晚模式下附件分类筛选按钮使用深色输入表面而非白底浅字',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});
  try{
    await register(page);
    await page.getByRole('button',{name:'+ 新建'}).click();
    await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'上传附件'});
    await dialog.getByLabel('选择文件').setInputFiles({name:'dark-filter.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});
    await dialog.getByRole('button',{name:'加密并上传'}).click();
    await page.getByText('附件已上传',{exact:true}).waitFor();
    await page.locator('#attachment-filter').waitFor({state:'visible'});
    const c=await page.evaluate(()=>{
      const s=document.querySelector('#attachment-filter'),search=document.querySelector('#search');
      const cs=getComputedStyle(s);
      return{
        filterBg:cs.backgroundColor,
        filterBorder:cs.borderTopColor,
        searchBg:getComputedStyle(search).backgroundColor,
        filterWhite:cs.backgroundColor==='rgb(255, 255, 255)',
      };
    });
    assert.equal(c.filterWhite,false,`附件筛选下拉不应白底: ${JSON.stringify(c)}`);
    assert.equal(c.filterBg,c.searchBg,`附件筛选下拉背景应与搜索框一致(深色 input 表面): ${JSON.stringify(c)}`);
  }finally{await page.close()}
});

test('移动端长标题详情页保持返回按钮单行且只压缩标题',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});
  try{
    await register(page);
    const title='upcloud-这是一个明显超过移动端详情栏可用宽度的账号名称';
    await create(page,'账号',{'平台':title,'登录网址':'https://example.com','账号':'demo','密码':'secret','备注':'','标签（逗号分隔）':''});
    await page.getByText('已保存',{exact:true}).waitFor();
    await page.locator('.item-card',{hasText:title}).click();
    await page.locator('#detail.open .detail-head').waitFor();
    const c=await page.evaluate(()=>{
      const back=document.querySelector('#detail .mobile-back'),title=document.querySelector('#detail .detail-head h2'),head=document.querySelector('#detail .detail-head');
      const br=back.getBoundingClientRect(),tr=title.getBoundingClientRect(),hr=head.getBoundingClientRect(),bs=getComputedStyle(back),ts=getComputedStyle(title);
      return{backHeight:br.height,backLineHeight:parseFloat(bs.lineHeight),backWhiteSpace:bs.whiteSpace,titleWhiteSpace:ts.whiteSpace,titleOverflow:ts.overflow,titleTextOverflow:ts.textOverflow,inside:br.left>=hr.left&&br.right<=hr.right&&tr.left>=hr.left&&tr.right<=hr.right,scrollOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
    });
    assert.equal(c.backWhiteSpace,'nowrap',JSON.stringify(c));
    assert.ok(c.backHeight<60,`返回按钮不应因文字换行增高: ${JSON.stringify(c)}`);
    assert.equal(c.titleWhiteSpace,'nowrap',JSON.stringify(c));
    assert.equal(c.titleOverflow,'hidden',JSON.stringify(c));
    assert.equal(c.titleTextOverflow,'ellipsis',JSON.stringify(c));
    assert.equal(c.inside,true,JSON.stringify(c));
    assert.equal(c.scrollOverflow,false,JSON.stringify(c));
  }finally{await page.close()}
});

test('夜晚模式下条目详情顶部工具栏与移动端 sticky 头部使用深色表面而非白底',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});
  try{
    await register(page);
    await create(page,'笔记',{'标题':'服务器','正文':'root 密码已更新','标签（逗号分隔）':''});
    await page.getByText('已保存',{exact:true}).waitFor();
    await page.locator('.item-card',{hasText:'服务器'}).click();
    await page.locator('#detail.open .detail-head').waitFor();
    const c=await page.evaluate(()=>{
      const white=v=>v==='rgb(255, 255, 255)'||v==='rgba(0, 0, 0, 0)'&&false;
      const head=document.querySelector('#detail .detail-head');
      const collection=document.querySelector('.collection');
      return{
        head:getComputedStyle(head).backgroundColor,
        detail:getComputedStyle(document.querySelector('#detail')).backgroundColor,
        collection:getComputedStyle(collection).backgroundColor,
        headWhite:getComputedStyle(head).backgroundColor==='rgb(255, 255, 255)',
      };
    });
    assert.equal(c.headWhite,false,`详情头部不应为白底: ${JSON.stringify(c)}`);
    assert.equal(c.head,c.detail,`详情头部背景应与详情面板一致(深色 surface): ${JSON.stringify(c)}`);
  }finally{await page.close()}
});

test('白天夜晚模式丝滑切换、无闪烁初始化并本机持久化',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:'light'});
  try{
    const username=await register(page);
    const menu=page.locator('#menu');
    await menu.click();
    const theme=page.getByRole('menuitem',{name:'切换到夜晚模式',exact:true});
    await theme.waitFor();
    const light=await page.evaluate(()=>({
      theme:document.documentElement.dataset.theme,
      scheme:getComputedStyle(document.documentElement).colorScheme,
      stored:localStorage.getItem('pass-vault-theme'),
      bg:getComputedStyle(document.body).backgroundColor,
      surface:getComputedStyle(document.querySelector('.collection')).backgroundColor,
      transition:getComputedStyle(document.body).transitionDuration,
    }));
    assert.equal(light.theme,'light',JSON.stringify(light));
    assert.match(light.scheme,/light/);
    await theme.click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    const motion=await page.evaluate(()=>({transitioning:document.documentElement.classList.contains('theme-transition'),transition:getComputedStyle(document.body).transitionDuration}));
    assert.ok(motion.transitioning&&motion.transition.split(',').some(v=>parseFloat(v)>0),JSON.stringify(motion));
    await page.waitForFunction(()=>!document.documentElement.classList.contains('theme-transition'));
    const dark=await page.evaluate(()=>({
      theme:document.documentElement.dataset.theme,
      scheme:getComputedStyle(document.documentElement).colorScheme,
      stored:localStorage.getItem('pass-vault-theme'),
      bg:getComputedStyle(document.body).backgroundColor,
      surface:getComputedStyle(document.querySelector('.collection')).backgroundColor,
      meta:document.querySelector('meta[name="color-scheme"]')?.content,
    }));
    assert.equal(dark.theme,'dark',JSON.stringify(dark));
    assert.equal(dark.stored,'dark');
    assert.match(dark.scheme,/dark/);
    assert.notEqual(dark.bg,light.bg);
    assert.notEqual(dark.surface,light.surface);
    assert.match(dark.meta,/dark/);
    await page.reload({waitUntil:'domcontentloaded'});
    const restored=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,stored:localStorage.getItem('pass-vault-theme'),bg:getComputedStyle(document.body).backgroundColor}));
    assert.equal(restored.theme,'dark',JSON.stringify(restored));
    assert.equal(restored.stored,'dark');
    assert.equal(restored.bg,dark.bg);
    assert.equal(await page.locator('#auth').isVisible(),true);
    await page.locator('#auth-form input[name="username"]').fill(username);
    await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');
    await page.getByRole('button',{name:'登录并解锁',exact:true}).click();
    await page.locator('#vault').waitFor({state:'visible'});
    await page.locator('#menu').click();
    const toLight=page.getByRole('menuitem',{name:'切换到白天模式',exact:true});
    await toLight.click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
    assert.equal(await page.evaluate(()=>localStorage.getItem('pass-vault-theme')),'light');
  }finally{await page.close()}
});

test('顶部更多菜单在打开条目菜单、资料详情、切换分类和点击外部后自动收起',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await create(page,'网站',{'名称':'菜单互斥测试','网址':'https://example.com','说明':'','标签（逗号分隔）':''});
  const top=page.locator('#menu-panel'),trigger=page.locator('#menu');
  await trigger.click();assert.equal(await top.isVisible(),true);await page.getByRole('button',{name:'菜单互斥测试的更多操作',exact:true}).evaluate(button=>button.click());assert.equal(await top.isHidden(),true);assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await page.getByRole('menuitem',{name:'编辑',exact:true}).isVisible(),true);
  await trigger.click();assert.equal(await page.getByRole('menuitem',{name:'编辑',exact:true}).isHidden(),true);assert.equal(await top.isVisible(),true);await page.locator('.item-card',{hasText:'菜单互斥测试'}).evaluate(card=>card.click());assert.equal(await top.isHidden(),true);assert.equal(await page.locator('#detail').isVisible(),true);
  await page.locator('#detail').getByRole('button',{name:'← 返回'}).click();await trigger.click();await page.locator('nav').getByRole('button',{name:'账号',exact:true}).click();assert.equal(await top.isHidden(),true);
  await trigger.click();await page.locator('.toolbar').evaluate(toolbar=>toolbar.click());assert.equal(await top.isHidden(),true);assert.equal(await trigger.getAttribute('aria-expanded'),'false');await page.close();
});

test('手机详情打开时顶部更多菜单不被详情顶栏遮挡',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  try{
    await register(page);
    await create(page,'笔记',{'标题':'遮挡菜单测试','正文':'用于验证详情页上更多菜单层级','标签（逗号分隔）':''});
    await page.locator('.item-card',{hasText:'遮挡菜单测试'}).click();
    await page.locator('#detail.open').waitFor();
    await page.locator('#menu').click();
    const menu=page.locator('#menu-panel');
    await menu.waitFor({state:'visible'});
    const evidence=await page.evaluate(()=>{
      const menuEl=document.querySelector('#menu-panel');
      const items=[...menuEl.querySelectorAll('[role=menuitem]')];
      const detail=document.querySelector('#detail');
      const head=document.querySelector('#detail .detail-head');
      const sample=(el)=>{
        const r=el.getBoundingClientRect();
        const x=Math.min(Math.max(r.left+r.width/2,0),innerWidth-1);
        const y=Math.min(Math.max(r.top+r.height/2,0),innerHeight-1);
        return{text:el.textContent.trim(),rect:{top:r.top,left:r.left,bottom:r.bottom,right:r.right,width:r.width,height:r.height},center:{x,y},topElement:document.elementFromPoint(x,y)?.closest('[role=menuitem],#menu-panel,#detail,.detail-head,button')?.id||document.elementFromPoint(x,y)?.closest('[role=menuitem],#menu-panel,#detail,.detail-head,button')?.className||document.elementFromPoint(x,y)?.tagName||null,hit:!!document.elementFromPoint(x,y)?.closest('#menu-panel')};
      };
      return{
        menuZ:getComputedStyle(menuEl).zIndex,
        detailZ:getComputedStyle(detail).zIndex,
        headerZ:getComputedStyle(document.querySelector('#vault>header')).zIndex,
        headVisible:!!head&&getComputedStyle(head).display!=='none',
        items:items.map(sample),
      };
    });
    assert.ok(evidence.items.length>=2,JSON.stringify(evidence));
    for(const item of evidence.items){
      assert.ok(item.rect.width>0&&item.rect.height>0,JSON.stringify(item));
      assert.equal(item.hit,true,JSON.stringify({item,evidence}));
    }
    await page.getByRole('menuitem',{name:'分组排序',exact:true}).click();
    await page.getByRole('dialog',{name:'分组排序'}).waitFor();
  }finally{
    await page.close();
  }
});

test('桌面附件详情正文使用统一内边距且图片不贴边',async()=>{const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传附件'});await upload.getByLabel('选择文件').setInputFiles({name:'padding-proof.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByRole('button',{name:'padding-proof.png',exact:true}).click();await page.locator('#detail .attachment-preview').waitFor({state:'visible'});const evidence=await page.locator('#detail').evaluate(detail=>{const box=detail.getBoundingClientRect(),meta=detail.querySelector('.attachment-meta').getBoundingClientRect(),image=detail.querySelector('.attachment-preview').getBoundingClientRect(),created=detail.querySelector('.detail-created').getBoundingClientRect();return{metaLeft:meta.left-box.left,imageLeft:image.left-box.left,createdLeft:created.left-box.left,imageRight:box.right-image.right,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}});for(const key of ['metaLeft','imageLeft','createdLeft'])assert.ok(evidence[key]>=23&&evidence[key]<=25,JSON.stringify(evidence));assert.ok(evidence.imageRight>=23,JSON.stringify(evidence));assert.equal(evidence.overflow,false)}finally{await browser.close()}});

test('附件详情对 PDF/文本/音频提供内置预览，未知类型仍可下载',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  try{
    await register(page);
    const upload=async(name,mime,buffer)=>{
      await page.getByRole('button',{name:'+ 新建'}).click();
      await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'上传附件'});
      await dialog.getByLabel('选择文件').setInputFiles({name,mimeType:mime,buffer});
      await dialog.getByRole('button',{name:'加密并上传'}).click();
      await page.getByText('附件已上传',{exact:true}).waitFor();
      await page.getByRole('button',{name,exact:true}).waitFor();
    };
    // Valid single-page PDF that PDF.js can render to canvas (iOS Safari cannot show blob: PDF iframes)
    const pdf=Buffer.from(`%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 200] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 28 Tf 72 100 Td (Hello PDF Preview) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000279 00000 n 
0000000398 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
477
%%EOF
`);
    const text=Buffer.from('hello encrypted preview\n第二行文本','utf8');
    const audio=Buffer.from([
      // tiny WAV header + silence
      0x52,0x49,0x46,0x46,0x24,0x00,0x00,0x00,0x57,0x41,0x56,0x45,0x66,0x6d,0x74,0x20,
      0x10,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x44,0xac,0x00,0x00,0x88,0x58,0x01,0x00,
      0x02,0x00,0x10,0x00,0x64,0x61,0x74,0x61,0x00,0x00,0x00,0x00
    ]);
    const bin=Buffer.from([0x00,0x01,0x02,0x03,0xff]);

    await upload('guide.pdf','application/pdf',pdf);
    await upload('notes.txt','text/plain',text);
    await upload('tone.wav','audio/wav',audio);
    await upload('blob.bin','application/octet-stream',bin);

    // PDF — canvas-based built-in preview (not blank iframe)
    await page.getByRole('button',{name:'guide.pdf',exact:true}).click();
    await page.locator('#detail.open').waitFor();
    const pdfPreview=page.locator('#detail .attachment-preview[data-preview="pdf"]');
    await pdfPreview.waitFor();
    await page.locator('#detail .attachment-preview[data-preview="pdf"] canvas').waitFor({timeout:15000});
    assert.equal(await page.locator('#detail').getByRole('button',{name:'下载文件',exact:true}).count(),1);
    const pdfState=await pdfPreview.evaluate(el=>{
      const canvas=el.querySelector('canvas');
      let nonWhite=0;
      if(canvas){
        const img=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        for(let i=0;i<img.length;i+=4){if(img[i]<250||img[i+1]<250||img[i+2]<250)nonWhite++;}
      }
      return{
        hasIframe:!!el.querySelector('iframe'),
        canvas:!!canvas,
        width:canvas?.width||0,
        height:canvas?.height||0,
        nonWhite,
        label:el.getAttribute('aria-label')||'',
        status:(el.querySelector('.pdf-page-label')?.textContent||'').trim()
      };
    });
    assert.equal(pdfState.hasIframe,false);
    assert.equal(pdfState.canvas,true);
    assert.ok(pdfState.width>100,JSON.stringify(pdfState));
    assert.ok(pdfState.height>40,JSON.stringify(pdfState));
    assert.ok(pdfState.nonWhite>50,JSON.stringify(pdfState));
    assert.match(pdfState.label,/guide\.pdf/);
    assert.match(pdfState.status,/第\s*1\s*\/\s*1\s*页|1\s*\/\s*1/);
    await page.locator('#detail').getByRole('button',{name:'← 返回'}).click();

    // Text
    await page.getByRole('button',{name:'notes.txt',exact:true}).click();
    const textPreview=page.locator('#detail .attachment-preview[data-preview="text"]');
    await textPreview.waitFor();
    assert.match(await textPreview.innerText(),/hello encrypted preview/);
    assert.match(await textPreview.innerText(),/第二行文本/);
    assert.equal(await page.locator('#detail').getByRole('button',{name:'下载文件',exact:true}).count(),1);
    await page.locator('#detail').getByRole('button',{name:'← 返回'}).click();

    // Audio
    await page.getByRole('button',{name:'tone.wav',exact:true}).click();
    const audioPreview=page.locator('#detail .attachment-preview[data-preview="audio"]');
    await audioPreview.waitFor();
    const audioState=await audioPreview.evaluate(el=>({tag:el.tagName,controls:el.controls,src:!!el.getAttribute('src')}));
    assert.equal(audioState.tag,'AUDIO');
    assert.equal(audioState.controls,true);
    assert.equal(audioState.src,true);
    assert.equal(await page.locator('#detail').getByRole('button',{name:'下载文件',exact:true}).count(),1);
    await page.locator('#detail').getByRole('button',{name:'← 返回'}).click();

    // Unknown binary still download only
    await page.getByRole('button',{name:'blob.bin',exact:true}).click();
    await page.locator('#detail').getByRole('button',{name:'下载文件',exact:true}).waitFor();
    assert.equal(await page.locator('#detail .attachment-preview').count(),0);
  }finally{
    await page.close();
  }
});

test('WebKit 附件 PDF 详情使用 canvas 内置预览且内容非空白',async()=>{
  const safari=await webkit.launch({headless:true});
  const page=await safari.newPage({viewport:{width:390,height:844}});
  try{
    await register(page);
    const pdf=Buffer.from(`%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 200] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 28 Tf 72 100 Td (Hello PDF Preview) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000279 00000 n 
0000000398 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
477
%%EOF
`);
    await page.getByRole('button',{name:'+ 新建'}).click();
    await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'上传附件'});
    await dialog.getByLabel('选择文件').setInputFiles({name:'ios-guide.pdf',mimeType:'application/pdf',buffer:pdf});
    await dialog.getByRole('button',{name:'加密并上传'}).click();
    await page.getByText('附件已上传',{exact:true}).waitFor();
    await page.getByRole('button',{name:'ios-guide.pdf',exact:true}).click();
    const box=page.locator('#detail .attachment-preview[data-preview="pdf"]');
    await box.waitFor();
    await page.locator('#detail .attachment-preview[data-preview="pdf"] canvas').waitFor({timeout:20000});
    const evidence=await box.evaluate(el=>{
      const canvas=el.querySelector('canvas');
      const img=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let nonWhite=0; for(let i=0;i<img.length;i+=4){if(img[i]<250||img[i+1]<250||img[i+2]<250)nonWhite++;}
      return{hasIframe:!!el.querySelector('iframe'),nonWhite,w:canvas.width,h:canvas.height};
    });
    assert.equal(evidence.hasIframe,false);
    assert.ok(evidence.nonWhite>50,JSON.stringify(evidence));
  }finally{
    await page.close();
    await safari.close();
  }
});

test('附件详情返回按钮仅在手机单栏显示',async()=>{const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传附件'});await upload.getByLabel('选择文件').setInputFiles({name:'back-proof.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByRole('button',{name:'back-proof.png',exact:true}).click();const back=page.locator('#detail').getByRole('button',{name:'← 返回',exact:true});assert.equal(await back.isVisible(),false);await page.setViewportSize({width:390,height:844});assert.equal(await back.isVisible(),true);await back.click();await page.locator('#detail').waitFor({state:'hidden'});assert.equal(await page.locator('#detail').isVisible(),false)}finally{await browser.close()}});

test('附件库上传筛选预览改名删除，笔记可关联与移除图片',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.addInitScript(()=>{window.__revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=value=>{window.__revoked.push(value);revoke(value)}});const user=await register(page);
 assert.equal(await page.locator('nav').getByRole('button',{name:'附件',exact:true}).count(),1);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();
 const upload=page.getByRole('dialog',{name:'上传附件'});await upload.locator('input[type=file]').setInputFiles({name:'tiny.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByText('附件已上传',{exact:true}).waitFor();
 await page.locator('nav').getByRole('button',{name:'附件',exact:true}).click();await page.locator('#attachment-filter').click();await page.getByRole('dialog',{name:'选择附件分类'}).getByRole('radio',{name:'图片',exact:true}).click();await page.reload();await page.getByLabel('用户名').fill(user);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.locator('nav').getByRole('button',{name:'附件',exact:true}).click();await page.locator('#attachment-filter').click();await page.getByRole('dialog',{name:'选择附件分类'}).getByRole('radio',{name:'图片',exact:true}).click();await page.getByRole('button',{name:'tiny.png',exact:true}).click();await page.locator('#detail img[alt="tiny.png"]').waitFor();assert.equal(await page.locator('#detail img[alt="tiny.png"]').count(),1);
 await page.locator('#detail').getByRole('button',{name:'重命名'}).click();let rename=page.getByRole('dialog',{name:'重命名附件'});await rename.getByLabel('文件名').fill('renamed-once.png');let metadataRequest=page.waitForRequest(request=>request.method()==='PUT'&&new URL(request.url()).pathname.endsWith('/metadata'));await rename.getByRole('button',{name:'保存'}).click();assert.equal((await metadataRequest).postDataJSON().revision,1);await page.locator('#detail').getByRole('heading',{name:'renamed-once.png',exact:true}).waitFor();await page.locator('#detail').getByRole('button',{name:'重命名'}).click();rename=page.getByRole('dialog',{name:'重命名附件'});await rename.getByLabel('文件名').fill('renamed.png');metadataRequest=page.waitForRequest(request=>request.method()==='PUT'&&new URL(request.url()).pathname.endsWith('/metadata'));await rename.getByRole('button',{name:'保存'}).click();assert.equal((await metadataRequest).postDataJSON().revision,2);await page.locator('#detail').getByRole('heading',{name:'renamed.png',exact:true}).waitFor();await page.locator('#detail').getByRole('button',{name:'← 返回'}).click();assert.ok((await page.evaluate(()=>window.__revoked.length))>0);
 await create(page,'笔记',{'标题':'图片笔记','正文':'正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'图片笔记'}).click();await page.locator('#detail').getByRole('button',{name:'编辑'}).click();const noteEditor=page.locator('#editor');await noteEditor.getByLabel('添加图片').setInputFiles({name:'note.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await noteEditor.getByRole('button',{name:'保存'}).click();await page.locator('#detail img[alt="note.png"]').click();await page.getByRole('dialog',{name:'图片预览'}).getByRole('button',{name:'关闭'}).click();
 await page.locator('#detail').getByRole('button',{name:'编辑'}).click();await page.getByRole('button',{name:'移除 note.png'}).click();await noteEditor.getByRole('button',{name:'保存'}).click();assert.equal(await page.locator('#detail img[alt="note.png"]').count(),0);await page.locator('#detail').getByRole('button',{name:'← 返回'}).click();await page.locator('#detail').waitFor({state:'hidden'});await page.locator('nav').getByRole('button',{name:'附件',exact:true}).click();assert.equal(await page.getByText('note.png',{exact:true}).count(),1);
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false)}assert.deepEqual(errors,[]);await page.close();
});

test('功能6：编辑账号改密码后详情显示更新时间且旧密码进入密码历史',async()=>{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 try{
  await register(page);
  await create(page,'账号',{'平台':'GitHub','登录网址':'https://github.com','账号':'octocat','密码':'old-pass-111','备注':'','标签（逗号分隔）':''});
  await page.getByText('已保存',{exact:true}).waitFor();
  await page.locator('.item-card',{hasText:'GitHub'}).click();
  await page.locator('#detail .detail-head').waitFor();
  // 编辑：改密码
  await page.locator('#detail').getByRole('button',{name:'编辑'}).click();
  const editor=page.locator('#editor');
  await editor.locator('input[name=credentialPassword]').fill('new-pass-222');
  await editor.getByRole('button',{name:'保存'}).click();
  await page.getByText('已保存',{exact:true}).waitFor();
  await page.locator('.item-card',{hasText:'GitHub'}).click();
  await page.locator('#detail .detail-head').waitFor();
  // 断言1：显示"更新于"
  assert.equal(await page.locator('#detail .detail-updated').count(),1,'应显示更新时间');
  assert.match(await page.locator('#detail .detail-updated').textContent(),/更新于/);
  // 断言2：密码历史存在且含旧密码
  const history=page.locator('#detail .password-history');
  assert.equal(await history.count(),1,'应显示密码历史');
  await history.locator('summary').click();
  await history.getByRole('button',{name:/显示历史密码/}).first().click();
  assert.match(await history.locator('.history-row .field-value').first().textContent(),/old-pass-111/,'历史应含旧密码');
  assert.deepEqual(errors,[]);
 }finally{await page.close()}
});

test('功能7：打开条目后"最近查看"出现并在重新登录后仍保留（加密同步）',async()=>{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 try{
  const user=await register(page);
  await create(page,'账号',{'平台':'AlphaSite','登录网址':'https://a.example','账号':'a','密码':'pa','备注':'','标签（逗号分隔）':''});
  await page.getByText('已保存',{exact:true}).waitFor();
  await create(page,'账号',{'平台':'BetaSite','登录网址':'https://b.example','账号':'b','密码':'pb','备注':'','标签（逗号分隔）':''});
  await page.getByText('已保存',{exact:true}).waitFor();
  // 打开 BetaSite
  await page.locator('.item-card',{hasText:'BetaSite'}).click();
  await page.locator('#detail .detail-head').waitFor();
  await page.locator('#detail').getByRole('button',{name:'← 返回'}).click().catch(()=>{});
  await page.waitForTimeout(400);
  // 断言：最近查看区出现，含 BetaSite
  const recents=page.locator('.recents');
  await recents.waitFor();
  assert.equal(await recents.count(),1,'应显示最近查看区');
  assert.equal(await recents.getByRole('button',{name:/打开 BetaSite/}).count(),1,'最近查看应含 BetaSite');
  // 重新登录，验证加密持久化（B 方案跨设备同步）
  await page.reload();
  await page.getByLabel('用户名').fill(user);
  await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');
  await page.getByRole('button',{name:'登录并解锁'}).click();
  await page.locator('#vault').waitFor({state:'visible'});
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.recents').getByRole('button',{name:/打开 BetaSite/}).count(),1,'重新登录后最近查看应保留');
  assert.deepEqual(errors,[]);
 }finally{await page.close()}
});

test('功能4：账号编辑器点"生成"填入强密码，长度可调',async()=>{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 try{
  await register(page);
  await page.getByRole('button',{name:'+ 新建'}).click();
  await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();
  const editor=page.locator('#editor');
  // 点击第一组密码的"生成"按钮
  await editor.getByRole('button',{name:'生成密码 1'}).click();
  const genPanel=page.locator('.pw-gen-panel');
  await genPanel.waitFor();
  // 调整长度到 24
  await genPanel.getByLabel(/长度/).fill('24');
  await genPanel.getByRole('button',{name:'生成',exact:true}).click();
  await genPanel.getByRole('button',{name:'填入',exact:true}).click();
  const pw=await editor.locator('input[name=credentialPassword]').first().inputValue();
  assert.equal(pw.length,24,`应生成24位,实际${pw.length}`);
  assert.match(pw,/[A-Z]/,'含大写');assert.match(pw,/[a-z]/,'含小写');assert.match(pw,/[0-9]/,'含数字');
  // 保存后可用
  await editor.locator('input[name=credentialUsername]').first().fill('genuser');
  await editor.getByLabel('平台',{exact:true}).fill('GenSite');
  await editor.getByLabel('登录网址',{exact:true}).fill('https://gen.example');
  await editor.getByRole('button',{name:'保存'}).click();
  await page.getByText('已保存',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
 }finally{await page.close()}
});

test('Pointer取消恢复DOM且不提交排序',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();const editor=page.locator('#editor');await editor.getByRole('button',{name:'+ 添加账号'}).click();const users=editor.locator('input[name=credentialUsername]');await users.nth(0).fill('first');await users.nth(1).fill('second');const handle=editor.getByRole('button',{name:'拖动账号 2'}),first=editor.locator('.credential-row').first(),hb=await handle.boundingBox(),fb=await first.boundingBox();assert.ok(hb&&fb);await handle.dispatchEvent('pointerdown',{pointerId:77,isPrimary:true,button:0,clientX:hb.x+2,clientY:hb.y+2});await page.evaluate(({x,y})=>document.dispatchEvent(new PointerEvent('pointermove',{pointerId:77,isPrimary:true,button:0,clientX:x,clientY:y,bubbles:true,cancelable:true})),{x:fb.x+2,y:fb.y+2});await handle.dispatchEvent('pointercancel',{pointerId:77,isPrimary:true,button:0});assert.deepEqual(await users.evaluateAll(rows=>rows.map(x=>x.value)),['first','second'])}finally{await page.close()}});

test('账号多凭据支持手柄拖拽并按新顺序保存',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();const editor=page.locator('#editor');await editor.getByLabel('平台').fill('排序账号');await editor.getByLabel('登录网址').fill('https://order.example');await editor.getByRole('button',{name:'+ 添加账号'}).click();const users=editor.locator('input[name=credentialUsername]'),passwords=editor.locator('input[name=credentialPassword]');await users.nth(0).fill('first-user');await passwords.nth(0).fill('first-secret');await users.nth(1).fill('second-user');await passwords.nth(1).fill('second-secret');await editor.getByRole('button',{name:'拖动账号 2'}).press('ArrowUp');assert.deepEqual(await users.evaluateAll(rows=>rows.map(x=>x.value)),['second-user','first-user']);await editor.getByRole('button',{name:'保存'}).click();await page.getByText('已保存',{exact:true}).waitFor();await page.locator('.item-card',{hasText:'排序账号'}).click();await page.locator('#detail').getByRole('button',{name:'编辑'}).click();assert.deepEqual(await editor.locator('input[name=credentialUsername]').evaluateAll(rows=>rows.map(x=>x.value)),['second-user','first-user'])}finally{await page.close()}});

test('账号编辑器可逐行显示密码并在重新打开时恢复隐藏',async()=>{
 for(const engine of [chromium,webkit])for(const width of [320,390]){
  const ownBrowser=await engine.launch({headless:true}),page=await ownBrowser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
  try{
   await register(page);
   await page.getByRole('button',{name:'+ 新建'}).click();
   await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();
   const editor=page.locator('#editor');
   await editor.getByRole('button',{name:'+ 添加账号'}).click();
   const passwords=editor.locator('input[name=credentialPassword]');
   await passwords.nth(0).fill('first-secret');
   await passwords.nth(1).fill('second-secret');
   assert.deepEqual(await passwords.evaluateAll(inputs=>inputs.map(input=>input.type)),['password','password']);
   const hiddenToggle=editor.getByRole('button',{name:'显示密码 2'});
   assert.equal((await hiddenToggle.textContent()).trim(),'显示');
   assert.equal(await hiddenToggle.locator('svg').count(),0);
   await hiddenToggle.click();
   assert.deepEqual(await passwords.evaluateAll(inputs=>inputs.map(input=>input.type)),['password','text']);
   assert.equal(await passwords.nth(1).inputValue(),'second-secret');
   const toggle=editor.getByRole('button',{name:'隐藏密码 2'}),field=toggle.locator('..'),generate=editor.getByRole('button',{name:'生成密码 2'});
   assert.equal((await toggle.textContent()).trim(),'隐藏');
   assert.equal(await toggle.locator('svg').count(),0);
   assert.equal(await toggle.getAttribute('aria-pressed'),'true');
   const geometry=await Promise.all([toggle,field,generate,passwords.nth(1)].map(locator=>locator.boundingBox()));
   assert.ok(geometry.every(Boolean));
   const [toggleBox,fieldBox,generateBox,inputBox]=geometry;
   assert.ok(toggleBox.width>=44&&toggleBox.height>=44);
   assert.ok(toggleBox.x>=fieldBox.x&&toggleBox.x+toggleBox.width<=fieldBox.x+fieldBox.width);
   assert.ok(Math.abs(inputBox.x-fieldBox.x)<=1&&Math.abs(toggleBox.x+toggleBox.width-(fieldBox.x+fieldBox.width))<=1);
   assert.ok(Math.abs(inputBox.y-toggleBox.y)<=1&&Math.abs(inputBox.height-toggleBox.height)<=1);
   assert.equal(await field.evaluate(node=>getComputedStyle(node).borderTopWidth),'1px');
   assert.equal(await toggle.evaluate(node=>getComputedStyle(node).borderLeftWidth),'1px');
   assert.ok(toggleBox.x+toggleBox.width<=generateBox.x);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
   await page.screenshot({path:`artifacts/account-password-toggle-${engine.name()}-${width}.png`,fullPage:true});
   await editor.getByRole('button',{name:'关闭'}).click();
   await page.getByRole('button',{name:'+ 新建'}).click();
   await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();
   assert.equal(await editor.locator('input[name=credentialPassword]').first().getAttribute('type'),'password');
  }finally{await page.close();await ownBrowser.close()}
 }
});

test('功能2：空闲超时自动锁库，清 vaultKey 并回到解锁界面',async()=>{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 try{
  // 用测试钩子把空闲超时压到 1.2 秒
  await page.addInitScript(()=>{window.__IDLE_LOCK_MS=1200});
  await register(page);
  assert.equal(await page.locator('#vault').isVisible(),true);
  // 静置超过阈值,不产生任何活动
  await page.waitForTimeout(2200);
  // 应已锁库:auth 可见、vault 隐藏
  await page.locator('#auth').waitFor({state:'visible'});
  assert.equal(await page.locator('#vault').isVisible(),false,'超时后应锁库');
  // vaultKey 已清空(内存)
  assert.equal(await page.evaluate(()=>window.__vaultKeyPresent?.()??'nohook'),false);
  assert.deepEqual(errors,[]);
 }finally{await page.close()}
});

test('功能2：有活动时不锁库（活动重置计时器）',async()=>{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 try{
  await page.addInitScript(()=>{window.__IDLE_LOCK_MS=1200});
  await register(page);
  // 每 500ms 点击一次,持续 2.5s,保持活跃
  for(let i=0;i<5;i++){await page.mouse.click(10,10);await page.waitForTimeout(500)}
  assert.equal(await page.locator('#vault').isVisible(),true,'持续活动不应锁库');
  assert.deepEqual(errors,[]);
 }finally{await page.close()}
});

test('账号自定义字段可新增多类型、排序、加密保存并在详情独立操作',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});const writes=[];page.on('request',r=>{if(r.method()==='PUT'&&/\/api\/entries\//.test(r.url()))writes.push(r.postData()||'')});try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();const editor=page.getByRole('dialog',{name:'新建账号'});await editor.getByLabel('平台').fill('自定义字段平台');await editor.getByLabel('登录网址').fill('https://login.example.com');await editor.getByRole('textbox',{name:'账号 1',exact:true}).fill('dakota');await editor.locator('input[name="credentialPassword"]').fill('fixed-secret');for(const [label,type,value] of [['安全答案','密码/敏感内容','secret-answer'],['管理后台','网址','https://admin.example.com'],['到期日期','日期','2027-08-09'],['说明','多行文本','第一行\n第二行']]){await editor.getByRole('button',{name:'添加字段'}).click();let row=editor.locator('.custom-field-row').last();await row.getByLabel(/字段名称/).fill(label);await row.getByRole('button',{name:/字段类型/}).click();const picker=page.getByRole('dialog',{name:'选择字段类型'}),selected=picker.locator('[aria-checked="true"]'),pickerGeometry=await picker.evaluate(d=>{const form=d.querySelector('form'),head=d.querySelector('.dialog-head'),options=d.querySelector('#custom-field-type-options'),selected=options.querySelector('[aria-checked="true"]'),r=x=>x.getBoundingClientRect(),s=x=>getComputedStyle(x);return{dialog:r(d),formPadding:s(form).padding,headPadding:s(head).padding,left:r(selected).left-r(d).left,right:r(d).right-r(selected).right,bottom:r(d).bottom-r(options.lastElementChild).bottom,outlineWidth:parseFloat(s(selected).outlineWidth),borderWidth:parseFloat(s(selected).borderTopWidth),selectedText:selected.textContent,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}});assert.equal(pickerGeometry.formPadding,'0px');assert.ok(parseFloat(pickerGeometry.headPadding)>=14,JSON.stringify(pickerGeometry));assert.ok(pickerGeometry.left>=19&&pickerGeometry.right>=19&&pickerGeometry.bottom>=19,JSON.stringify(pickerGeometry));assert.ok(pickerGeometry.dialog.width<=350,JSON.stringify(pickerGeometry));assert.ok(pickerGeometry.borderWidth===2,JSON.stringify(pickerGeometry));assert.equal(await selected.evaluate(el=>getComputedStyle(el,'::after').content),'"当前"');assert.equal(pickerGeometry.overflow,false);await picker.getByRole('radio',{name:type,exact:true}).click();await picker.waitFor({state:'hidden'});row=editor.locator('.custom-field-row').last();assert.equal(await row.getByRole('button',{name:/字段类型/}).evaluate(el=>document.activeElement===el),true);await row.getByLabel(/字段内容/).fill(value)}const rows=editor.locator('.custom-field-row');const mobileLayout=await rows.first().evaluate(row=>{const name=row.querySelector('label:first-of-type'),type=row.querySelector('.custom-field-type-group'),value=row.querySelector('label:last-of-type'),remove=row.querySelector('.remove-custom-field'),r=x=>x.getBoundingClientRect();return{name:r(name),type:r(type),value:r(value),remove:r(remove),row:r(row),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}});assert.ok(mobileLayout.name.bottom<mobileLayout.type.top&&mobileLayout.type.bottom<mobileLayout.value.top&&mobileLayout.value.bottom<mobileLayout.remove.top,JSON.stringify(mobileLayout));for(const box of [mobileLayout.name,mobileLayout.type,mobileLayout.value,mobileLayout.remove])assert.ok(Math.abs(box.left-mobileLayout.row.left)<=14&&mobileLayout.row.right-box.right<=14,JSON.stringify(mobileLayout));assert.ok(mobileLayout.remove.height>=44);assert.equal(mobileLayout.overflow,false);const editorState=await rows.evaluateAll(nodes=>nodes.map(n=>({name:n.querySelector('[aria-label^="字段名称"]')?.value,type:n.querySelector('.custom-field-type-trigger')?.textContent,value:n.querySelector('[aria-label^="字段内容"]')?.value})));assert.deepEqual(editorState,[{name:'安全答案',type:'密码/敏感内容',value:'secret-answer'},{name:'管理后台',type:'网址',value:'https://admin.example.com'},{name:'到期日期',type:'日期',value:'2027-08-09'},{name:'说明',type:'多行文本',value:'第一行\n第二行'}]);await rows.nth(3).getByRole('button',{name:/拖动字段/}).press('ArrowUp');await editor.getByRole('button',{name:'保存'}).click();await editor.waitFor({state:'hidden'});assert.ok(writes.length);for(const body of writes)for(const secret of ['安全答案','secret-answer','管理后台','admin.example.com'])assert.equal(body.includes(secret),false);await page.locator('.item-card').filter({hasText:'自定义字段平台'}).click();const detail=page.locator('#detail');await detail.getByText('安全答案',{exact:true}).waitFor();assert.equal(await detail.locator('[data-custom-field]').evaluateAll(rows=>rows.map(r=>r.querySelector('strong').textContent).join('|')),'安全答案|管理后台|说明|到期日期');assert.match(await detail.getByText('安全答案',{exact:true}).locator('..').textContent(),/••••/);await detail.getByRole('button',{name:'显示 安全答案'}).click();assert.equal(await detail.getByText('secret-answer',{exact:true}).count(),1);await detail.getByRole('button',{name:'复制 安全答案'}).click();await detail.getByRole('button',{name:'打开 管理后台'}).waitFor()}finally{await page.close();if(own!==browser)await own.close()}}});

test('隐私级别卡片多行说明不与选中边框重叠且打开从顶部开始',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{await register(page);await page.evaluate(()=>localStorage.setItem('pass-vault-privacy','titles'));await page.getByRole('button',{name:'更多'}).click();await page.getByRole('menuitem',{name:'隐私模式'}).click();const dialog=page.getByRole('dialog',{name:'保护级别'}),options=dialog.locator('.privacy-options'),card=dialog.locator('.privacy-options label').filter({has:page.locator('input[value="titles"]')});await dialog.waitFor({state:'visible'});const metrics=await card.evaluate(el=>{const text=el.querySelector('small').getBoundingClientRect(),box=el.getBoundingClientRect(),options=el.parentElement;return{textBottom:text.bottom,boxBottom:box.bottom,gap:box.bottom-text.bottom,height:box.height,scrollTop:options.scrollTop,firstTop:options.firstElementChild.getBoundingClientRect().top,optionsTop:options.getBoundingClientRect().top}});assert.ok(metrics.gap>=11,JSON.stringify(metrics));assert.ok(metrics.height>=82,JSON.stringify(metrics));assert.equal(metrics.scrollTop,0);assert.ok(metrics.firstTop>=metrics.optionsTop)}finally{await page.close();if(own!==browser)await own.close()}}});

test('多账号凭据卡片只在组标题显示序号且手柄归属标题',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();const editor=page.locator('#editor'),row=editor.locator('.credential-row').first();await row.waitFor();const visible=await row.evaluate(el=>({legend:[...el.querySelector('legend').childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(''),direct:[...el.children].map(x=>x.tagName==='LABEL'?x.childNodes[0]?.textContent?.trim():'').filter(Boolean),handleInLegend:Boolean(el.querySelector('legend>.drag-handle')),directHandle:Boolean(el.querySelector(':scope>.drag-handle')),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}));assert.equal(visible.legend,'第 1 组登录信息');assert.deepEqual(visible.direct,['账号','密码']);assert.equal(visible.handleInLegend,true);assert.equal(visible.directHandle,false);assert.ok(visible.overflow<=1)}finally{await page.close();if(own!==browser)await own.close()}}});

test('新建编辑器在手机端使用紧凑固定外框、内部滚动和固定操作栏',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();const editor=page.getByRole('dialog',{name:'新建账号'}),fields=editor.locator('#fields'),head=editor.locator('.dialog-head'),actions=editor.locator('.dialog-actions');await editor.waitFor({state:'visible'});await page.waitForTimeout(450);const before=await editor.evaluate((d)=>{const f=d.querySelector('#fields'),h=d.querySelector('.dialog-head'),a=d.querySelector('.dialog-actions'),r=x=>x.getBoundingClientRect(),s=x=>getComputedStyle(x);return{dialog:r(d),head:r(h),fields:r(f),actions:r(a),overflow:s(f).overflowY,formPadding:s(d.querySelector('form')).padding,headPaddingTop:s(h).paddingTop,actionsPaddingTop:s(a).paddingTop,viewport:innerHeight}});assert.ok(before.dialog.height<=before.viewport*.73+2,JSON.stringify(before));assert.equal(before.overflow,'auto');assert.equal(before.formPadding,'0px');assert.ok(parseFloat(before.headPaddingTop)>=14);assert.ok(parseFloat(before.actionsPaddingTop)>=10);assert.ok(before.actions.bottom<=before.dialog.bottom+1);await fields.evaluate(el=>el.scrollTop=el.scrollHeight);const after=await editor.evaluate(d=>({height:d.getBoundingClientRect().height,headOffset:d.querySelector('.dialog-head').getBoundingClientRect().top-d.getBoundingClientRect().top,actionsBottom:d.querySelector('.dialog-actions').getBoundingClientRect().bottom,dialogBottom:d.getBoundingClientRect().bottom}));assert.ok(Math.abs(after.height-before.dialog.height)<=1,JSON.stringify({before:before.dialog.height,after}));assert.ok(Math.abs(after.headOffset-(before.head.top-before.dialog.top))<=1);assert.ok(Math.abs(after.actionsBottom-after.dialogBottom)<=1)}finally{await page.close();if(own!==browser)await own.close()}}});

test('所有二级窗口统一限制为紧凑视口高度',async()=>{const page=await browser.newPage({viewport:{width:390,height:844}});try{await page.goto(base);const result=await page.evaluate(()=>[...document.querySelectorAll('dialog')].map(d=>({id:d.id,maxHeight:getComputedStyle(d).maxHeight})));for(const row of result)assert.ok(parseFloat(row.maxHeight)<=844*.82+2,JSON.stringify(row))}finally{await page.close()}});

test('安全中心异步加载前后保持固定窗口高度并仅内部滚动',async()=>{for(const engine of [chromium,webkit]){const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844}});try{await register(page);await page.getByRole('button',{name:'更多'}).click();await page.getByRole('menuitem',{name:'安全中心'}).click();const center=page.getByRole('dialog',{name:'安全中心'}),scroll=center.locator('.security-scroll');await center.waitFor({state:'visible'});const initialHeight=await center.evaluate(el=>el.offsetHeight);assert.ok(initialHeight);await page.waitForFunction(()=>document.querySelector('#security-session-status')?.textContent==='');const loadedHeight=await center.evaluate(el=>el.offsetHeight);assert.ok(loadedHeight);assert.ok(Math.abs(loadedHeight-initialHeight)<=1,`安全中心异步加载后布局高度跳变：${initialHeight} -> ${loadedHeight}`);const metrics=await center.evaluate(el=>{const scroll=el.querySelector('.security-scroll'),style=getComputedStyle(el);return{height:el.getBoundingClientRect().height,maxHeight:parseFloat(style.maxHeight),overflow:style.overflow,scrollOverflow:getComputedStyle(scroll).overflowY,scrollClient:scroll.clientHeight,scrollHeight:scroll.scrollHeight,viewport:window.innerHeight}});assert.ok(metrics.height<=metrics.viewport-15,JSON.stringify(metrics));assert.equal(metrics.overflow,'hidden');assert.equal(metrics.scrollOverflow,'auto');assert.ok(metrics.scrollClient<=metrics.scrollHeight);assert.ok(metrics.height>=500,'安全中心应在打开时预留稳定高度')}finally{await page.close();if(own!==browser)await own.close()}}});

test('安全中心自动锁定与剪贴板设置使用自有选择弹窗',async()=>{
 for(const engine of [chromium,webkit]){
  const own=engine===chromium?browser:await engine.launch({headless:true}),page=await own.newPage({viewport:{width:390,height:844},colorScheme:'dark'});
  try{
   await register(page);await page.getByRole('button',{name:'更多'}).click();await page.getByRole('menuitem',{name:'安全中心'}).click();
   const center=page.getByRole('dialog',{name:'安全中心'});await center.waitFor({state:'visible'});
   assert.equal(await center.locator('select').count(),0);
   const idle=center.getByRole('button',{name:'自动锁定时间，当前5 分钟'});await idle.click();
   let picker=page.getByRole('dialog',{name:'选择自动锁定时间'});await picker.getByRole('radio',{name:'1 分钟',exact:true}).click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('pass-vault-idle-lock-ms')),'60000');
   const clipboard=center.getByRole('button',{name:'剪贴板自动清除，当前1 分钟'});await clipboard.click();
   picker=page.getByRole('dialog',{name:'选择剪贴板自动清除时间'});await picker.getByRole('radio',{name:'15 秒',exact:true}).click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('pass-vault-clipboard-clear-ms')),'15000');
   assert.match(await center.locator('#security-clipboard-hint').textContent(),/15 秒自动清除/);
  }finally{await page.close();if(engine!==chromium)await own.close()}
 }
});

test('设置：自动锁定时间迁入安全中心并持久化，"从不"则不自动锁',async()=>{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await register(page);
  await page.getByRole('button',{name:'更多'}).click();
  assert.equal(await page.locator('#idle-lock-setting').count(),0,'更多一级菜单不应再重复显示自动锁定');
  await page.getByRole('menuitem',{name:'安全中心'}).click();
  const dlg=page.getByRole('dialog',{name:'安全中心'}),setting=dlg.locator('#security-idle-lock');
  await dlg.waitFor({state:'visible'});
  assert.equal(await setting.textContent(),'5 分钟','默认应为 5 分钟');
  await setting.click();await page.getByRole('dialog',{name:'选择自动锁定时间'}).getByRole('radio',{name:'1 分钟',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('pass-vault-idle-lock-ms')),'60000','应持久化 1 分钟=60000ms');
  await setting.click();await page.getByRole('dialog',{name:'选择自动锁定时间'}).getByRole('radio',{name:'从不',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('pass-vault-idle-lock-ms')),'0','从不应持久化为 0');
  await page.evaluate(()=>{ if(typeof resetIdleTimer==='function') resetIdleTimer(); });
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(()=>window.__vaultKeyPresent()),true,'“从不”时不应自动锁库');
  assert.equal(await page.locator('#vault').isVisible(),true,'仍应停留在密码库');
  assert.deepEqual(errors,[]);
 }finally{await page.close()}
});

test('手机详情返回动画完整播放到 animationend 再替换 DOM，不被中途取消',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await register(page);await create(page,'网站',{'名称':'返回动画网站','网址':'https://example.com','说明':'','标签（逗号分隔）':''});
 await page.locator('.item-card',{hasText:'返回动画网站'}).click();await page.locator('#detail.open').waitFor();
 await page.evaluate(()=>{window.__m={start:0,end:0,cancel:0,domAfterEnd:null};const d=document.querySelector('#detail');
  d.addEventListener('animationstart',e=>{if(e.animationName==='mobile-detail-out')window.__m.start++});
  d.addEventListener('animationend',e=>{if(e.animationName==='mobile-detail-out'){window.__m.end++;window.__m.endAt=performance.now()}});
  d.addEventListener('animationcancel',e=>{if(e.animationName==='mobile-detail-out')window.__m.cancel++});
  new MutationObserver(muts=>{for(const mu of muts)if(mu.type==='childList'&&mu.removedNodes.length){window.__m.domReplacedAt=performance.now();if(window.__m.end>0&&window.__m.domAfterEnd===null)window.__m.domAfterEnd=true;else if(window.__m.end===0)window.__m.domAfterEnd=false}}).observe(d,{childList:true});});
 await page.locator('#detail .mobile-back').click();
 await page.waitForFunction(()=>window.__m&&window.__m.domReplacedAt!==undefined,{timeout:3000});
 const m=await page.evaluate(()=>window.__m);
 assert.equal(m.start,1,'应恰好触发一次入场退场动画');
 assert.equal(m.end,1,'退场动画必须播放到 animationend（修复前因固定 180ms 定时器提前替换 DOM 导致从不触发）');
 assert.equal(m.cancel,0,'退场动画不得被 animationcancel 中途取消');
 assert.equal(m.domAfterEnd,true,'DOM 必须在 animationend 之后才替换，避免截断动画尾部');
 assert.equal(await page.locator('#detail .empty').count(),1,'返回后应回到空详情占位');
 assert.deepEqual(errors,[]);await page.close();
});

test('分组管理中删除按钮为危险红色以区分重命名，且触控区不小于 44px',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await register(page);
 await page.locator('#groups').click();await page.locator('#groups-dialog[open]').waitFor();
 await page.locator('#groups-form [name="newGroup"]').fill('测试分组');
 await page.locator('#groups-form').evaluate(f=>f.requestSubmit());
 await page.locator('.group-row',{hasText:'测试分组'}).waitFor();
 const m=await page.evaluate(()=>{
  const row=[...document.querySelectorAll('.group-row')].find(r=>r.textContent.includes('测试分组')&&r.children.length===3);
  const rename=row.children[1],del=row.children[2];const cs=getComputedStyle;
  const danger=cs(document.documentElement).getPropertyValue('--danger').trim();
  return {delColor:cs(del).color,renameColor:cs(rename).color,delH:Math.round(del.getBoundingClientRect().height),renameH:Math.round(rename.getBoundingClientRect().height),delClass:del.classList.contains('group-remove'),danger};
 });
 // --danger 解析为 rgb 供比较
 const dangerRgb=await page.evaluate(hex=>{const d=document.createElement('div');d.style.color=hex;document.body.append(d);const c=getComputedStyle(d).color;d.remove();return c},m.danger);
 assert.equal(m.delClass,true,'删除按钮应带 group-remove 类');
 assert.equal(m.delColor,dangerRgb,'删除按钮文字应为危险色');
 assert.notEqual(m.renameColor,dangerRgb,'重命名按钮不应为危险色（保持普通色以区分）');
 assert.ok(m.delH>=44,`删除按钮触控高度应≥44px，实际 ${m.delH}`);
 assert.ok(m.renameH>=44,`重命名按钮触控高度应≥44px，实际 ${m.renameH}`);
 assert.deepEqual(errors,[]);await page.close();
});

test('同一账户多标签页同步资料更新，并在任一标签页退出时全部清除内存密钥',async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}}),first=await context.newPage(),second=await context.newPage(),errors=[];
 for(const page of [first,second])page.on('pageerror',e=>errors.push(e.message));
 try{
  const user=await register(first);await first.locator('nav').getByRole('button',{name:'笔记',exact:true}).click();await second.goto(base);await second.locator('#auth-form input[name="username"]').fill(user);await second.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await second.getByRole('button',{name:'登录并解锁'}).click();await second.locator('#vault').waitFor({state:'visible'});
  await create(second,'笔记',{'标题':'跨标签同步验证','正文':'本地解密后显示','标签（逗号分隔）':''});await first.getByText('跨标签同步验证',{exact:true}).waitFor({timeout:10000});
  await second.getByRole('button',{name:'更多',exact:true}).click();await second.getByRole('menuitem',{name:'退出并锁定'}).click();await first.waitForFunction(()=>window.__vaultKeyPresent()===false);await first.locator('#auth').waitFor({state:'visible'});assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('完整加密备份包含附件，导入预览显示数量且恢复保留当前主密码材料',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='PUT'&&r.url().endsWith('/api/backup'))requests.push(JSON.parse(r.postData()||'{}'))});
 try{
  const user=await register(page);await create(page,'笔记',{'标题':'备份验证笔记','正文':'只存在于密文','标签（逗号分隔）':''});
  await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();
  const upload=page.locator('#attachment-upload');await upload.locator('input[type=file]').setInputFiles({name:'backup-proof.txt',mimeType:'text/plain',buffer:Buffer.from('encrypted attachment proof')});await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByText('附件已上传',{exact:true}).waitFor();
  const backup=await page.evaluate(()=>fetch('/api/backup?attachments=1').then(r=>r.json()));assert.equal(backup.version,2);assert.equal(backup.attachments.length,1);assert.ok(backup.entries.length>=1);
  backup.kdf={salt:'tampered',iterations:310000,hash:'SHA-256'};backup.wrappedKey={iv:'tampered',ciphertext:'tampered'};
  await page.locator('#menu').click();await page.getByRole('menuitem',{name:'导入加密备份'}).click();
  await page.locator('#import-file').setInputFiles({name:'complete.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  const dialog=page.locator('#backup-import');await dialog.waitFor({state:'visible'});assert.match(await page.locator('#backup-import-summary').textContent(),/\d+ 条资料和 1 个附件/);
  await page.locator('#backup-import-confirm').click();await page.getByText('加密备份已恢复，当前主密码保持不变',{exact:true}).waitFor();assert.equal(requests.length,1);assert.notEqual(requests[0].kdf.salt,'tampered');assert.notEqual(requests[0].wrappedKey.iv,'tampered');
  await page.getByRole('button',{name:'更多'}).click();await page.getByRole('menuitem',{name:'退出并锁定'}).click();await page.locator('#auth').waitFor({state:'visible'});await page.locator('#auth-form input[name="username"]').fill(user);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});assert.deepEqual(errors,[]);
 }finally{await page.close()}
});

test('完整备份导出响应迟到于锁库时不得创建下载',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}}),downloads=[];let seenResolve,releaseResolve;const seen=new Promise(r=>seenResolve=r),release=new Promise(r=>releaseResolve=r);page.on('download',d=>downloads.push(d.suggestedFilename()));
 try{await register(page);await page.route('**/api/backup?attachments=1',async route=>{seenResolve();await release;await route.continue()});await page.getByRole('button',{name:'更多'}).click();await page.getByRole('menuitem',{name:'导出加密备份'}).click();await page.locator('#export-full').click();await seen;await page.evaluate(()=>window.__lockVaultForTest());releaseResolve();await page.waitForTimeout(250);assert.deepEqual(downloads,[]);assert.equal(await page.getByText('完整加密备份已导出',{exact:true}).count(),0)}finally{releaseResolve?.();await page.close()}
});

test('备份文件读取迟到于锁库时不得重开导入确认',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});try{await register(page);await create(page,'笔记',{'标题':'延迟校验','正文':'秘密','标签（逗号分隔）':''});const backup=await page.evaluate(()=>fetch('/api/backup').then(r=>r.json()));backup.format='pass-vault-v2';await page.evaluate(()=>{const native=File.prototype.text;let release;window.__backupReadStarted=false;window.__releaseBackupRead=()=>release?.();File.prototype.text=async function(){window.__backupReadStarted=true;await new Promise(r=>release=r);return native.call(this)}});await page.locator('#menu').click();await page.getByRole('menuitem',{name:'导入加密备份'}).click();await page.locator('#import-file').setInputFiles({name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>window.__backupReadStarted);await page.evaluate(()=>window.__lockVaultForTest());await page.evaluate(()=>window.__releaseBackupRead());await page.waitForTimeout(250);assert.equal(await page.locator('#backup-import').evaluate(d=>d.open),false)}finally{await page.evaluate(()=>window.__releaseBackupRead?.()).catch(()=>{});await page.close()}
});

for(const [engine,launcher] of [['Chromium',chromium],['WebKit',webkit]])test(`${engine} 后台冻结超过自动锁定时长后恢复会立即锁库，不重新获得完整周期`,async()=>{
 const b=await launcher.launch({headless:true}),page=await b.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.addInitScript(()=>{window.__IDLE_LOCK_MS=1200});
  await register(page);
  await page.locator('#vault').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__vaultKeyPresent()),true);
  await page.evaluate(()=>{window.__lastActivityAt(Date.now()-2000);dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))});
  await page.waitForFunction(()=>window.__vaultKeyPresent()===false);
  await page.locator('#auth').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await b.close()}
});

test('分组管理选中项边框用 inset 阴影绘制在项内，不溢出滚动容器右边缘',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await register(page);
 await page.locator('#groups').click();await page.locator('#groups-dialog[open]').waitFor();
 // 建足够多分组撑出滚动条
 for(const n of ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']){
   await page.locator('#groups-form [name="newGroup"]').fill(n);
   await page.locator('#groups-form').evaluate(f=>f.requestSubmit());
   await page.locator('.group-row',{hasText:n}).waitFor();
 }
 // 当前「默认」已是选中项；选择动作现在会自动关闭，因此直接检查打开态选中框
 const m=await page.evaluate(()=>{
   const list=document.querySelector('#groups-list');
   const sel=list.querySelector('[data-group-choice][aria-pressed="true"]');
   const cs=getComputedStyle(sel);
   const r=sel.getBoundingClientRect(),lr=list.getBoundingClientRect();
   return {boxShadow:cs.boxShadow,outline:cs.outlineStyle,selRight:r.right,listRight:lr.right,scrollable:list.scrollHeight>list.clientHeight};
 });
 assert.match(m.boxShadow,/inset/,'选中框应用 inset box-shadow 绘制在项内');
 assert.equal(m.outline,'none','选中态不应再用会外溢的 outline');
 assert.ok(m.selRight<=m.listRight+0.5,`选中项右边 ${m.selRight} 不得溢出容器右边 ${m.listRight}`);
 assert.equal(m.scrollable,true,'列表应处于可滚动状态以复现原始裁切场景');
 assert.deepEqual(errors,[]);await page.close();
});
