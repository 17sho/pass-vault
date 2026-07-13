import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { TEST_INVITE_CODE, withTestInviteEnv } from './fixtures.mjs';
import { mkdir } from 'node:fs/promises';

const port = 4317;
const base = `http://localhost:${port}`;
let server, browser;
async function stopFixture() {
  await browser?.close(); browser = undefined;
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
  server = undefined;
}
test.beforeEach(async () => {
  await mkdir('artifacts', { recursive: true });
  server = spawn(process.execPath, ['apps/server/server.mjs'], { env: { ...withTestInviteEnv(), PORT: String(port), DB_PATH: `/tmp/pass-vault-ui-${process.pid}.sqlite`, COOKIE_SECURE: 'false' } });
  await new Promise((resolve, reject) => { const deadline=Date.now()+5000; const ping=async()=>{try{const r=await fetch(base);if(r.ok)return resolve()}catch{} if(Date.now()>deadline)return reject(Error('server timeout'));setTimeout(ping,80)};ping() });
  browser = await chromium.launch({headless:true});
});
test.afterEach(stopFixture);

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
  await page.waitForTimeout(1500);
  if (!(await page.locator('#vault').isVisible())) throw Error(`auth failed: ${await page.locator('#auth-error').textContent()} url=${page.url()}`);
  return username;
}
async function create(page,type, values){
  await page.getByRole('button',{name:'+ 新建'}).click();
  await page.locator('#picker').getByRole('button',{name:type,exact:true}).click();
  const editor = page.locator('#editor'), fields={...values};
  if(type==='账号'){
    await editor.locator('input[name=credentialUsername]').fill(fields['账号']??'');
    await editor.locator('input[name=credentialPassword]').fill(fields['密码']??'');
    delete fields['账号']; delete fields['密码'];
  }
  for(const [label,value] of Object.entries(fields)) await editor.getByLabel(label,{exact:true}).fill(value);
  await editor.getByRole('button',{name:'保存'}).click();
}

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
 assert.deepEqual(await page.locator('#fields label').allTextContents(),['分组默认','名称','网址','说明','标签（逗号分隔）']);
 assert.equal(await editor.getByLabel('账号',{exact:true}).count(),0); assert.equal(await editor.getByLabel('密码',{exact:true}).count(),0);
 await editor.getByLabel('名称',{exact:true}).fill('Example');await page.getByLabel('网址',{exact:true}).fill('https://example.com');await page.getByRole('button',{name:'保存'}).click();
 await create(page,'笔记',{'标题':'购物清单','正文':'牛奶','标签（逗号分隔）':'生活'});
 await page.locator('nav').getByRole('button',{name:'网站',exact:true}).click();await page.getByPlaceholder('搜索当前分类').fill('牛奶');assert.equal(await page.locator('.item-card').count(),0);
 await page.getByPlaceholder('搜索当前分类').fill('example');assert.equal(await page.locator('.item-card').count(),1);await page.locator('.item-card').click();await page.getByRole('button',{name:'编辑'}).click();
 assert.equal(await page.locator('#editor button[data-type], #editor select[name="type"], #editor input[name="type"]').count(),0);
 assert.equal(await page.getByRole('button',{name:'删除此条目'}).count(),1);
 await page.getByRole('button',{name:'取消'}).click();
 await page.locator('#editor').waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'删除此条目'}).isVisible(),false);
 await page.getByRole('button',{name:'更多',exact:true}).click();
 assert.equal(await page.getByRole('menuitem').count(),7);
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
 try{await register(page);for(let i=1;i<=12;i++){await create(page,'网站',{'名称':`长列表网站 ${String(i).padStart(2,'0')}`,'网址':`https://site-${i}.example`,'说明':'移动菜单回归','标签（逗号分隔）':''});await page.getByText('已保存',{exact:true}).waitFor()}
  const evidence=[];for(const index of [0,5,11]){await page.locator('.item-card').nth(index).waitFor({state:'visible'});await page.locator('.item-card').nth(index).scrollIntoViewIfNeeded();const card=page.locator('.item-card').nth(index),more=card.getByRole('button',{name:/的更多操作/});await more.click();const menu=card.getByRole('menu');const state=await menu.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),card=el.closest('.item-card'),list=el.closest('#list'),collection=el.closest('.collection');return{rect:{top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height},hidden:el.hidden,display:s.display,visibility:s.visibility,position:s.position,zIndex:s.zIndex,viewport:{width:innerWidth,height:innerHeight},overflow:{card:getComputedStyle(card).overflow,list:getComputedStyle(list).overflow,collection:getComputedStyle(collection).overflow},documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}});evidence.push({index,...state});assert.equal(state.hidden,false);assert.ok(state.rect.top>=0&&state.rect.bottom<=state.viewport.height,JSON.stringify(state));assert.ok(state.rect.left>=0&&state.rect.right<=state.viewport.width,JSON.stringify(state));assert.equal(state.documentOverflow,false);await menu.getByRole('menuitem',{name:'编辑'}).click();assert.equal(await page.locator('#editor').isVisible(),true);await page.locator('#editor').getByRole('button',{name:'取消'}).click();await page.locator('#editor').waitFor({state:'hidden'})}
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

