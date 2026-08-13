import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join} from 'node:path';
import {chromium,webkit} from 'playwright';
import {normalizeRecoveryRegistry,fieldDiff,encryptSharePackageV2,decryptSharePackageV2,parseShareV2Fragment} from '../public/recovery-share-core.mjs';

const tombstone={type:'note',id:'group_12345678',name:'已删除分组',deletedAt:1700000000000};
test('recovery_registry 规范化保留期和分组墓碑',()=>{
  assert.deepEqual(normalizeRecoveryRegistry({version:1,retentionDays:90,groupTombstones:[tombstone]}),{version:1,retentionDays:90,groupTombstones:[tombstone]});
  assert.equal(normalizeRecoveryRegistry({version:1,retentionDays:8,groupTombstones:[]}),null);
  assert.equal(normalizeRecoveryRegistry({version:1,retentionDays:30,groupTombstones:[{...tombstone,name:'明文\u0000'}]}),null);
});

test('字段 diff 遮挡敏感变化且分享 v2 密码包装可往返',async()=>{
  const changes=fieldDiff({title:'旧标题',secret:'old',removed:'x'},{title:'新标题',secret:'new',added:'y'},new Set(['secret']));
  assert.deepEqual(changes.map(x=>[x.kind,x.path,x.sensitive]),[['modified','title',false],['modified','secret',true],['removed','removed',false],['added','added',false]]);
  const token='T'.repeat(43),value={version:2,records:[{type:'note',plain:{title:'资料'}}],objects:[]};
  const encrypted=await encryptSharePackageV2(value,token,{password:'correct horse'});
  assert.equal(encrypted.fragment.includes(encrypted.packageKey||'never'),false);
  assert.deepEqual(parseShareV2Fragment('#'+encrypted.fragment).mode,'password');
  assert.deepEqual(await decryptSharePackageV2(encrypted.envelope,encrypted.fragment,token,'correct horse'),value);
  await assert.rejects(()=>decryptSharePackageV2(encrypted.envelope,encrypted.fragment,token,'wrong'));
});

