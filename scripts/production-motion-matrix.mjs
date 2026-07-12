import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { randomBytes } from 'node:crypto';
import { buildMatrixCases } from './production-motion-matrix-cases.mjs';
const inviteCode=process.env.INVITE_CODE;if(!inviteCode)throw new Error('INVITE_CODE is required');

const exampleSites=[['cf','https://vault-worker.example.workers.dev'],['linux','https://vault.example.com']];
const sites=process.env.MATRIX_SITES?JSON.parse(process.env.MATRIX_SITES):exampleSites;
const navigationTimeout=Number(process.env.MATRIX_NAVIGATION_TIMEOUT_MS||30_000);
const actionTimeout=Number(process.env.MATRIX_ACTION_TIMEOUT_MS||15_000);
const expectedConsole=process.env.MATRIX_EXPECTED_CONSOLE?new RegExp(process.env.MATRIX_EXPECTED_CONSOLE):null;
const caseSpacing=Number(process.env.MATRIX_CASE_SPACING_MS||0);
const runId=`e2e-v114-${Date.now()}-${randomBytes(4).toString('hex')}`;
const caseDefs=buildMatrixCases(sites,{engines:process.env.MATRIX_ENGINES,widths:process.env.MATRIX_WIDTHS,motions:process.env.MATRIX_MOTIONS,caseFilter:process.env.MATRIX_CASE_FILTER});
const usernameFor=({site,base})=>`${runId}-${site}-${base.includes('workers.dev')?'cf':base.includes('localhost')||base.includes('127.0.0.1')?'local':'linux'}`;
const password=`Matrix-${randomBytes(16).toString('base64url')}!`;
const identity={event:'identity',usernames:sites.map(([site,base])=>usernameFor({site,base}))};
console.log(JSON.stringify(identity));

async function register(page,caseDef){await page.goto(caseDef.base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'创建新库'}).click();await page.getByLabel('邀请码').fill(inviteCode);await page.getByLabel('用户名').fill(usernameFor(caseDef));await page.getByLabel('主密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建并进入'}).click();await page.locator('#vault').waitFor({state:'visible'});}
async function login(page,caseDef){await page.goto(caseDef.base,{waitUntil:'domcontentloaded'});await page.getByLabel('用户名').fill(usernameFor(caseDef));await page.getByLabel('主密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录并解锁'}).click();await page.locator('#vault').waitFor({state:'visible'});}
async function create(page,label,values){await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:label,exact:true}).click();const editor=page.locator('#editor'),fields={...values};if(label==='账号'){await editor.locator('input[name=credentialUsername]').fill(fields['账号']??'');await editor.locator('input[name=credentialPassword]').fill(fields['密码']??'');delete fields['账号'];delete fields['密码']}for(const [name,value] of Object.entries(fields))await editor.getByLabel(name,{exact:true}).fill(value);await editor.getByRole('button',{name:'保存'}).click();}
async function seed(page){await create(page,'账号',{'平台':'ACCOUNT-OLD','登录网址':'https://a.example','账号':'alice','密码':'secret','备注':'old detail','标签（逗号分隔）':''});await create(page,'网站',{'名称':'WEBSITE-ONLY','网址':'https://w.example','说明':'site','标签（逗号分隔）':''});await create(page,'笔记',{'标题':'NOTE-ONLY','正文':'note body','标签（逗号分隔）':''});await page.getByRole('button',{name:'+ 新建'}).click();await page.locator('#picker').getByRole('button',{name:'附件',exact:true}).click();await page.locator('#attachment-upload input[type=file]').setInputFiles({name:'MATRIX-FIRST.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwD4WQAAAABJRU5ErkJggg==','base64')});await page.locator('#attachment-upload').getByRole('button',{name:'加密并上传'}).click();await page.getByText('附件已上传',{exact:true}).waitFor();}
async function attachmentSamples(page){await page.locator('nav [data-type="attachment"]').click();const card=page.locator('.item-card',{hasText:'MATRIX-FIRST.png'});await card.waitFor();return page.evaluate(async()=>{const out=[];let prev=0;for(const ms of [0,16,50,120,180,240]){if(ms)await new Promise(r=>setTimeout(r,ms-prev));prev=ms;const card=[...document.querySelectorAll('.item-card')].find(x=>x.textContent.includes('MATRIX-FIRST.png')),s=getComputedStyle(card);out.push({ms,opacity:s.opacity,animationName:s.animationName,animationDelay:s.animationDelay,className:card.className})}return out})}
const state=()=>{const d=document.querySelector('#detail'),l=document.querySelector('#list'),f=document.querySelector('#attachment-filter');return{detailDisplay:getComputedStyle(d).display,detailPointer:getComputedStyle(d).pointerEvents,oldText:d.textContent.includes('ACCOUNT-OLD'),cards:[...l.querySelectorAll('.item-card')].filter(x=>{const s=getComputedStyle(x),r=x.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0}).map((x,index)=>{const s=getComputedStyle(x);return{index,text:x.textContent.trim(),opacity:s.opacity,animationName:s.animationName,animationDelay:s.animationDelay,animationFillMode:s.animationFillMode,className:x.className}}),active:document.querySelector('[data-type][aria-current="page"]')?.dataset.type,filterHidden:f?.hidden??null,list:l.textContent.trim(),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}};