test('列表快速删除成功且剩余列表不重复入场',async()=>{
 const page=await browser.newPage();await register(page);await create(page,'笔记',{'标题':'保留条目','正文':'正文','标签（逗号分隔）':''});await create(page,'笔记',{'标题':'快速删除成功','正文':'正文','标签（逗号分隔）':''});
 await page.getByRole('button',{name:'快速删除成功的更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'删除'}).click();
 await page.route('**/api/entries/*',async route=>{if(route.request().method()==='DELETE'){await new Promise(r=>setTimeout(r,150));await route.continue()}else await route.continue()});
 const confirm=page.getByRole('button',{name:'确认删除'});await confirm.click();const deleting=page.getByRole('button',{name:'删除中…'});await deleting.waitFor();assert.equal(await deleting.isDisabled(),true);
 await page.getByText('已删除',{exact:true}).waitFor();assert.equal(await page.locator('.item-card',{hasText:'快速删除成功'}).count(),0);const remaining=page.locator('.item-card',{hasText:'保留条目'});assert.equal(await remaining.evaluate(e=>e.classList.contains('list-enter')),false);assert.equal(await remaining.evaluate(e=>getComputedStyle(e).animationName),'none');await page.close();
});

test('详情可直接删除且失败显示中文反馈并保留条目',async()=>{
 const page=await browser.newPage();await register(page);await create(page,'笔记',{'标题':'删除失败条目','正文':'正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'删除失败条目'}).click();
 await page.route('**/api/entries/*',route=>route.request().method()==='DELETE'?route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal_error"}'}):route.continue());
 await page.locator('#detail').getByRole('button',{name:'删除'}).click();await page.getByRole('button',{name:'确认删除'}).click();await page.locator('#delete-error').getByText(/删除失败：服务器暂时异常，请稍后再试/).waitFor();
 assert.equal(await page.getByRole('dialog',{name:'确认删除'}).isVisible(),true);assert.equal(await page.locator('.item-card',{hasText:'删除失败条目'}).count(),1);await page.close();
});

test('详情用北京时间显示四类创建时间，时间页脚是最后子元素且移动端不溢出',async()=>{const page=await browser.newPage({viewport:{width:320,height:800}});await register(page);await create(page,'笔记',{'标题':'时间笔记','正文':'正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'时间笔记'}).click();const footer=page.locator('#detail .detail-created');assert.equal(await footer.textContent(),await footer.evaluate(e=>'创建于 '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(e.dateTime))));assert.equal(await footer.evaluate(e=>e===e.parentElement.lastElementChild),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);await page.close()});

test('改密弹窗显隐状态复位、统一焦点环与响应式截图',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:800}});await register(page);
 const open=async()=>{await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('menuitem',{name:'修改密码'}).click()};
 await open();const dialog=page.getByRole('dialog',{name:'修改主密码'}),inputs=dialog.locator('input[type="password"]'),toggles=dialog.locator('[data-password-toggle]');assert.equal(await inputs.count(),3);
 await toggles.first().click();assert.equal(await dialog.locator('input[name="current"]').getAttribute('type'),'text');assert.equal(await toggles.first().getAttribute('aria-pressed'),'true');
 await dialog.getByRole('button',{name:'取消'}).click();await open();assert.deepEqual(await dialog.locator('input').evaluateAll(xs=>xs.map(x=>x.type)),['password','password','password']);assert.deepEqual(await toggles.allTextContents(),['显示','显示','显示']);assert.deepEqual(await toggles.evaluateAll(xs=>xs.map(x=>x.getAttribute('aria-pressed'))),['false','false','false']);
 const emptyError=await dialog.locator('#current-error').evaluate(e=>({height:e.getBoundingClientRect().height,display:getComputedStyle(e).display}));assert.equal(emptyError.height,0);assert.equal(emptyError.display,'none');
 const group=dialog.locator('.password-input').first(),input=dialog.locator('input[name="current"]');const styles=await input.evaluate(e=>({border:getComputedStyle(e).borderTopWidth,outline:getComputedStyle(e).outlineStyle}));assert.equal(styles.border,'0px');await input.focus();const focused=await group.evaluate(e=>({outline:getComputedStyle(e).outlineStyle,outlineWidth:getComputedStyle(e).outlineWidth}));assert.equal(focused.outline,'solid');assert.notEqual(focused.outlineWidth,'0px');
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

test('改密弹窗字段校验阻止请求，服务端错误就地显示，成功后回登录',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}}),runtimeErrors=[];page.on('pageerror',e=>runtimeErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')runtimeErrors.push(m.text())});await register(page);await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('menuitem',{name:'修改密码'}).click();
 const dialog=page.getByRole('dialog',{name:'修改主密码'});assert.match(await dialog.textContent(),/至少 12 个字符/);assert.equal(await dialog.locator('input[name="confirm"]').count(),1);
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
   await register(page);await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('menuitem',{name:'修改用户名'}).click();
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

test('改用户名弹窗校验、显隐复位、错误就地显示，成功后新用户名以原密码解锁原数据',async()=>{for(const engine of [chromium,webkit])for(const width of [320,390]){const b=await engine.launch({headless:true}),context=await b.newContext({viewport:{width,height:844}}),page=await context.newPage();try{await register(page);await create(page,'笔记',{'标题':'改名后仍可解密','正文':'保留的加密资料','标签（逗号分隔）':''});const old=await page.evaluate(()=>fetch('/api/session').then(r=>r.json()).then(x=>x.username));await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('menuitem',{name:'修改用户名'}).click();const d=page.getByRole('dialog',{name:'修改登录名'});await d.waitFor({state:'visible'});assert.equal(await d.getByLabel('当前账户名').inputValue(),old);assert.equal(await d.getByLabel('当前账户名').isEditable(),false);let requests=0;page.on('request',r=>{if(r.url().endsWith('/api/change-username'))requests++});await d.getByRole('button',{name:'确认修改'}).click();assert.equal(requests,0);assert.match(await d.textContent(),/请输入新用户名.*请输入当前主密码/s);await d.getByLabel('新账户名').fill(old);await d.locator('input[name=currentPassword]').fill('correct horse battery staple');await d.getByRole('button',{name:'确认修改'}).click();assert.equal(requests,0);assert.match(await d.textContent(),/新用户名不能与当前用户名相同/);await d.getByLabel('新账户名').fill(`renamed-${width}-${engine.name()}-${Date.now()}`);await d.locator('input[name=currentPassword]').fill('wrong password here');await d.getByRole('button',{name:'显示当前主密码'}).click();assert.equal(await d.locator('input[name=currentPassword]').getAttribute('type'),'text');await d.getByRole('button',{name:'确认修改'}).click();await d.getByText('当前密码不正确').waitFor();await d.getByRole('button',{name:'取消'}).click();await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('menuitem',{name:'修改用户名'}).click();await d.waitFor({state:'visible'});assert.equal(await d.locator('input[name=currentPassword]').getAttribute('type'),'password');assert.equal(await d.locator('input[name=currentPassword]').inputValue(),'');const next=`new-${width}-${engine.name()}-${Date.now()}`;await d.getByLabel('新账户名').fill(next);await d.locator('input[name=currentPassword]').fill('correct horse battery staple');await d.getByRole('button',{name:'确认修改'}).click();await page.locator('#auth').waitFor({state:'visible'});assert.match(await page.locator('#auth-error').textContent(),/用户名已修改/);await page.locator('#auth-form input[name=username]').fill(old);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.getByText('用户名或密码不正确').waitFor();await page.locator('#auth-form input[name=username]').fill(next);await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.locator('nav').getByRole('button',{name:'笔记'}).click();await page.getByText('改名后仍可解密',{exact:true}).click();assert.match(await page.locator('#detail').textContent(),/保留的加密资料/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false)}finally{await context.close();await b.close()}}});

test('新建类型弹窗打开时标题获得初始焦点但不显示焦点框，关闭叉也无框',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await page.getByRole('button',{name:'+ 新建'}).click();const picker=page.locator('#picker'),title=page.locator('#picker-title'),close=picker.getByRole('button',{name:'关闭'});assert.equal(await picker.evaluate(e=>e.contains(document.activeElement)&&document.activeElement===e.querySelector('h2')),true);assert.equal(await title.evaluate(e=>getComputedStyle(e).outlineStyle),'none');assert.equal(await title.evaluate(e=>getComputedStyle(e).boxShadow),'none');assert.equal(await close.evaluate(e=>e.matches(':focus-visible')),false);await page.keyboard.press('Tab');assert.equal(await picker.getByRole('button',{name:'账号',exact:true}).evaluate(e=>e.matches(':focus-visible')),true);await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement?.id),'add');await page.close();
});

test('统一 motion：dialog 退场、reduced motion 与视口无溢出',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await register(page);
 const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return [s.getPropertyValue('--motion-fast').trim(),s.getPropertyValue('--motion-base').trim(),s.getPropertyValue('--motion-slow').trim()]});assert.deepEqual(tokens,['120ms','180ms','240ms']);
 await page.getByRole('button',{name:'+ 新建'}).click();const picker=page.locator('#picker');assert.equal(await picker.getAttribute('data-motion'),'open');await picker.getByRole('button',{name:'关闭'}).click();assert.equal(await picker.getAttribute('data-motion'),'closing');await picker.waitFor({state:'hidden'});assert.equal(await picker.evaluate(e=>e.open),false);
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'+ 新建'}).click();await picker.getByRole('button',{name:'关闭'}).click();assert.equal(await picker.evaluate(e=>e.open),false);
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false)}assert.deepEqual(errors,[]);await page.close();
});

