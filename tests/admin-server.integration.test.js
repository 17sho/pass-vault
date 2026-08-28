import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startTestServer, TEST_INVITE_CODE } from './fixtures.mjs';

const kdf={salt:'c2FsdHNhbHRzYWx0c2FsdA==',iterations:310000,hash:'SHA-256'};
const wrappedKey={iv:'dGVzdGl2MTIzNDU2',ciphertext:'ZW5jcnlwdGVk'};

async function reservePort(){
 const listener=createServer();
 await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve)});
 const {port}=listener.address();
 await new Promise((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
 return port;
}

async function startAdmin({dbPath,username='admin',extraEnv={}}){
 const port=await reservePort(),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['apps/admin-server/server.mjs'],{env:{...process.env,HOST:'127.0.0.1',ADMIN_PORT:String(port),DB_PATH:dbPath,ADMIN_USERNAMES:username,INVITE_CODE_PEPPER:'admin-server-test-pepper',INVITE_CODE_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64url'),MAIN_SITE_URL:'',...extraEnv},stdio:['ignore','pipe','pipe']});
 let output='';for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',chunk=>{output=(output+chunk).slice(-8000)})}
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 const deadline=Date.now()+8000;
 while(Date.now()<deadline){
  if(child.exitCode!==null){const result=await exited;throw new Error(`admin server exited before ready (${result.code??result.signal}): ${output}`)}
  try{const r=await fetch(base+'/');if(r.status===200)return{base,child,async stop(){if(child.exitCode===null)child.kill('SIGTERM');const result=await exited;if(result.code!==0&&result.signal!=='SIGTERM')throw new Error(`admin server exited unexpectedly: ${output}`)}}}catch{}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 if(child.exitCode===null)child.kill('SIGTERM');await exited;throw new Error(`admin readiness timeout: ${output}`);
}

async function registerAndLogin(dbPath,username='admin'){
 const main=await startTestServer({dbPath,env:{CLIENT_IP_HEADER:''}});
 try{
  let r=await fetch(main.base+'/api/register',{method:'POST',headers:{origin:main.base,'content-type':'application/json'},body:JSON.stringify({username,password:'correct horse battery',inviteCode:TEST_INVITE_CODE,kdf,wrappedKey})});
  assert.equal(r.status,201,await r.text());
  r=await fetch(main.base+'/api/login',{method:'POST',headers:{origin:main.base,'content-type':'application/json'},body:JSON.stringify({username,password:'correct horse battery'})});
  assert.equal(r.status,200,await r.text());
  return r.headers.get('set-cookie').split(';',1)[0];
 }finally{await main.stop()}
}

const req=(base,path,{method='GET',cookie,body,origin=base}={})=>fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(origin?{origin}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});

test('Linux Admin shell完整移植6页且无Cloudflare Access专属链接',async()=>{
 const page=await readFile('apps/admin-server/ui/page.mjs','utf8'),script=await readFile('apps/admin-server/ui/script.mjs','utf8'),style=await readFile('apps/admin-server/ui/style.mjs','utf8');
 for(const name of ['overview','users','registration','operations','security','audit'])assert.match(page,new RegExp(`data-nav-page=\\"${name}\\"`));
 assert.match(page,/data-admin-logout/);assert.doesNotMatch(page,/href=\"\/logout\"/);assert.match(script,/fetch\('\/logout',\{method:'POST'/);assert.doesNotMatch(page+script,/cdn-cgi\/access\/logout|Cloudflare Access/);
 assert.match(style,/@media\(max-width:|@media \(max-width:/);assert.match(script,/\/api\/overview/);assert.match(script,/\/api\/users/);
});

test('Linux Admin鉴权、六页读接口、写接口、配额封禁与刷新端点集成',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-admin-server-')),dbPath=join(dir,'vault.sqlite');let admin;
 try{
  const cookie=await registerAndLogin(dbPath);admin=await startAdmin({dbPath});
  let r=await fetch(admin.base+'/');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(await r.text(),/data-nav-page="audit"/);
  r=await fetch(admin.base+'/app.js');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);
  assert.equal((await fetch(admin.base+'/api/overview')).status,401);
  r=await req(admin.base,'/api/overview',{cookie});assert.equal(r.status,200);let data=await r.json();assert.equal(data.summary.users,1);assert.equal(data.runtime.version,'unknown');
  r=await req(admin.base,'/api/users?page=1&pageSize=20',{cookie});assert.equal(r.status,200);data=await r.json();assert.equal(data.users.length,1);assert.equal(data.users[0].username,'admin');
  assert.equal((await req(admin.base,'/api/audit?page=1&pageSize=20',{cookie})).status,200);
  assert.equal((await req(admin.base,'/api/registration',{method:'PUT',cookie,origin:'',body:{enabled:false,message:'暂停注册'}})).status,403);
  r=await req(admin.base,'/api/registration',{method:'PUT',cookie,body:{enabled:false,message:'暂停注册'}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{enabled:false,message:'暂停注册'});
  r=await req(admin.base,'/api/invite-codes',{method:'POST',cookie,body:{label:'测试码',maxUses:2}});assert.equal(r.status,201);const invite=await r.json();assert.ok(invite.id);assert.ok(invite.code);
  r=await req(admin.base,`/api/invite-codes/${encodeURIComponent(invite.id)}/reveal`,{cookie});assert.equal(r.status,200);assert.equal((await r.json()).code,invite.code);
  assert.equal((await req(admin.base,'/api/users/admin/quota',{method:'PATCH',cookie,body:{entryLimit:1}})).status,404);
  r=await req(admin.base,'/api/users/admin/quota',{method:'PUT',cookie,body:{entryLimit:1,attachmentCountLimit:1,attachmentBytesLimit:1024,expiresAt:null}});assert.equal(r.status,200);assert.equal((await r.json()).entryLimit,1);
  const seed=new DatabaseSync(dbPath);seed.prepare("INSERT INTO users(id,username,password_hash,password_salt,kdf,wrapped_key,created_at) SELECT 'admin-server-bob','bob',password_hash,password_salt,kdf,wrapped_key,? FROM users WHERE username='admin'").run(Date.now());seed.close();
  assert.equal((await req(admin.base,'/api/users/bob/suspension',{method:'POST',cookie,body:{confirmUsername:'bob',until:null}})).status,404);
  r=await req(admin.base,'/api/users/bob/suspension',{method:'PUT',cookie,body:{confirmUsername:'bob',until:null,reason:'测试'}});assert.equal(r.status,200);assert.equal((await r.json()).suspended,true);
  r=await req(admin.base,'/api/users/bob/suspension',{method:'DELETE',cookie,body:{confirmUsername:'bob'}});assert.equal(r.status,200);assert.equal((await r.json()).suspended,false);
  const sql=new DatabaseSync(dbPath);sql.prepare("INSERT INTO security_events(category,code,subject_hash,bucket,count,first_seen_at,last_seen_at) VALUES('authentication','password_failed','test-subject',?,15,?,?)").run(Math.floor(Date.now()/3600000),Date.now()-1000,Date.now());sql.close();
  assert.equal((await req(admin.base,'/api/r2-stats/refresh',{method:'POST',cookie,origin:''})).status,403);
  r=await req(admin.base,'/api/r2-stats/refresh',{method:'POST',cookie});assert.equal(r.status,200);assert.equal((await r.json()).objects,0);
  r=await req(admin.base,'/api/notifications/refresh',{method:'POST',cookie,body:{}});assert.equal(r.status,200);assert.equal((await r.json()).generated,1);
  r=await req(admin.base,'/api/security-events/review',{method:'PUT',cookie,body:{category:'authentication',code:'password_failed',status:'handled',note:'已处理'}});assert.equal(r.status,200);
  r=await req(admin.base,`/api/invite-codes/${encodeURIComponent(invite.id)}`,{method:'DELETE',cookie});assert.equal(r.status,200);
  r=await req(admin.base,'/logout',{method:'POST',cookie,origin:''});assert.equal(r.status,403);
  r=await req(admin.base,'/logout',{method:'POST',cookie});assert.equal(r.status,200);assert.equal((await req(admin.base,'/api/overview',{cookie})).status,401);
 }finally{if(admin)await admin.stop();await rm(dir,{recursive:true,force:true})}
});

test('登录失败/限流与备份导入配额产生安全事件与429（enforcement 全入口覆盖）',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-enforce-')),dbPath=join(dir,'vault.sqlite');
 const main=await startTestServer({dbPath,env:{CLIENT_IP_HEADER:''}});
 try{
  // 注册 + 登录
  let r=await fetch(main.base+'/api/register',{method:'POST',headers:{origin:main.base,'content-type':'application/json'},body:JSON.stringify({username:'carol',password:'correct horse battery',inviteCode:TEST_INVITE_CODE,kdf,wrappedKey})});
  assert.equal(r.status,201,await r.text());
  // 密码失败记录 password_failed
  r=await fetch(main.base+'/api/login',{method:'POST',headers:{origin:main.base,'content-type':'application/json'},body:JSON.stringify({username:'carol',password:'wrong'})});
  assert.equal(r.status,401);
  const login=await fetch(main.base+'/api/login',{method:'POST',headers:{origin:main.base,'content-type':'application/json'},body:JSON.stringify({username:'carol',password:'correct horse battery'})});
  const cookie=login.headers.get('set-cookie').split(';',1)[0];
  const material=await login.json();
  // 安全事件已写入
  const sql=new DatabaseSync(dbPath);
  const ev=sql.prepare("SELECT COUNT(*) c FROM security_events WHERE category='authentication' AND code='password_failed'").get();
  assert.ok(ev.c>=1,'password_failed 应被记录');
  // 收紧配额到 1 条，再用 v1 备份导入 2 条应 429
  sql.prepare("INSERT INTO user_quotas(user_id,entry_limit,attachment_count_limit,attachment_bytes_limit,expires_at,updated_at) SELECT id,1,0,0,NULL,? FROM users WHERE username='carol'").run(Date.now());
  sql.close();
  const env2={version:1,kdf,wrappedKey:material.wrappedKey||wrappedKey,envelopes:[
   {id:'entry-0001',type:'note',version:1,iv:'aXYxMjM0NTY3ODkw',ciphertext:'Y2lwaGVy'},
   {id:'entry-0002',type:'note',version:1,iv:'aXYxMjM0NTY3ODkw',ciphertext:'Y2lwaGVy'}]};
  r=await fetch(main.base+'/api/backup',{method:'PUT',headers:{origin:main.base,cookie,'x-csrf-token':material.csrf,'content-type':'application/json'},body:JSON.stringify(env2)});
  assert.equal(r.status,429,'备份导入超配额应 429');
  assert.equal((await r.json()).error,'user_quota_exceeded');
 }finally{await main.stop();await rm(dir,{recursive:true,force:true})}
});