let server,base;
test.before(async()=>{server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://x').pathname,file=pathname==='/'?'public/index.html':pathname==='/share'?'public/share.html':pathname.startsWith('/shared/')?pathname.slice(1):join('public',pathname.slice(1)),body=await readFile(file);res.setHeader('content-type',({'.html':'text/html','.mjs':'text/javascript','.css':'text/css'}[extname(file)]||'application/octet-stream'));res.end(body)}catch{res.statusCode=404;res.end()}}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`});
test.after(()=>new Promise(resolve=>server.close(resolve)));

const dialogIds=['trash-dialog','trash-preview-dialog','history-dialog','history-preview-dialog','share-create-dialog','share-result-dialog','shares-dialog','trash-delete-dialog','trash-empty-dialog'];
const longText='很长的加密资料标题'.repeat(30);
function injectLongContent(node){
  const scroll=node.querySelector('.dialog-scroll,#trash-list,#history-list,.share-dialog-body,#shares-list.secure-list');
  if(scroll)for(let i=0;i<24;i++){const row=document.createElement('button');row.type='button';row.textContent=`${i} ${'长内容'.repeat(25)}`;row.style.minHeight='48px';scroll.append(row)}
}

for(const engine of [chromium,webkit]) for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:320,height:700},{width:320,height:420}]) test(`${engine.name()} ${viewport.width}x${viewport.height} 恢复与分享二级窗口真实长内容门禁`,async()=>{
  const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport,reducedMotion:'reduce'});
  try{
    await page.goto(base);
    assert.equal(await page.locator('select').count(),0);
    for(const id of dialogIds){
      const dialog=page.locator('#'+id);
      if(!await dialog.count())continue;
      assert.equal(await dialog.evaluate(node=>getComputedStyle(node).display),'none',`${id} close display`);
      await dialog.evaluate((node,text)=>{node.querySelectorAll('h2,p,strong').forEach(x=>x.textContent=text);const scroll=node.querySelector('.dialog-scroll,#trash-list,#history-list,.share-dialog-body,#shares-list.secure-list');if(scroll)for(let i=0;i<24;i++){const row=document.createElement('button');row.type='button';row.textContent=`${i} ${'长内容'.repeat(25)}`;row.style.minHeight='48px';scroll.append(row)}node.showModal()},longText);
      const before=await dialog.evaluate(node=>{const scroll=[...node.querySelectorAll('*')].filter(x=>{const s=getComputedStyle(x);return ['auto','scroll'].includes(s.overflowY)&&x.scrollHeight>x.clientHeight+1});const header=node.querySelector('.dialog-head,.share-dialog-head'),footer=node.querySelector('.dialog-actions,.share-dialog-actions,.trash-footer'),r=node.getBoundingClientRect();return{display:getComputedStyle(node).display,direction:getComputedStyle(node).flexDirection,height:r.height,overflowX:node.scrollWidth-node.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth,scrollCount:scroll.length,scroll:scroll[0]||null,head:header?.getBoundingClientRect().toJSON(),foot:footer?.getBoundingClientRect().toJSON(),touch:[...node.querySelectorAll('button,label.share-session-choice')].filter(x=>getComputedStyle(x).display!=='none').map(x=>({text:x.textContent.trim(),w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height}))}});
      assert.equal(before.display,['trash-preview-dialog','history-preview-dialog'].includes(id)?'block':'flex',id);
      assert.ok(before.height<=viewport.height*.82+3,`${id} height ${before.height}`);
      assert.ok(before.overflowX<=1&&before.pageOverflow<=1,`${id} overflow`);
      assert.ok(before.scrollCount<=1,`${id} scroll count ${before.scrollCount}`);
      for(const t of before.touch)assert.ok(t.w>=43.5&&t.h>=43.5,`${id} touch ${t.text} ${t.w}x${t.h}`);
      if(before.scroll){
        const after=await dialog.evaluate(node=>{const s=[...node.querySelectorAll('*')].find(x=>['auto','scroll'].includes(getComputedStyle(x).overflowY)&&x.scrollHeight>x.clientHeight+1);const h=node.querySelector('.dialog-head,.share-dialog-head'),f=node.querySelector('.dialog-actions,.share-dialog-actions,.trash-footer');s.scrollTop=s.scrollHeight;return{head:h?.getBoundingClientRect().toJSON(),foot:f?.getBoundingClientRect().toJSON(),top:s.scrollTop}});
        assert.ok(after.top>0,`${id} content scrolls`);
        if(before.head&&after.head)assert.ok(Math.abs(before.head.top-after.head.top)<1,`${id} header fixed`);
        if(before.foot&&after.foot)assert.ok(Math.abs(before.foot.bottom-after.foot.bottom)<1,`${id} footer fixed`);
      }
      await dialog.evaluate(node=>node.close());
      assert.equal(await dialog.evaluate(node=>getComputedStyle(node).display),'none',`${id} closed`);
    }
    const create=page.locator('#share-create-dialog');await create.evaluate(node=>node.showModal());
    await create.getByRole('radio',{name:'精确时间'}).click();
    for(const locator of [create.getByLabel('分享密码（可选）'),create.getByLabel('精确到期时间'),create.getByRole('radio',{name:'首次打开后失效'}),create.getByRole('checkbox',{name:'仅一个浏览器会话'})])assert.ok(await locator.isVisible());
    const sessionTarget=await create.locator('.share-session-choice').evaluate(x=>x.getBoundingClientRect().toJSON());assert.ok(sessionTarget.height>=43.5);
  }finally{await browser.close()}
});

for(const engine of [chromium,webkit])for(const viewport of [{width:390,height:844},{width:430,height:932}])test(`${engine.name()} ${viewport.width}x${viewport.height} 恢复中心短列表不拉伸且操作不裁切`,async()=>{
  const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport,reducedMotion:'reduce'});
  try{
    await page.goto(base);
    const geometry=await page.locator('#trash-dialog').evaluate(node=>{
      const host=node.querySelector('#trash-list');
      const row=(title,meta)=>{const article=document.createElement('article');article.className='trash-item';const select=document.createElement('button');select.className='recovery-select';select.setAttribute('aria-label',`选择 ${title}`);const info=document.createElement('div'),strong=document.createElement('b'),small=document.createElement('span'),actions=document.createElement('div');strong.textContent=title;small.textContent=meta;info.append(strong,small);actions.className='trash-actions';for(const text of ['预览','恢复','彻底删除']){const button=document.createElement('button');button.textContent=text;if(text==='彻底删除')button.className='danger-button';actions.append(button)}article.append(select,info,actions);return article};
      host.replaceChildren(row('银行卡及超长名称用于验证','自定义资料 · 一个很长的分组名称 · 剩余 30 天'),row('1','笔记 · 默认 · 剩余 16 天'));node.showModal();
      const dialog=node.getBoundingClientRect(),rows=[...host.querySelectorAll('.trash-item')].map(item=>{const r=item.getBoundingClientRect(),actions=item.querySelector('.trash-actions').getBoundingClientRect();return{right:r.right,actionsRight:actions.right,actionsLeft:actions.left,buttons:[...item.querySelectorAll('.trash-actions button')].map(x=>x.getBoundingClientRect().toJSON())}});return{dialog:dialog.toJSON(),rows,list:host.getBoundingClientRect().toJSON(),footer:node.querySelector('.trash-footer').getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth-innerWidth}
    });
    assert.ok(geometry.dialog.height<700,`短列表弹窗不应拉伸到 ${geometry.dialog.height}px`);
    assert.ok(geometry.rows.every(row=>row.actionsRight<=geometry.dialog.right-11&&row.right<=geometry.dialog.right-11),'行操作必须保留右侧内边距');
    assert.ok(geometry.rows.every(row=>row.buttons.every(button=>button.width>=43.5&&button.height>=43.5)),'操作按钮需满足触控尺寸');
    assert.ok(Math.abs(geometry.rows[0].actionsLeft-geometry.rows[1].actionsLeft)<1,'不同标题长度的操作区必须对齐');
    assert.ok(geometry.footer.top>=geometry.list.bottom-1,'页脚应紧随短列表而非留下弹性空白');
    assert.ok(geometry.overflow<=1);
  }finally{await browser.close()}
});

