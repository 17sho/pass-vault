import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync } from 'node:crypto';
import { validateAdminVerifier } from '../apps/admin-server/runtime.mjs';
import { startTestServer, TEST_INVITE_CODE } from './fixtures.mjs';
import { checkAttachmentReplacementQuota } from '../apps/server/enforcement.mjs';
import { retryMaintenance, repairMaintenance } from '../apps/admin-server/maintenance.mjs';
import { migrateAdminFileDeletions, migrateFileLifecycle } from '../apps/admin-server/migrations-admin.mjs';

const kdf={salt:'c2FsdHNhbHRzYWx0c2FsdA==',iterations:310000,hash:'SHA-256'};
const wrappedKey={iv:'dGVzdGl2MTIzNDU2',ciphertext:'ZW5jcnlwdGVk'};

async function reservePort(){
 const listener=createServer();
 await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve)});
 const {port}=listener.address();
 await new Promise((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
 return port;
}

const ADMIN_PASSWORD='independent admin secret';
const ADMIN_SALT=Buffer.from('0123456789abcdef').toString('base64');
const ADMIN_HASH=scryptSync(ADMIN_PASSWORD,Buffer.from(ADMIN_SALT,'base64'),32,{N:32768,maxmem:64*1024*1024}).toString('base64');

async function startAdmin({dbPath,username='admin',extraEnv={}}){
 const port=await reservePort(),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['apps/admin-server/server.mjs'],{env:{...process.env,HOST:'127.0.0.1',ADMIN_PORT:String(port),DB_PATH:dbPath,ADMIN_USERNAME:username,ADMIN_PASSWORD_SALT:ADMIN_SALT,ADMIN_PASSWORD_HASH:ADMIN_HASH,CLIENT_IP_HEADER:'',INVITE_CODE_PEPPER:'admin-server-test-pepper',INVITE_CODE_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64url'),MAIN_SITE_URL:'',...extraEnv},stdio:['ignore','pipe','pipe']});
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

async function registerAndLogin(dbPath,username='admin',extraEnv={}){
 const main=await startTestServer({dbPath,env:{CLIENT_IP_HEADER:'',...extraEnv}});
 try{
  let r=await fetch(main.base+'/api/register',{method:'POST',headers:{origin:main.base,'content-type':'application/json'},body:JSON.stringify({username,password:'correct horse battery',inviteCode:TEST_INVITE_CODE,kdf,wrappedKey})});
  assert.equal(r.status,201,await r.text());
  r=await fetch(main.base+'/api/login',{method:'POST',headers:{origin:main.base,'content-type':'application/json'},body:JSON.stringify({username,password:'correct horse battery'})});
  assert.equal(r.status,200,await r.text());
  return r.headers.get('set-cookie').split(';',1)[0];
 }finally{await main.stop()}
}

const req=(base,path,{method='GET',cookie,body,origin=base,redirect='follow',headers={}}={})=>fetch(base+path,{method,redirect,headers:{...(cookie?{cookie}:{}),...(origin?{origin}:{}),...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});

test('Linux Admin凭据配置严格拒绝非规范Base64和错误解码长度',()=>{
 assert.deepEqual(validateAdminVerifier(ADMIN_SALT,ADMIN_HASH),{password_salt:ADMIN_SALT,password_hash:ADMIN_HASH});
 const productionSalt=Buffer.alloc(18,7).toString('base64');assert.deepEqual(validateAdminVerifier(productionSalt,ADMIN_HASH),{password_salt:productionSalt,password_hash:ADMIN_HASH});
 for(const [salt,hash] of [['',ADMIN_HASH],[ADMIN_SALT+'!',ADMIN_HASH],[ADMIN_SALT.replace(/=$/,'')+'A',ADMIN_HASH],[Buffer.alloc(7).toString('base64'),ADMIN_HASH],[ADMIN_SALT,ADMIN_HASH+'garbage'],[ADMIN_SALT,Buffer.alloc(31).toString('base64')],[ADMIN_SALT,Buffer.alloc(33).toString('base64')]])assert.throws(()=>validateAdminVerifier(salt,hash),/invalid admin password verifier/);
});

test('Linux Admin独立凭据不依赖密码库用户且会话principal不关联users表',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-admin-separate-identity-')),dbPath=join(dir,'vault.sqlite');let admin;
 try{
  await registerAndLogin(dbPath,'vault-owner');admin=await startAdmin({dbPath});
  assert.equal((await req(admin.base,'/api/admin-login',{method:'POST',body:{username:'admin',password:'correct horse battery'}})).status,401,'密码库主密码不得登录Admin');
  const r=await req(admin.base,'/api/admin-login',{method:'POST',body:{username:'admin',password:ADMIN_PASSWORD}});assert.equal(r.status,200,await r.text());const cookie=r.headers.get('set-cookie').split(';',1)[0];
  assert.equal((await req(admin.base,'/api/overview',{cookie})).status,200);
  const sql=new DatabaseSync(dbPath),cols=sql.prepare('PRAGMA table_info(admin_sessions)').all().map(x=>x.name);assert.ok(cols.includes('principal'));assert.ok(!cols.includes('user_id'));assert.equal(sql.prepare('SELECT principal FROM admin_sessions').get().principal,'admin');sql.close();
 }finally{if(admin)await admin.stop();await rm(dir,{recursive:true,force:true})}
});

test('Linux Admin独立登录签发host-only会话且退出后立即失效',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-admin-own-login-')),dbPath=join(dir,'vault.sqlite');let admin;
 try{
  await registerAndLogin(dbPath,'admin');
  admin=await startAdmin({dbPath});
  let r=await req(admin.base,'/api/admin-login',{method:'POST',body:{username:'admin',password:'wrong'}});assert.equal(r.status,401);
  assert.equal((await req(admin.base,'/api/admin-login',{method:'POST',origin:'',body:{username:'admin',password:ADMIN_PASSWORD}})).status,403);
  for(let i=0;i<9;i++) assert.equal((await req(admin.base,'/api/admin-login',{method:'POST',body:{username:'missing',password:'wrong'}})).status,401);
  assert.equal((await req(admin.base,'/api/admin-login',{method:'POST',body:{username:'admin',password:ADMIN_PASSWORD}})).status,429);
  const rateDb=new DatabaseSync(dbPath);rateDb.prepare("DELETE FROM auth_attempts WHERE key LIKE 'admin-login:%'").run();rateDb.close();
  r=await req(admin.base,'/api/admin-login',{method:'POST',body:{username:'admin',password:ADMIN_PASSWORD}});assert.equal(r.status,200,await r.text());
  const setCookie=r.headers.get('set-cookie');assert.match(setCookie,/^pv_admin_session=/);assert.doesNotMatch(setCookie,/Domain=/i);assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);
  const cookie=setCookie.split(';',1)[0];assert.equal((await req(admin.base,'/api/overview',{cookie})).status,200);
  r=await req(admin.base,'/logout',{method:'POST',cookie,redirect:'manual'});assert.equal(r.status,302);assert.match(r.headers.get('set-cookie'),/^pv_admin_session=;/);assert.equal((await req(admin.base,'/api/overview',{cookie})).status,401);
 }finally{if(admin)await admin.stop();await rm(dir,{recursive:true,force:true})}
});

test('Linux Admin可信反代客户端IP隔离登录限流且未配置时忽略伪造头',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-admin-client-ip-')),dbPath=join(dir,'vault.sqlite');let admin;
 const login=(ip)=>req(admin.base,'/api/admin-login',{method:'POST',headers:{'cf-connecting-ip':ip},body:{username:'admin',password:'wrong'}});
 try{
  await registerAndLogin(dbPath,'admin');admin=await startAdmin({dbPath,extraEnv:{CLIENT_IP_HEADER:'cf-connecting-ip'}});
  for(let i=0;i<10;i++)assert.equal((await login('198.51.100.10')).status,401);
  assert.equal((await login('198.51.100.10')).status,429);
  assert.equal((await login('198.51.100.11')).status,401,'不同可信客户端IP不得连坐');
  const rateDb=new DatabaseSync(dbPath);rateDb.prepare("DELETE FROM auth_attempts WHERE key LIKE 'admin-login:%'").run();rateDb.close();
  for(let i=0;i<10;i++)assert.equal((await login(':::')).status,401);
  assert.equal((await login('1::2::3')).status,429,'非法IPv6必须回退同一个socket限流桶');
  await admin.stop();admin=await startAdmin({dbPath,extraEnv:{CLIENT_IP_HEADER:''}});
  const sql=new DatabaseSync(dbPath);sql.prepare("DELETE FROM auth_attempts WHERE key LIKE 'admin-login:%'").run();sql.close();
  for(let i=0;i<10;i++)assert.equal((await login(`203.0.113.${i+1}`)).status,401);
  assert.equal((await login('203.0.113.250')).status,429,'未配置可信头时伪造头不得绕过socket限流');
 }finally{if(admin)await admin.stop();await rm(dir,{recursive:true,force:true})}
});

test('Linux修改密码库主密码和用户名均不影响独立Admin会话',async()=>{
 for(const mutation of ['password','username']){
  const dir=await mkdtemp(join(tmpdir(),`pv2-admin-revoke-${mutation}-`)),dbPath=join(dir,'vault.sqlite');let admin,main;
  try{
   await registerAndLogin(dbPath,'admin');admin=await startAdmin({dbPath});
   let r=await req(admin.base,'/api/admin-login',{method:'POST',body:{username:'admin',password:ADMIN_PASSWORD}});assert.equal(r.status,200);const adminCookie=r.headers.get('set-cookie').split(';',1)[0];
   main=await startTestServer({dbPath,env:{CLIENT_IP_HEADER:''}});r=await fetch(main.base+'/api/login',{method:'POST',headers:{origin:main.base,'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'correct horse battery'})});assert.equal(r.status,200);const login=await r.json(),mainCookie=r.headers.get('set-cookie').split(';',1)[0];
   const path=mutation==='password'?'/api/change-password':'/api/change-username',body=mutation==='password'?{currentPassword:'correct horse battery',newPassword:'new admin password',kdf,wrappedKey}:{currentPassword:'correct horse battery',newUsername:'admin-renamed'};
   r=await fetch(main.base+path,{method:'POST',headers:{origin:main.base,cookie:mainCookie,'x-csrf-token':login.csrf,'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200,await r.text());
   assert.equal((await req(admin.base,'/api/overview',{cookie:adminCookie})).status,200,`${mutation}后独立Admin会话应保持有效`);
  }finally{if(main)await main.stop();if(admin)await admin.stop();await rm(dir,{recursive:true,force:true})}
 }
});

test('Linux Admin原生表单在Origin缺失时用同源Referer或Fetch Metadata登录',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-admin-native-form-')),dbPath=join(dir,'vault.sqlite');let admin;
 try{
  await registerAndLogin(dbPath,'admin');admin=await startAdmin({dbPath});
  const encoded=new URLSearchParams({username:'admin',password:ADMIN_PASSWORD}).toString();
  for(const headers of [{referer:admin.base+'/'},{'sec-fetch-site':'same-origin'}]){
   const r=await fetch(admin.base+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:encoded});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/');assert.match(r.headers.get('set-cookie'),/^pv_admin_session=/);
  }
  const cross=await fetch(admin.base+'/login',{method:'POST',redirect:'manual',headers:{referer:'https://evil.example/','content-type':'application/x-www-form-urlencoded'},body:encoded});assert.equal(cross.status,403);
 }finally{if(admin)await admin.stop();await rm(dir,{recursive:true,force:true})}
});

test('Linux Admin登录页脚本提交JSON并提供加载和明确错误反馈',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-admin-login-js-')),dbPath=join(dir,'vault.sqlite');let admin;
 try{
  await registerAndLogin(dbPath,'admin');admin=await startAdmin({dbPath});
  let r=await fetch(admin.base+'/');const html=await r.text();assert.match(html,/src="\/login\.js"/);assert.match(html,/data-login-error/);
  r=await fetch(admin.base+'/login.js');assert.equal(r.status,200);const js=await r.text();assert.match(js,/\/api\/admin-login/);assert.match(js,/正在登录/);assert.match(js,/账号或管理员密码错误/);assert.match(js,/reportValidity/);
 }finally{if(admin)await admin.stop();await rm(dir,{recursive:true,force:true})}
});

test('Linux Admin未登录显示独立登录页而非空白控制台',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-admin-login-page-')),dbPath=join(dir,'vault.sqlite');let admin;
 try{
  await registerAndLogin(dbPath,'admin');admin=await startAdmin({dbPath});
  const page=await fetch(admin.base+'/').then(r=>r.text());assert.match(page,/data-admin-login/);assert.match(page,/管理员独立登录/);assert.doesNotMatch(page,/data-nav-page="users"/);
 }finally{if(admin)await admin.stop();await rm(dir,{recursive:true,force:true})}
});

test('Linux Admin shell完整移植6页且无Cloudflare Access专属链接',async()=>{
 const page=await readFile('apps/admin-server/ui/page.mjs','utf8'),script=await readFile('apps/admin-server/ui/script.mjs','utf8'),style=await readFile('apps/admin-server/ui/style.mjs','utf8');
 for(const name of ['overview','users','registration','operations','security','audit'])assert.match(page,new RegExp(`data-nav-page=\\"${name}\\"`));
 assert.match(page,/data-admin-logout/);assert.doesNotMatch(page,/href=\"\/logout\"/);assert.match(script,/fetch\('\/logout',\{method:'POST'/);assert.doesNotMatch(page+script,/cdn-cgi\/access\/logout|Cloudflare Access/);
 assert.match(page,/class=\"skip-link\"/);assert.match(page,/name=\"theme-color\"/);assert.match(page,/aria-live=\"polite\"/);assert.doesNotMatch(page,/required autofocus/);
 assert.match(style,/prefers-reduced-motion/);assert.match(style,/min-height:100dvh/);assert.match(style,/\.empty-state/);assert.match(style,/\.quota-state/);
 assert.match(script,/配额未设置/);assert.match(script,/重新统计附件/);assert.doesNotMatch(script,/SQLite 正常 · SQLite/);
 assert.match(style,/@media\(max-width:|@media \(max-width:/);assert.match(script,/\/api\/overview/);assert.match(script,/\/api\/users/);
 assert.match(style,/\.operations-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(style,/\.operations-actions button\{min-width:0;max-width:100%;white-space:normal/);assert.match(style,/operations-actions \[data-maintenance-repair\].*operations-actions \[data-maintenance\]/);assert.match(script,/class=\\"row-actions operations-actions\\"/);assert.match(script,/class=\\"detail-grid operations-metrics\\"/);
});

test('Linux Admin独立身份大小写精确匹配且不接受密码库共享会话',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-admin-auth-boundary-')),dbPath=join(dir,'vault.sqlite');let admin;
 try{
  const vaultCookie=await registerAndLogin(dbPath,'Admin');
  admin=await startAdmin({dbPath,username:'admin'});
  assert.equal((await req(admin.base,'/api/overview',{cookie:vaultCookie})).status,401,'密码库共享会话不得登录Admin');
  assert.equal((await req(admin.base,'/api/admin-login',{method:'POST',body:{username:'Admin',password:ADMIN_PASSWORD}})).status,401,'Admin不得匹配admin独立用户名');
  const r=await req(admin.base,'/api/admin-login',{method:'POST',body:{username:'admin',password:ADMIN_PASSWORD}});assert.equal(r.status,200);
  assert.equal((await req(admin.base,'/api/overview',{cookie:r.headers.get('set-cookie').split(';',1)[0]})).status,200);
 }finally{if(admin)await admin.stop();await rm(dir,{recursive:true,force:true})}
});

test('Linux Admin鉴权、六页读接口、写接口、配额封禁与刷新端点集成',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-admin-server-')),dbPath=join(dir,'vault.sqlite');let admin;
 try{
  await registerAndLogin(dbPath,'admin',{COOKIE_DOMAIN:'.passkey.23cm.me'});admin=await startAdmin({dbPath,extraEnv:{COOKIE_DOMAIN:'.passkey.23cm.me'}});const cookie=(await req(admin.base,'/api/admin-login',{method:'POST',body:{username:'admin',password:ADMIN_PASSWORD}})).headers.get('set-cookie').split(';',1)[0];
  let r=await req(admin.base,'/',{cookie});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(await r.text(),/data-nav-page="audit"/);
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
  r=await req(admin.base,'/logout',{method:'POST',cookie,redirect:'manual'});assert.equal(r.status,302);assert.match(r.headers.get('set-cookie'),/^pv_admin_session=;/);assert.doesNotMatch(r.headers.get('set-cookie'),/Domain=/i);assert.equal((await req(admin.base,'/api/overview',{cookie})).status,401);
 }finally{if(admin)await admin.stop();await rm(dir,{recursive:true,force:true})}
});

test('旧生命周期schema原子升级为43/43约束并保留协调状态',()=>{
 const db=new DatabaseSync(':memory:'),attachmentKey='a'.repeat(64),dirHash='b'.repeat(64),shareKey=`${'c'.repeat(43)}/${'D'.repeat(43)}`;
 try{
  db.exec(`CREATE TABLE attachments(user_id TEXT,object_key TEXT);CREATE TABLE secure_share_objects(object_key TEXT,uploaded_at INTEGER,upload_lease_token TEXT);
  CREATE TABLE filesystem_maintenance_fence(name TEXT PRIMARY KEY,token TEXT,run_id INTEGER,acquired_at INTEGER);
  CREATE TABLE file_write_intents(tree TEXT,object_key TEXT,dir_hash TEXT DEFAULT '',user_id TEXT,token TEXT,expected_size INTEGER,created_at INTEGER,PRIMARY KEY(tree,dir_hash,object_key));
  CREATE TABLE file_deletion_outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,tree TEXT,object_key TEXT,dir_hash TEXT DEFAULT '',reason TEXT,created_at INTEGER,attempts INTEGER DEFAULT 0,last_error TEXT,UNIQUE(tree,dir_hash,object_key));
  CREATE TABLE admin_file_deletions(id INTEGER PRIMARY KEY AUTOINCREMENT,tree TEXT,object_key TEXT,dir_hash TEXT DEFAULT '',created_at INTEGER);
  INSERT INTO filesystem_maintenance_fence VALUES('delete','fence',7,8);
  INSERT INTO file_write_intents VALUES('attachment','${attachmentKey}','${dirHash}','u','intent',16,9);
  INSERT INTO file_write_intents VALUES('share','bad','','u','bad-intent',-1,10);
  INSERT INTO file_deletion_outbox(tree,object_key,dir_hash,reason,created_at,attempts,last_error) VALUES('share','${shareKey}','','delete',11,2,'retry');
  INSERT INTO file_deletion_outbox(tree,object_key,dir_hash,reason,created_at) VALUES('attachment','bad','','bad',12);
  INSERT INTO admin_file_deletions(tree,object_key,dir_hash,created_at) VALUES('attachment','${attachmentKey}','${dirHash}',13),('share','bad','',14)`);
  assert.equal(migrateFileLifecycle(db),true);assert.equal(migrateAdminFileDeletions(db),false);
  assert.deepEqual({...db.prepare('SELECT token,run_id,acquired_at,owner_id,phase FROM filesystem_maintenance_fence').get()},{token:'fence',run_id:7,acquired_at:8,owner_id:null,phase:'active'});
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_write_intents').get().c,1);assert.equal(db.prepare('SELECT COUNT(*) c FROM file_deletion_outbox').get().c,1);
  assert.deepEqual({...db.prepare('SELECT reason,attempts,last_error,claim_token,claimed_at FROM file_deletion_outbox').get()},{reason:'delete',attempts:2,last_error:'retry',claim_token:null,claimed_at:null});
  assert.equal(db.prepare('SELECT COUNT(*) c FROM admin_file_deletions').get().c,1);assert.equal(db.prepare('SELECT COUNT(*) c FROM legacy_file_deletion_quarantine').get().c,3);
  assert.throws(()=>db.prepare("INSERT INTO file_write_intents VALUES('share','bad','','x','t',1,1)").run(),/constraint/i);
  const sql=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='file_deletion_outbox'").get().sql;assert.match(sql,/length\(substr\(object_key,1,43\)\)=43/);
 }finally{db.close()}
});

test('生命周期升级失败回滚旧表、列、数据与trigger',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE attachments(user_id TEXT,object_key TEXT);CREATE TABLE secure_share_objects(object_key TEXT,uploaded_at INTEGER,upload_lease_token TEXT);
  CREATE TABLE filesystem_maintenance_fence(name TEXT PRIMARY KEY,token TEXT,run_id INTEGER,acquired_at INTEGER);
  CREATE TABLE file_write_intents(tree TEXT,object_key TEXT,dir_hash TEXT,user_id TEXT,token TEXT,expected_size INTEGER,created_at INTEGER);
  CREATE TABLE file_deletion_outbox(id INTEGER PRIMARY KEY,tree TEXT,object_key TEXT,dir_hash TEXT,reason TEXT,created_at INTEGER,attempts INTEGER,last_error TEXT);
  CREATE TABLE legacy_file_deletion_quarantine(id INTEGER PRIMARY KEY,source TEXT,source_key TEXT,error_code TEXT,created_at INTEGER,quarantined_at INTEGER);
  INSERT INTO file_write_intents VALUES('attachment','${'a'.repeat(64)}','${'b'.repeat(64)}','u','one',1,1);
  INSERT INTO file_write_intents VALUES('attachment','${'a'.repeat(64)}','${'b'.repeat(64)}','u','two',1,2)`);
  assert.throws(()=>migrateFileLifecycle(db),/constraint/i);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM file_write_intents').get().c,2);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM pragma_table_info('filesystem_maintenance_fence') WHERE name='owner_id'").get().c,0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='trigger' AND name LIKE 'file_lifecycle_%'").get().c,0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name LIKE '%_lifecycle_old'").get().c,0);
 }finally{db.close()}
});

test('文件引用trigger在fence/outbox下fail-closed并兼容intent及稳定更新',()=>{
 const db=new DatabaseSync(':memory:'),key='a'.repeat(64),dir='b'.repeat(64),share=`${'c'.repeat(43)}/${'D'.repeat(43)}`;
 try{
  db.exec(`CREATE TABLE attachments(user_id TEXT,id TEXT,object_key TEXT,ciphertext_size INTEGER);CREATE TABLE secure_share_objects(object_key TEXT,expected_size INTEGER,ciphertext_size INTEGER,uploaded_at INTEGER,upload_lease_token TEXT)`);migrateFileLifecycle(db);
  assert.throws(()=>db.prepare('INSERT INTO attachments VALUES(?,?,?,?)').run('u','a',key,16),/file_lifecycle/i);
  db.prepare('INSERT INTO file_write_intents VALUES(?,?,?,?,?,?,?)').run('attachment',key,dir,'u','intent',16,1);db.prepare('INSERT INTO attachments VALUES(?,?,?,?)').run('u','a',key,16);
  db.prepare("INSERT INTO filesystem_maintenance_fence(name,token,acquired_at) VALUES('delete','f',1)").run();
  db.prepare("UPDATE attachments SET id='renamed' WHERE id='a'").run();assert.throws(()=>db.prepare('INSERT INTO attachments VALUES(?,?,?,?)').run('u','b',key,16),/file_lifecycle/i);
  db.prepare('DELETE FROM filesystem_maintenance_fence').run();db.prepare('DELETE FROM file_write_intents').run();db.prepare('INSERT INTO file_deletion_outbox(tree,object_key,dir_hash,reason,created_at) VALUES(?,?,?,?,?)').run('attachment',key,dir,'delete',1);
  assert.throws(()=>db.prepare('INSERT INTO attachments VALUES(?,?,?,?)').run('u','c',key,16),/file_lifecycle/i);
  db.prepare('DELETE FROM file_deletion_outbox').run();db.prepare('INSERT INTO file_write_intents VALUES(?,?,?,?,?,?,?)').run('share',share,'',null,'share-intent',9,1);db.prepare('INSERT INTO secure_share_objects VALUES(?,?,?,?,?)').run(share,9,null,null,null);
  db.prepare('UPDATE secure_share_objects SET upload_lease_token=? WHERE object_key=?').run('share-intent',share);db.prepare('UPDATE secure_share_objects SET ciphertext_size=9,uploaded_at=2,upload_lease_token=NULL WHERE object_key=?').run(share);
 }finally{db.close()}
});

test('维护重试拒绝非法持久与旧队列路径且保留失败行',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-maint-path-')),attachments=join(dir,'attachments'),shares=join(dir,'shares'),dbPath=join(dir,'vault.sqlite');
 const db=new DatabaseSync(dbPath);
 try{
  db.exec(`CREATE TABLE attachments(object_key TEXT);CREATE TABLE secure_share_objects(object_key TEXT,uploaded_at INTEGER,upload_lease_token TEXT);
  CREATE TABLE maintenance_leases(name TEXT PRIMARY KEY,token TEXT,expires_at INTEGER);
  CREATE TABLE pending_file_deletions(object_key TEXT PRIMARY KEY,user_id TEXT,created_at INTEGER,ciphertext_size INTEGER DEFAULT 0);
  CREATE TABLE admin_file_deletions(id INTEGER PRIMARY KEY,tree TEXT,object_key TEXT,dir_hash TEXT,created_at INTEGER);
  CREATE TABLE admin_audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_email TEXT,action TEXT,target_username TEXT,details_json TEXT,created_at INTEGER)`);
  migrateFileLifecycle(db);
  db.prepare('INSERT INTO pending_file_deletions VALUES(?,?,?,0)').run('../../../../etc/passwd','user',Date.now());
  assert.throws(()=>db.prepare('INSERT INTO admin_file_deletions VALUES(1,?,?,?,?)').run('attachment','../outside','bad',Date.now()),/constraint/i);
  const result=await retryMaintenance(db,{ATTACHMENTS_DIR:attachments,SHARES_DIR:shares,DB_PATH:dbPath},'admin');
  assert.equal(result.failed,0);assert.equal(result.processed,0);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM pending_file_deletions').get().count,0);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM admin_file_deletions').get().count,0);
 }finally{db.close();await rm(dir,{recursive:true,force:true})}
});

test('维护repair拒绝非法报告路径且不结算报告项',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-repair-path-')),dbPath=join(dir,'vault.sqlite'),db=new DatabaseSync(dbPath);
 try{
  db.exec(`CREATE TABLE attachments(object_key TEXT);CREATE TABLE secure_share_objects(object_key TEXT,uploaded_at INTEGER,upload_lease_token TEXT);
  CREATE TABLE secure_share_packages(token_hash TEXT);CREATE TABLE pending_file_deletions(object_key TEXT PRIMARY KEY,user_id TEXT,created_at INTEGER,ciphertext_size INTEGER);
  CREATE TABLE maintenance_reports(id INTEGER PRIMARY KEY,status TEXT,repaired_at INTEGER);
  CREATE TABLE maintenance_report_items(report_id INTEGER,object_key TEXT,ciphertext_size INTEGER,tree TEXT,user_id TEXT,dir_hash TEXT,PRIMARY KEY(report_id,object_key));
  CREATE TABLE admin_audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_email TEXT,action TEXT,target_username TEXT,details_json TEXT,created_at INTEGER)`);
  migrateFileLifecycle(db);
  db.exec(`INSERT INTO maintenance_reports VALUES(1,'ready',NULL);
  INSERT INTO maintenance_report_items VALUES(1,'../../../../etc/passwd',0,'share',NULL,NULL)`);
  const result=await repairMaintenance(db,{ATTACHMENTS_DIR:join(dir,'attachments'),SHARES_DIR:join(dir,'shares'),DB_PATH:dbPath},'admin',1,{confirm:'REPAIR:1'});
  assert.equal(result.status,'ready');assert.equal(result.remaining,1);assert.equal(result.unlinked,0);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM maintenance_report_items').get().count,1);
 }finally{db.close();await rm(dir,{recursive:true,force:true})}
});

test('v2附件替换配额按导入后最终数量和保留分享字节计算',()=>{
 const dir=new DatabaseSync(':memory:');
 dir.exec(`CREATE TABLE user_quotas(user_id TEXT,entry_limit INTEGER,attachment_count_limit INTEGER,attachment_bytes_limit INTEGER,expires_at INTEGER);
 CREATE TABLE secure_share_packages(token_hash TEXT PRIMARY KEY,user_id TEXT);
 CREATE TABLE secure_share_objects(share_token_hash TEXT,object_key TEXT,ciphertext_size INTEGER,uploaded_at INTEGER);
 CREATE TABLE attachments(user_id TEXT,object_key TEXT,ciphertext_size INTEGER);
 INSERT INTO user_quotas VALUES('u',100,1,100,NULL);
 INSERT INTO attachments VALUES('u','old',90);
 INSERT INTO secure_share_packages VALUES('share','u');
 INSERT INTO secure_share_objects VALUES('share','shared',40,1)`);
 assert.deepEqual(checkAttachmentReplacementQuota(dir,'u',2,32),{quota:'attachments',limit:1});
 assert.deepEqual(checkAttachmentReplacementQuota(dir,'u',1,61),{quota:'attachment_bytes',limit:100});
 assert.deepEqual(checkAttachmentReplacementQuota(dir,'u',0,0),null,'仅保留分享且未超额时允许空附件替换');
 dir.prepare('UPDATE user_quotas SET attachment_bytes_limit=39 WHERE user_id=?').run('u');
 assert.deepEqual(checkAttachmentReplacementQuota(dir,'u',0,0),{quota:'attachment_bytes',limit:39},'空附件替换也必须检查保留分享字节');
 dir.prepare('UPDATE user_quotas SET attachment_bytes_limit=100 WHERE user_id=?').run('u');
 assert.equal(checkAttachmentReplacementQuota(dir,'u',1,60),null,'旧附件字节不应计入替换后的最终状态');
 dir.close();
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
