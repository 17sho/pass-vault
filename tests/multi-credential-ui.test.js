import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fillTestInvite, withTestInviteEnv } from './fixtures.mjs';

const port=4321,base=`http://localhost:${port}`;
let server,dir;
async function register(page){const username=`multi-${Date.now()}-${Math.random()}`;await page.goto(base);await page.getByRole('button',{name:'创建新库'}).click();await fillTestInvite(page);await page.getByLabel('用户名').fill(username);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'创建并进入'}).click();await page.locator('#vault').waitFor({state:'visible'});return username}
async function login(page,username){await page.getByLabel('用户名').fill(username);await page.getByLabel('主密码',{exact:true}).fill('correct horse battery staple');await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'})}
async function openAccount(page){await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'账号',exact:true}).click();return page.locator('#editor')}
async function fillBase(editor,name='Multi Account'){await editor.getByLabel('平台').fill(name);await editor.getByLabel('登录网址').fill('https://example.test');await editor.getByLabel('备注').fill('notes')}
async function addRows(editor,rows){for(let i=1;i<rows.length;i++)await editor.getByRole('button',{name:'+ 添加账号'}).click();for(let i=0;i<rows.length;i++){await editor.locator('input[name=credentialUsername]').nth(i).fill(rows[i][0]);await editor.locator('input[name=credentialPassword]').nth(i).fill(rows[i][1])}}
async function saveAccount(page,editor){const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&/\/api\/entries\//.test(r.url())&&r.ok());await editor.getByRole('button',{name:'保存'}).click();await saved;await editor.waitFor({state:'hidden'})}

test.before(async()=>{dir=await mkdtemp(join(tmpdir(),'pv119-ui-'));server=spawn(process.execPath,['apps/server/server.mjs'],{env:{...withTestInviteEnv(),PORT:String(port),DB_PATH:join(dir,'vault.sqlite'),COOKIE_SECURE:'false'}});for(let i=0;i<80;i++){try{if((await fetch(base)).ok)return}catch{}await new Promise(r=>setTimeout(r,75))}throw Error('server timeout')});
test.after(async()=>{if(server?.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r))}await rm(dir,{recursive:true,force:true})});

for(const [browserName,launcher,contextOptions] of [['Chromium',chromium,{}],['WebKit',webkit,{...devices['iPhone 13']}]] )test(`${browserName}: multi-account create/detail/edit persists without runtime errors`,async()=>{const browser=await launcher.launch({headless:true}),context=await browser.newContext(contextOptions),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});try{const username=await register(page);const editor=await openAccount(page);assert.equal(await editor.locator('.credential-row').count(),1);assert.deepEqual(await editor.locator('.credential-row legend').allTextContents(),['≡第 1 组登录信息']);await fillBase(editor);await addRows(editor,[['alice','secret-1'],['bob','secret-2'],['carol','secret-3']]);assert.deepEqual(await editor.locator('.credential-row legend').allTextContents(),['≡第 1 组登录信息','≡第 2 组登录信息','≡第 3 组登录信息']);await editor.getByRole('button',{name:'移除账号 2'}).click();assert.deepEqual(await editor.locator('.credential-row legend').allTextContents(),['≡第 1 组登录信息','≡第 2 组登录信息']);await saveAccount(page,editor);await page.getByText('已保存',{exact:true}).waitFor();await page.locator('.item-card',{hasText:'Multi Account'}).click();const detail=page.locator('#detail');assert.match(await detail.textContent(),/账号 1alice.*密码 1.*账号 2carol.*密码 2/s);assert.doesNotMatch(await detail.textContent(),/secret-[13]/);await detail.getByRole('button',{name:'显示密码 1'}).click();assert.match(await detail.textContent(),/secret-1/);assert.doesNotMatch(await detail.textContent(),/secret-3/);await detail.getByRole('button',{name:'显示密码 2'}).click();assert.match(await detail.textContent(),/secret-3/);await detail.getByRole('button',{name:'编辑'}).click();await editor.getByRole('button',{name:'移除账号 1'}).click();await editor.getByRole('button',{name:'+ 添加账号'}).click();await editor.locator('input[name=credentialUsername]').nth(1).fill('dave');await editor.locator('input[name=credentialPassword]').nth(1).fill('secret-4');await saveAccount(page,editor);await page.reload();await login(page,username);await page.locator('.item-card',{hasText:'Multi Account'}).click();assert.match(await page.locator('#detail').textContent(),/账号 1carol.*账号 2dave/s);assert.deepEqual(errors,[])}finally{await context.close();await browser.close()}});