test('顶部更多菜单在打开条目菜单、资料详情、切换分类和点击外部后自动收起',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});await register(page);await create(page,'网站',{'名称':'菜单互斥测试','网址':'https://example.com','说明':'','标签（逗号分隔）':''});
 const top=page.locator('#menu-panel'),trigger=page.getByRole('button',{name:'更多',exact:true});
 await trigger.click();assert.equal(await top.isVisible(),true);await page.getByRole('button',{name:'菜单互斥测试的更多操作',exact:true}).evaluate(button=>button.click());assert.equal(await top.isHidden(),true);assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await page.getByRole('menuitem',{name:'编辑',exact:true}).isVisible(),true);
 await trigger.click();assert.equal(await page.getByRole('menuitem',{name:'编辑',exact:true}).isHidden(),true);assert.equal(await top.isVisible(),true);await page.locator('.item-card',{hasText:'菜单互斥测试'}).evaluate(card=>card.click());assert.equal(await top.isHidden(),true);assert.equal(await page.locator('#detail').isVisible(),true);
 await page.locator('#detail').getByRole('button',{name:'← 返回'}).click();await trigger.click();await page.locator('nav').getByRole('button',{name:'账号',exact:true}).click();assert.equal(await top.isHidden(),true);
 await trigger.click();await page.locator('.toolbar').evaluate(toolbar=>toolbar.click());assert.equal(await top.isHidden(),true);assert.equal(await trigger.getAttribute('aria-expanded'),'false');await page.close();
});