for(const engine of [chromium,webkit])for(const id of ['trash-preview-dialog','history-preview-dialog'])test(`${engine.name()} iPhone短内容 ${id} 按内容收缩且业务化展示`,async()=>{
  const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try{await page.goto(base);const result=await page.locator('#'+id).evaluate((node,id)=>{const body=node.querySelector(id==='trash-preview-dialog'?'#trash-preview-body':'#history-preview');if(id==='trash-preview-dialog'){body.replaceChildren();const meta=document.createElement('p');meta.className='recovery-preview-meta';meta.textContent='笔记 · 默认';body.append(meta);for(const [label,value] of [['标题','1'],['正文','1']]){const section=document.createElement('section'),strong=document.createElement('strong'),pre=document.createElement('pre');section.className='recovery-preview-field';strong.textContent=label;pre.textContent=value;section.append(strong,pre);body.append(section)}}else{body.replaceChildren();const section=document.createElement('section'),strong=document.createElement('strong'),values=document.createElement('div');section.className='history-diff-row modified';strong.textContent='标题 · 已修改';values.className='history-diff-values';for(const [label,value] of [['历史版本','旧标题'],['当前版本','新标题']]){const block=document.createElement('div'),span=document.createElement('span'),pre=document.createElement('pre');span.textContent=label;pre.textContent=value;block.append(span,pre);values.append(block)}section.append(strong,values);body.append(section)}node.showModal();const rect=node.getBoundingClientRect(),children=[...node.children].map(x=>x.offsetHeight),close=node.querySelector('.dialog-head>button').getBoundingClientRect(),actions=node.querySelector('.dialog-actions').getBoundingClientRect();return{height:rect.height,natural:children.reduce((a,b)=>a+b,0),close:close.toJSON(),actions:actions.toJSON(),text:node.innerText,overflow:document.documentElement.scrollWidth-innerWidth,columns:getComputedStyle(node.querySelector('.history-diff-values')||body).gridTemplateColumns}},id);assert.ok(result.height<520,`${id}不应拉伸到${result.height}px`);assert.ok(Math.abs(result.height-result.natural)<9,`${id} ${JSON.stringify(result)}`);assert.ok(result.close.width>=43.5&&result.close.height>=43.5);assert.ok(result.actions.bottom<=844);assert.ok(result.overflow<=1);if(id==='trash-preview-dialog'){assert.doesNotMatch(result.text,/title|body|\[\]/)}else{assert.match(result.text,/标题.*已修改/s);assert.doesNotMatch(result.text,/pinned|true|置顶状态/);assert.ok(result.columns.split(' ').length===1)}}finally{await browser.close()}
});