test('empty row policy, minimum one, maximum twenty, and 320px accessibility',async()=>{const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:320,height:800}});try{await register(page);const editor=await openAccount(page);await fillBase(editor,'Limits');await addRows(editor,[['valid','secret'],['','']]);await saveAccount(page,editor);await page.locator('.item-card',{hasText:'Limits'}).click();assert.equal(await page.locator('#detail .credential-detail').count(),2);await page.locator('#detail').getByRole('button',{name:'编辑'}).click();for(let i=1;i<20;i++)await editor.getByRole('button',{name:'+ 添加账号'}).click();assert.equal(await editor.locator('.credential-row').count(),20);assert.equal(await editor.getByRole('button',{name:'+ 添加账号'}).isDisabled(),true);for(let i=19;i>0;i--)await editor.getByRole('button',{name:`移除账号 ${i+1}`}).click();assert.equal(await editor.locator('.credential-row').count(),1);assert.equal(await editor.getByRole('button',{name:/移除账号/}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);assert.deepEqual(await editor.locator('input[name=credentialUsername]').evaluateAll(xs=>xs.map(x=>x.getAttribute('aria-label'))),['账号 1'])}finally{await browser.close()}});

for(const [browserName,launcher] of [['Chromium',chromium],['WebKit',webkit]])for(const width of [390,320])test(`${browserName} ${width}: account legends stay horizontal and the save action remains reachable`,async()=>{const browser=await launcher.launch({headless:true}),page=await browser.newPage({viewport:{width,height:844}});try{await register(page);const editor=await openAccount(page);await fillBase(editor,`Legend ${width}`);await editor.locator('input[name=credentialUsername]').fill('long.account.name.with.many.characters@example.test');await editor.locator('input[name=credentialPassword]').fill('secret');for(let i=1;i<20;i++)await editor.getByRole('button',{name:'+ 添加账号'}).click();const inspection=await editor.evaluate(dialog=>{const legends=[...dialog.querySelectorAll('.credential-row legend')].map(legend=>{const style=getComputedStyle(legend),rect=legend.getBoundingClientRect(),row=legend.parentElement.getBoundingClientRect();return{text:legend.textContent,display:style.display,whiteSpace:style.whiteSpace,width:rect.width,height:rect.height,lineHeight:parseFloat(style.lineHeight),rowWidth:row.width,overflow:rect.right>row.right+1}});const save=dialog.querySelector('button[type=submit]'),visual=window.visualViewport;const fields=dialog.querySelector('#fields');const scroller=(fields&&getComputedStyle(fields).overflowY.match(/auto|scroll/))?fields:dialog;scroller.scrollTop=scroller.scrollHeight;const rect=save.getBoundingClientRect(),top=visual?.offsetTop??0,bottom=top+(visual?.height??innerHeight);return{legends,scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,scrollTop:scroller.scrollTop,save:{top:rect.top,bottom:rect.bottom,visible:rect.bottom<=bottom+2&&rect.top>=top-2},viewport:{top,bottom},documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}});assert.equal(inspection.documentOverflow,false);assert.ok(inspection.scrollHeight>inspection.clientHeight,JSON.stringify(inspection));assert.ok(inspection.scrollTop>0,JSON.stringify(inspection));assert.equal(inspection.save.visible,true,JSON.stringify(inspection));for(const legend of inspection.legends){assert.equal(legend.whiteSpace,'nowrap',JSON.stringify(legend));assert.ok(legend.width>=40&&legend.width<=legend.rowWidth,JSON.stringify(legend));assert.ok(legend.height<=Math.max(36,legend.lineHeight*1.8),JSON.stringify(legend));assert.equal(legend.overflow,false,JSON.stringify(legend))}await page.screenshot({path:`artifacts/account-editor-${browserName.toLowerCase()}-${width}.png`})}finally{await browser.close()}});