test('附件详情返回按钮仅在手机单栏显示',async()=>{const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});try{await register(page);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传附件'});await upload.getByLabel('选择文件').setInputFiles({name:'back-proof.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByRole('button',{name:'back-proof.png',exact:true}).click();const back=page.locator('#detail').getByRole('button',{name:'← 返回',exact:true});assert.equal(await back.isVisible(),false);await page.setViewportSize({width:390,height:844});assert.equal(await back.isVisible(),true);await back.click();await page.locator('#detail').waitFor({state:'hidden'});assert.equal(await page.locator('#detail').isVisible(),false)}finally{await browser.close()}});

test('附件库上传筛选预览改名删除，笔记可关联与移除图片',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.addInitScript(()=>{window.__revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=value=>{window.__revoked.push(value);revoke(value)}});const user=await register(page);
 assert.equal(await page.locator('nav').getByRole('button',{name:'附件',exact:true}).count(),1);await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();
 const upload=page.getByRole('dialog',{name:'上传附件'});await upload.locator('input[type=file]').setInputFiles({name:'tiny.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await upload.getByRole('button',{name:'加密并上传'}).click();await page.getByText('附件已上传',{exact:true}).waitFor();
 await page.locator('nav').getByRole('button',{name:'附件',exact:true}).click();await page.getByLabel('附件分类').selectOption('image');await page.reload();await page.getByLabel('用户名').fill(user);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});await page.locator('nav').getByRole('button',{name:'附件',exact:true}).click();await page.getByLabel('附件分类').selectOption('image');await page.getByRole('button',{name:'tiny.png',exact:true}).click();await page.locator('#detail img[alt="tiny.png"]').waitFor();assert.equal(await page.locator('#detail img[alt="tiny.png"]').count(),1);
 await page.locator('#detail').getByRole('button',{name:'重命名'}).click();const rename=page.getByRole('dialog',{name:'重命名附件'});await rename.getByLabel('文件名').fill('renamed.png');await rename.getByRole('button',{name:'保存'}).click();await page.locator('#detail').getByRole('heading',{name:'renamed.png',exact:true}).waitFor();await page.locator('#detail').getByRole('button',{name:'← 返回'}).click();assert.ok((await page.evaluate(()=>window.__revoked.length))>0);
 await create(page,'笔记',{'标题':'图片笔记','正文':'正文','标签（逗号分隔）':''});await page.locator('.item-card',{hasText:'图片笔记'}).click();await page.locator('#detail').getByRole('button',{name:'编辑'}).click();const noteEditor=page.locator('#editor');await noteEditor.getByLabel('添加图片').setInputFiles({name:'note.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await noteEditor.getByRole('button',{name:'保存'}).click();await page.locator('#detail img[alt="note.png"]').click();await page.getByRole('dialog',{name:'图片预览'}).getByRole('button',{name:'关闭'}).click();
 await page.locator('#detail').getByRole('button',{name:'编辑'}).click();await page.getByRole('button',{name:'移除 note.png'}).click();await noteEditor.getByRole('button',{name:'保存'}).click();assert.equal(await page.locator('#detail img[alt="note.png"]').count(),0);await page.locator('#detail').getByRole('button',{name:'← 返回'}).click();await page.locator('#detail').waitFor({state:'hidden'});await page.locator('nav').getByRole('button',{name:'附件',exact:true}).click();assert.equal(await page.getByText('note.png',{exact:true}).count(),1);
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false)}assert.deepEqual(errors,[]);await page.close();
});