const browsers={};
const teardownErrors=[];
try{
 browsers.chromium=await chromium.launch({headless:true});
 browsers.webkit=await webkit.launch({headless:true});
 for(const [site,base] of sites){const caseDef={site,base};const context=await browsers.chromium.newContext();try{const page=await context.newPage();page.setDefaultNavigationTimeout(navigationTimeout);page.setDefaultTimeout(actionTimeout);await register(page,caseDef);await seed(page)}finally{await context.close().catch(error=>teardownErrors.push(error.message))}}
 let passed=0;
 for(const caseDef of caseDefs){
  if(passed&&caseSpacing)await new Promise(resolve=>setTimeout(resolve,caseSpacing));
  const {site,base,engine,width,reducedMotion}=caseDef;
  const errors=[];let context;let samples=[];
  try{
   context=await browsers[engine].newContext({viewport:{width,height:800},reducedMotion});
   const page=await context.newPage();page.setDefaultNavigationTimeout(navigationTimeout);page.setDefaultTimeout(actionTimeout);
   page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(`console:${m.type()}:${m.text()}`)});page.on('pageerror',e=>errors.push(`pageerror:${e.message}`));
   await login(page,caseDef);const attachment=await attachmentSamples(page);assert.ok(attachment.every(x=>x.opacity==='1'&&x.animationName==='none'),JSON.stringify(attachment));await page.locator('nav [data-type="website"]').click();await page.locator('.item-card',{hasText:'WEBSITE-ONLY'}).waitFor();await page.locator('nav [data-type="account"]').click();await page.locator('.item-card',{hasText:'ACCOUNT-OLD'}).click();await page.locator('#detail').waitFor({state:'visible'});
   samples=await page.evaluate(async stateSource=>{const get=(0,eval)(`(${stateSource})`),out=[{ms:0,...get()}];document.querySelector('[data-type="website"]').click();out.push({ms:'same-frame',...get()});let prev=0;for(const ms of [16,50,120,180,240]){await new Promise(r=>setTimeout(r,ms-prev));prev=ms;out.push({ms,...get()})}return out},state.toString());
   for(const s of samples.slice(1)){assert.equal(s.oldText,false);assert.equal(s.detailDisplay,width<=650?'none':'block');if(width<=650)assert.equal(s.detailPointer,'auto');assert.ok(s.cards.length&&s.cards.every(x=>x.opacity==='1'),JSON.stringify(s.cards));assert.equal(s.active,'website');assert.ok(s.filterHidden===true||s.filterHidden===null);assert.match(s.list,/WEBSITE-ONLY/);assert.equal(s.overflow,false)}
   for(const type of ['note','attachment','account','website']){await page.locator(`nav [data-type="${type}"]`).click();const switched=await page.evaluate(stateSource=>(0,eval)(`(${stateSource})`)(),state.toString());assert.ok(switched.cards.every(x=>x.opacity==='1'),`${type}: ${JSON.stringify(switched.cards)}`)}
   const end=await page.evaluate(stateSource=>(0,eval)(`(${stateSource})`)(),state.toString());assert.equal(end.active,'website');assert.match(end.list,/WEBSITE-ONLY/);assert.doesNotMatch(end.list,/ACCOUNT-OLD|NOTE-ONLY/);
   const unexpected=expectedConsole?errors.filter(x=>!expectedConsole.test(x)):errors;assert.equal(unexpected.length,0,unexpected.join('\n'));passed++;console.log(JSON.stringify({event:'case',site,engine,width,reducedMotion,status:'PASS',consoleBaseline:errors,attachment,samples,end}));
  }catch(error){console.error(JSON.stringify({event:'case',site,engine,width,reducedMotion,status:'FAIL',message:error.message,consoleBaseline:errors,samples}));throw error}
  finally{if(context)await context.close().catch(error=>teardownErrors.push(`${site}/${engine}/${width}/${reducedMotion}: ${error.message}`))}
 }
 console.log(JSON.stringify({event:'matrix',status:'PASS',cases:passed,usernames:identity.usernames,teardownErrors}));
}finally{for(const [name,browser] of Object.entries(browsers))await browser.close().catch(error=>teardownErrors.push(`${name}: ${error.message}`))}
