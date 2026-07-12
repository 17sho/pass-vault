import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { randomBytes } from 'node:crypto';
const inviteCode=process.env.INVITE_CODE;if(!inviteCode)throw new Error('INVITE_CODE is required');

const base = process.argv[2];
if (!base) throw new Error('usage: node scripts/prod-v116-menu-smoke.mjs <base-url> [evidence.json]');
const evidencePath = process.argv[3];
const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const username = `e2e_v116_${suffix}`;
const password = `V116-${randomBytes(18).toString('base64url')}`;
const titles = Array.from({length:12},(_,i)=>`e2e-v116-${suffix}-site-${String(i).padStart(2,'0')}`);
const errors=[];
const engineName=process.argv[4]||'webkit';const width=Number(process.argv[5]||390);const height=Number(process.argv[6]||844);
const browserType={chromium,webkit}[engineName];if(!browserType)throw new Error(`invalid engine ${engineName}`);
const evidence={base,username,titles,engineName,width,height,startedAt:new Date().toISOString(),menus:[],errors,checkpoints:[]};
const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width,height}});
const page=await context.newPage();
page.on('pageerror',e=>errors.push({kind:'pageerror',text:e.message}));
page.on('console',m=>{if(m.type()==='error')errors.push({kind:'console',text:m.text()})});
async function persist(){if(evidencePath)await import('node:fs/promises').then(fs=>fs.writeFile(evidencePath,JSON.stringify(evidence,null,2),{mode:0o600}));}
async function card(title){const locator=page.locator('.item-card',{has:page.locator('.item-content b',{hasText:title})});await assertEventually(async()=>assert.equal(await locator.count(),1),`unique card ${title}`);return locator;}
async function assertEventually(fn,label){let last;for(let i=0;i<50;i++){try{return await fn()}catch(e){last=e;await page.waitForTimeout(100)}}throw new Error(`${label}: ${last?.message}`)}
async function create(title,i){
 await page.getByRole('button',{name:'+ 新建',exact:true}).click();
 await page.locator('#picker').getByRole('button',{name:'网站',exact:true}).click();
 const editor=page.locator('#editor');
 await editor.getByLabel('名称',{exact:true}).fill(title);
 await editor.getByLabel('网址',{exact:true}).fill(`https://v116-${i}.example`);
 await editor.getByLabel('说明',{exact:true}).fill(`production menu smoke ${i}`);
 await editor.getByRole('button',{name:'保存',exact:true}).click();
 await editor.waitFor({state:'hidden'});
 await assertEventually(async()=>assert.equal(await (await card(title)).isVisible(),true),`created ${title}`);
}
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('#auth').waitFor({state:'visible'});
 const submit=page.locator('#auth-form button[type=submit]');
 if((await submit.textContent())?.trim()!=='创建并进入'){
   const toggle=page.locator('#auth-switch');
   assert.equal(await toggle.isVisible(),true,'auth switch must be visible');
   await toggle.click();
 }
 await assertEventually(async()=>assert.equal((await submit.textContent())?.trim(),'创建并进入'),'registration mode');
  await page.getByLabel('邀请码').fill(inviteCode);
 await page.locator('#auth-form input[name=username]').fill(username);
 await page.locator('#auth-form input[name=password]').fill(password);
 await submit.click();
 await page.locator('#vault').waitFor({state:'visible',timeout:30000});
 evidence.checkpoints.push('registered');await persist();
 for(let i=0;i<12;i++)await create(titles[i],i);
 assert.equal(await page.locator('.item-card').count(),12,'exactly 12 cards');
 evidence.checkpoints.push('created-12');await persist();
 for(const index of [0,5,11]){
   const title=titles[index];
   let c=await card(title);await c.scrollIntoViewIfNeeded();
   c=await card(title);const more=c.getByRole('button',{name:`${title}的更多操作`,exact:true});await more.click();
   // Evaluate immediately after click; never retain this menu/card after a render.
   const state=await (await card(title)).getByRole('menu').evaluate(el=>{const r=el.getBoundingClientRect();return{hidden:el.hidden,rect:{top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,position:getComputedStyle(el).position}});
   evidence.menus.push({index,title,...state});
   assert.equal(state.hidden,false);assert.equal(state.position,'fixed');assert.ok(state.rect.top>=0&&state.rect.bottom<=state.viewport.height,JSON.stringify(state));assert.ok(state.rect.left>=0&&state.rect.right<=state.viewport.width,JSON.stringify(state));assert.equal(state.overflow,false);
   c=await card(title);await c.getByRole('menuitem',{name:'编辑',exact:true}).click();
   const editor=page.locator('#editor');await editor.waitFor({state:'visible'});assert.equal(await editor.getByLabel('名称',{exact:true}).inputValue(),title);
   await editor.getByRole('button',{name:'取消',exact:true}).click();await editor.waitFor({state:'hidden'});
   c=await card(title);assert.equal(await c.isVisible(),true);
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
 assert.deepEqual(errors,[]);
 evidence.checkpoints.push('assertions-pass');evidence.result='PASS';
} catch(e){evidence.result='FAIL';evidence.failure=e.stack||String(e);throw e}
finally{evidence.finishedAt=new Date().toISOString();await persist();await context.close();await browser.close();console.log(`V116_SMOKE_${evidence.result} ${JSON.stringify({base,username,menus:evidence.menus,errors,result:evidence.result})}`)}