for(const engine of [chromium,webkit])test(`${engine.name()} 历史比较按业务字段渲染且秘密默认遮挡`,async()=>{
  const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try{await page.goto(base);const uuidA='ba63937a-0b5b-467e-a954-35aa048f0e51',uuidB='28464553-ae64-4c1c-b813-e762c63237a0';await page.evaluate(([a,b])=>{window.__renderHistoryDiff({title:'旧资料',pinned:true,fields:[{id:a,label:'普通字段',type:'text',value:'j'}]},{title:'新资料',fields:[{id:a,label:'普通字段',type:'text',value:'j'},{id:b,label:'恢复码',type:'secret',value:'Secret-R'}]});document.querySelector('#history-preview-dialog').showModal()},[uuidA,uuidB]);const dialog=page.locator('#history-preview-dialog'),text=await dialog.innerText();assert.match(text,/标题 · 已修改/);assert.match(text,/恢复码 · 当前版本新增/);assert.match(text,/••••••••/);assert.doesNotMatch(text,/ba63937a|28464553|\bsecret\b|置顶状态|Secret-R/);const values=dialog.locator('.history-diff-row').filter({hasText:'恢复码'});await values.getByRole('button',{name:'显示'}).click();assert.match(await values.innerText(),/Secret-R/);const geometry=await values.locator('.history-diff-values').evaluate(node=>({columns:getComputedStyle(node).gridTemplateColumns,overflow:document.documentElement.scrollWidth-innerWidth}));assert.equal(geometry.columns.split(' ').length,1);assert.ok(geometry.overflow<=1)}finally{await browser.close()}
});

for(const engine of [chromium,webkit])test(`${engine.name()} 320x420 匿名分享固定头尾且内容唯一内滚`,async()=>{
  const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport:{width:320,height:420},reducedMotion:'reduce'});
  try{
    await page.goto(base+'/share');
    await page.evaluate(text=>{const host=document.querySelector('#share-view-content');host.hidden=false;document.querySelector('#share-view-status').textContent='已解密';for(let i=0;i<30;i++){const card=document.createElement('article'),header=document.createElement('header'),title=document.createElement('h2'),button=document.createElement('button');card.className='share-record-card';header.className='share-record-head';title.textContent=text;button.className='share-copy-action';button.textContent='复制';header.append(title);card.append(header,button);host.append(card)}},longText);
    const before=await page.evaluate(()=>{const shell=document.querySelector('.share-view-shell'),head=document.querySelector('.share-view-brand'),foot=document.querySelector('.share-view-footnote'),content=document.querySelector('.share-view-content');return{body:document.body.scrollHeight-innerHeight,shell:shell.getBoundingClientRect().toJSON(),head:head.getBoundingClientRect().toJSON(),foot:foot.getBoundingClientRect().toJSON(),content:content.getBoundingClientRect().toJSON(),scrolls:[...document.querySelectorAll('*')].filter(x=>['auto','scroll'].includes(getComputedStyle(x).overflowY)&&x.scrollHeight>x.clientHeight+1).map(x=>x.className),touch:[...content.querySelectorAll('button')].map(x=>x.getBoundingClientRect().height)}});
    assert.ok(before.body<=1);assert.deepEqual(before.scrolls,['share-view-content']);assert.ok(before.touch.every(x=>x>=43.5));
    const after=await page.evaluate(()=>{const c=document.querySelector('.share-view-content'),h=document.querySelector('.share-view-brand'),f=document.querySelector('.share-view-footnote');c.scrollTop=c.scrollHeight;return{top:c.scrollTop,head:h.getBoundingClientRect().top,foot:f.getBoundingClientRect().bottom}});
    assert.ok(after.top>0);assert.ok(Math.abs(after.head-before.head.top)<1);assert.ok(Math.abs(after.foot-before.foot.bottom)<1);
  }finally{await browser.close()}
});

for(const engine of [chromium,webkit])test(`${engine.name()} 匿名分享危险URL不生成可点击链接`,async()=>{
  const browser=await engine.launch({headless:true}),page=await browser.newPage();
  try{
    const id='Z'.repeat(43),keyBytes=crypto.getRandomValues(new Uint8Array(32)),key=Buffer.from(keyBytes).toString('base64url'),cryptoKey=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12)),plain={type:'website',plain:{name:'危险网址',url:'javascript:document.body.dataset.pwned=1',description:'',tags:[]}},ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`pass-vault-v2:share:1:${id}`)},cryptoKey,new TextEncoder().encode(JSON.stringify(plain))),envelope={version:1,iv:Buffer.from(iv).toString('base64url'),ciphertext:Buffer.from(ciphertext).toString('base64url')};
    await page.route('**/api/shares/consume',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({envelope})}));
    await page.goto(`${base}/share#${id}.${key}`);await page.getByText('危险网址',{exact:true}).waitFor();
    assert.equal(await page.locator('a.share-open-link').count(),0);assert.equal(await page.evaluate(()=>document.body.dataset.pwned||''),'');
  }finally{await browser.close()}
});