test('编辑弹窗在手机高度内滚动且不带动背景列表，保存按钮可达',async()=>{
  for(const [browserName,launcher] of [['Chromium',chromium],['WebKit',webkit]]){
    const browser=await launcher.launch({headless:true});
    const page=await browser.newPage({viewport:{width:390,height:700}});
    try{
      await register(page);
      // make background list tall enough to detect scroll leakage
      await page.evaluate(()=>{
        const list=document.querySelector('#list');
        if(!list)return;
        list.replaceChildren();
        for(let i=0;i<40;i++){
          const card=document.createElement('div');
          card.className='item-card';
          card.style.height='56px';
          card.textContent=`BG ${i+1}`;
          list.append(card);
        }
      });
      const editor=await openAccount(page);
      await fillBase(editor,'Scroll Leak Guard');
      await editor.locator('input[name=credentialUsername]').fill('long.account.name.with.many.characters@example.test');
      await editor.locator('input[name=credentialPassword]').fill('secret');
      for(let i=1;i<12;i++) await editor.getByRole('button',{name:'+ 添加账号'}).click();
      const before=await page.evaluate(()=>({
        listTop:document.querySelector('#list')?.scrollTop||0,
        bodyOverflow:getComputedStyle(document.body).overflow,
        htmlOverflow:getComputedStyle(document.documentElement).overflow,
        editorOverflow:getComputedStyle(document.querySelector('#editor')).overflowY,
        fieldsOverflow:getComputedStyle(document.querySelector('#fields')).overflowY,
        editorMax:getComputedStyle(document.querySelector('#editor')).maxHeight,
        locked:document.documentElement.classList.contains('dialog-scroll-lock')
      }));
      assert.ok(/auto|scroll|hidden/.test(before.editorOverflow),JSON.stringify(before));
      assert.ok(/auto|scroll/.test(before.fieldsOverflow),JSON.stringify(before));
      assert.equal(before.locked,true,JSON.stringify(before));
      assert.ok(before.bodyOverflow.includes('hidden')||before.htmlOverflow.includes('hidden'),JSON.stringify(before));
      const mid=await editor.evaluate(dialog=>{
        const fields=dialog.querySelector('#fields');
        const list=document.querySelector('#list');
        const listBefore=list?.scrollTop||0;
        const target=fields && getComputedStyle(fields).overflowY.match(/auto|scroll/)?fields:dialog;
        const beforeTop=target.scrollTop;
        target.scrollTop=target.scrollHeight;
        const save=dialog.querySelector('button[type=submit]');
        const rect=save.getBoundingClientRect();
        const vv=window.visualViewport;
        const top=vv?.offsetTop??0;
        const bottom=top+(vv?.height??innerHeight);
        return{
          scrolled:target.scrollTop>beforeTop,
          listDelta:(list?.scrollTop||0)-listBefore,
          saveVisible:rect.bottom<=bottom+2 && rect.top>=top-2,
          saveBottom:rect.bottom,
          viewportBottom:bottom,
          targetTag:target.id||target.className||target.tagName,
          scrollTop:target.scrollTop,
          scrollHeight:target.scrollHeight,
          clientHeight:target.clientHeight,
        };
      });
      assert.equal(mid.listDelta,0,JSON.stringify(mid));
      assert.ok(mid.scrolled,JSON.stringify(mid));
      assert.equal(mid.saveVisible,true,JSON.stringify(mid));
      await page.mouse.move(195,350);
      await page.mouse.wheel(0,600);
      const afterWheel=await page.evaluate(()=>({listTop:document.querySelector('#list')?.scrollTop||0}));
      assert.equal(afterWheel.listTop,before.listTop,JSON.stringify({before,afterWheel}));
      await editor.getByRole('button',{name:'取消'}).click();
      await editor.waitFor({state:'hidden'});
      const unlocked=await page.evaluate(()=>({
        bodyOverflow:getComputedStyle(document.body).overflow,
        htmlOverflow:getComputedStyle(document.documentElement).overflow,
        locked:document.documentElement.classList.contains('dialog-scroll-lock')||document.body.classList.contains('dialog-scroll-lock')
      }));
      // 关闭后只要求锁类已移除；部分浏览器默认 overflow 仍可能是 "hidden auto"
      assert.equal(unlocked.locked,false,JSON.stringify(unlocked));
    }finally{
      await browser.close();
    }
  }
});

test('编辑保存防重复提交，不会因连点产生重复条目',async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  try{
    await register(page);
    const puts=[];
    await page.route('**/api/entries/**',async route=>{
      if(route.request().method()==='PUT'){
        puts.push(route.request().url());
        await new Promise(r=>setTimeout(r,250));
      }
      await route.continue();
    });
    const editor=await openAccount(page);
    await fillBase(editor,'Dup Guard Account');
    await editor.locator('input[name=credentialUsername]').fill('only-one');
    await editor.locator('input[name=credentialPassword]').fill('secret');
    const save=editor.getByRole('button',{name:'保存'});
    await Promise.all([
      save.click({force:true}),
      save.click({force:true}),
      save.click({force:true}),
    ]);
    await page.getByText('已保存',{exact:true}).waitFor();
    await editor.waitFor({state:'hidden'});
    assert.equal(puts.length,1,JSON.stringify(puts));
    assert.equal(await page.locator('.item-card',{hasText:'Dup Guard Account'}).count(),1);
  }finally{
    await browser.close();
  }
});
