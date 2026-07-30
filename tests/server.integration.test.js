import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startTestServer } from './fixtures.mjs';

test('Linux集成服务使用动态端口和nonce readiness绑定当前子进程',async()=>{
 const source=await readFile(new URL(import.meta.url),'utf8');
 assert.doesNotMatch(source,/spawn\(process\.execPath/);
 assert.match(source,/startTestServer\(/);
 assert.match(source,/origin=server\.base/);
});

let origin='',server;
async function start(db, extraEnv={}) {
  server=await startTestServer({dbPath:db,env:{ATTACHMENTS_DIR:join(db,'..','attachments'),CLIENT_IP_HEADER:'',...extraEnv}});
  origin=server.base;
}
async function stop(){if(!server)return;await server.stop();server=null;origin='';}
async function api(path,{method='GET',body,cookie,csrf,requestOrigin=origin,headers:extraHeaders={}}={}){const headers={origin:requestOrigin,...extraHeaders};if(body!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;if(csrf)headers['x-csrf-token']=csrf;return fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});}
function session(r){return r.headers.get('set-cookie').split(';',1)[0]}
const kdf={salt:'c2FsdHNhbHRzYWx0c2FsdA==',iterations:310000,hash:'SHA-256'};
const wrappedKey={iv:'dGVzdGl2MTIzNDU2',ciphertext:'ZW5jcnlwdGVk'};
const inviteCode='test-invite-code-1234567890';
const passkeyKek=Buffer.from(Uint8Array.from({length:32},(_,i)=>i+1)).toString('base64url');

test('Linux Passkey辅助解锁配置缺失时关闭，认证选项匿名且注册选项要求会话与CSRF',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-passkey-options-')),db=join(dir,'vault.sqlite');
 try{
  await start(db);
  let r=await api('/api/passkeys/authentication/options',{method:'POST',body:{username:'alice'}});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'passkey_unlock_unavailable'});
  await stop();await start(db,{PASSKEY_UNLOCK_KEK:passkeyKek,PASSKEY_RP_ID:'127.0.0.1',PASSKEY_ORIGIN:'__DYNAMIC_ORIGIN__',PASSKEY_ALLOW_INSECURE_ORIGIN:'true'});
  r=await api('/api/passkeys/authentication/options',{method:'POST',body:{username:'alice'}});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'invalid_request'});
  r=await api('/api/passkeys/authentication/options',{method:'POST',body:{}});assert.equal(r.status,200);const authentication=await r.json();assert.match(authentication.challengeId,/^[A-Za-z0-9_-]{32,}$/);assert.equal(authentication.publicKey.userVerification,'required');assert.deepEqual(authentication.publicKey.allowCredentials,[]);assert.equal(JSON.stringify(authentication).includes('alice'),false);
  await api('/api/register',{method:'POST',body:{username:'alice',password:'correct horse battery',inviteCode,kdf,wrappedKey}});
  r=await api('/api/login',{method:'POST',body:{username:'alice',password:'correct horse battery'}});const login=await r.json(),cookie=session(r);
  assert.equal((await api('/api/passkeys/registration/options',{method:'POST',body:{},csrf:login.csrf})).status,401);
  assert.equal((await api('/api/passkeys/registration/options',{method:'POST',body:{},cookie})).status,403);
  r=await api('/api/passkeys/registration/options',{method:'POST',body:{},cookie,csrf:login.csrf});assert.equal(r.status,200);const registration=await r.json();assert.equal(registration.publicKey.rp.id,'127.0.0.1');assert.equal(registration.publicKey.authenticatorSelection.residentKey,'required');assert.equal(registration.publicKey.authenticatorSelection.userVerification,'required');
  const sql=new DatabaseSync(db),rows=sql.prepare('SELECT id_hash,user_id,purpose,challenge FROM passkey_challenges ORDER BY created_at').all();assert.equal(rows.length,2);assert.equal(rows[0].user_id,null);assert.equal(rows[0].purpose,'authentication');assert.equal(rows[1].purpose,'registration');assert.notEqual(rows[0].id_hash,authentication.challengeId);assert.equal(rows[0].challenge,authentication.publicKey.challenge);
  r=await api('/api/passkeys/authentication/complete',{method:'POST',body:{challengeId:authentication.challengeId,response:{id:'bad'}}});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'invalid_passkey'});assert.equal(sql.prepare('SELECT COUNT(*) count FROM passkey_challenges').get().count,1);
  r=await api('/api/passkeys/authentication/complete',{method:'POST',body:{challengeId:authentication.challengeId,response:{id:'bad'}}});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'invalid_passkey'});
  r=await api('/api/passkeys/authentication/options',{method:'POST',body:{}});const expired=await r.json();sql.prepare('UPDATE passkey_challenges SET expires_at=? WHERE id_hash=?').run(Date.now()-1,sql.prepare('SELECT id_hash FROM passkey_challenges WHERE challenge=?').get(expired.publicKey.challenge).id_hash);r=await api('/api/passkeys/authentication/complete',{method:'POST',body:{challengeId:expired.challengeId,response:{id:'bad'}}});assert.equal(r.status,400);assert.equal(sql.prepare('SELECT COUNT(*) count FROM passkey_challenges WHERE challenge=?').get(expired.publicKey.challenge).count,0);
  for(let i=0;i<8;i++){r=await api('/api/passkeys/authentication/options',{method:'POST',body:{}});assert.equal(r.status,200)}r=await api('/api/passkeys/authentication/options',{method:'POST',body:{}});assert.equal(r.status,429);assert.deepEqual(await r.json(),{error:'rate_limited'});sql.close();
 }finally{await stop();await rm(dir,{recursive:true,force:true})}
});

test('Linux Passkey失败complete并发预占只允许十个请求进入验证路径',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-passkey-complete-rate-')),db=join(dir,'vault.sqlite');
 try{
  await start(db,{PASSKEY_UNLOCK_KEK:passkeyKek,PASSKEY_RP_ID:'127.0.0.1',PASSKEY_ORIGIN:'__DYNAMIC_ORIGIN__',PASSKEY_ALLOW_INSECURE_ORIGIN:'true',CLIENT_IP_HEADER:'x-real-ip'});
  const payloads=[];for(let i=0;i<11;i++){const r=await api('/api/passkeys/authentication/options',{method:'POST',body:{},headers:{'x-real-ip':`203.0.113.${i+1}`}}),option=await r.json();assert.equal(r.status,200);payloads.push({challengeId:option.challengeId,response:{id:'invalid_credential'}})}
  const responses=await Promise.all(payloads.map(body=>api('/api/passkeys/authentication/complete',{method:'POST',body,headers:{'x-real-ip':'198.51.100.77'}})));
  assert.deepEqual(responses.map(response=>response.status).sort(),[...Array(10).fill(400),429]);
  const sql=new DatabaseSync(db);assert.equal(sql.prepare("SELECT COUNT(*) count FROM auth_attempts WHERE key='passkey:198.51.100.77'").get().count,10);assert.equal(sql.prepare("SELECT COUNT(*) count FROM passkey_challenges WHERE purpose='authentication'").get().count,0);sql.close();
 }finally{await stop();await rm(dir,{recursive:true,force:true})}
});

test('Linux 健康、静态与错误响应统一提供安全头和 no-store API 缓存策略',async()=>{const dir=await mkdtemp(join(tmpdir(),'pv2-headers-')),db=join(dir,'vault.sqlite');try{await start(db);for(const path of ['/api/health','/api/session']){const r=await fetch(origin+path);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('permissions-policy'),'camera=(), microphone=(), geolocation=(), payment=(), usb=()');assert.match(r.headers.get('content-security-policy'),/object-src 'none'/);assert.equal(r.headers.get('cache-control'),'no-store')}const page=await fetch(origin+'/');assert.equal(page.status,200);assert.equal(page.headers.get('permissions-policy'),'camera=(), microphone=(), geolocation=(), payment=(), usb=()');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/)}finally{await stop();await rm(dir,{recursive:true,force:true})}});

test('Linux 反代后按可信 CLIENT_IP_HEADER 隔离限流，攻击者刷满不连坐其他真实用户，且伪造头无效',async()=>{const dir=await mkdtemp(join(tmpdir(),'pv2-clientip-')),db=join(dir,'vault.sqlite');try{
  // 生产拓扑：Cloudflare → Caddy → Node，真实 IP 来自 CF-Connecting-IP
  await start(db,{CLIENT_IP_HEADER:'cf-connecting-ip'});
  await api('/api/register',{method:'POST',body:{username:'victim',password:'correct horse battery',inviteCode,kdf,wrappedKey}});
  // 攻击者从 IP-A 刷满 10 次失败登录
  let r;for(let i=0;i<10;i++)r=await api('/api/login',{method:'POST',headers:{'cf-connecting-ip':'203.0.113.7'},body:{username:'victim',password:'bad bad bad bad'}});
  r=await api('/api/login',{method:'POST',headers:{'cf-connecting-ip':'203.0.113.7'},body:{username:'victim',password:'bad bad bad bad'}});assert.equal(r.status,429);
  // 受害者从 IP-B 用正确密码登录：不应被攻击者连坐
  r=await api('/api/login',{method:'POST',headers:{'cf-connecting-ip':'198.51.100.23'},body:{username:'victim',password:'correct horse battery'}});assert.equal(r.status,200,'其他真实 IP 不应被连坐锁定');
  await stop();
  // 未配置可信头时安全回退到 socket，且伪造的 cf-connecting-ip 被忽略（仍按同一 socket 单桶计数）
  await start(join(dir,'fresh.sqlite'));
  await api('/api/register',{method:'POST',body:{username:'victim2',password:'correct horse battery',inviteCode,kdf,wrappedKey}});
  for(let i=0;i<10;i++)r=await api('/api/login',{method:'POST',headers:{'cf-connecting-ip':`10.0.0.${i}`},body:{username:'victim2',password:'bad bad bad bad'}});
  r=await api('/api/login',{method:'POST',headers:{'cf-connecting-ip':'10.9.9.9'},body:{username:'victim2',password:'bad bad bad bad'}});assert.equal(r.status,429,'未配置可信头时伪造 IP 头不得绕过限流');
}finally{await stop();await rm(dir,{recursive:true,force:true})}});

test('Linux 注册邀请码缺失配置关闭、错误持久限速、正确放行且登录不受影响',async()=>{const dir=await mkdtemp(join(tmpdir(),'pv2-invite-')),db=join(dir,'vault.sqlite');try{await start(db);let r=await api('/api/register',{method:'POST',body:{username:'invite-user',password:'correct horse battery',inviteCode:'wrong-invite-code-123456789',kdf,wrappedKey}});assert.equal(r.status,403);for(let i=1;i<10;i++)await api('/api/register',{method:'POST',body:{username:'invite-user',password:'correct horse battery',inviteCode:'wrong-invite-code-123456789',kdf,wrappedKey}});r=await api('/api/register',{method:'POST',body:{username:'invite-user',password:'correct horse battery',inviteCode,kdf,wrappedKey}});assert.equal(r.status,429);await stop();await start(join(dir,'fresh.sqlite'));r=await api('/api/register',{method:'POST',body:{username:'invite-user',password:'correct horse battery',inviteCode,kdf,wrappedKey}});assert.equal(r.status,201);r=await api('/api/login',{method:'POST',body:{username:'invite-user',password:'correct horse battery'}});assert.equal(r.status,200)}finally{await stop();await rm(dir,{recursive:true,force:true})}});

test('SQLite auth、CSRF、密文 CRUD、备份及两次重启持久化',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-')),db=join(dir,'vault.sqlite');
 try{
  await start(db);
  let r=await api('/api/register',{method:'POST',body:{username:'alice',password:'correct horse battery',inviteCode,kdf,wrappedKey}});assert.equal(r.status,201);
  r=await api('/api/login',{method:'POST',body:{username:'alice',password:'correct horse battery'}});assert.equal(r.status,200);let login=await r.json(),cookie=session(r);assert.match(r.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict/);
  const envelope={id:'entry_123',type:'note',version:1,iv:'aXY=',ciphertext:'Y2lwaGVy'};
  assert.equal((await api('/api/entries/entry_123',{method:'PUT',cookie,body:envelope})).status,403);
  assert.equal((await api('/api/entries/entry_123',{method:'PUT',cookie,csrf:login.csrf,body:envelope,requestOrigin:'https://evil.test'})).status,403);
  r=await api('/api/entries/entry_123',{method:'PUT',cookie,csrf:login.csrf,body:envelope});assert.equal(r.status,200);const createdAt=(await r.json()).createdAt;assert.ok(Number.isSafeInteger(createdAt));
  assert.equal((await api('/api/entries/entry_123',{method:'PUT',cookie,csrf:login.csrf,body:{...envelope,createdAt:1}})).status,400);
  await new Promise(resolve=>setTimeout(resolve,2));r=await api('/api/entries/entry_123',{method:'PUT',cookie,csrf:login.csrf,body:{...envelope,ciphertext:'ZWRpdGVk'}});assert.equal((await r.json()).createdAt,createdAt);
  let backup=await (await api('/api/backup',{cookie})).json();assert.deepEqual(backup.envelopes,[{...envelope,ciphertext:'ZWRpdGVk'}]);assert.deepEqual(backup.wrappedKey,wrappedKey);assert.equal(JSON.stringify(backup).includes('password'),false);
  await stop(); await start(db); // restart #1: session and data both persist
  r=await api('/api/entries',{cookie});assert.equal(r.status,200);assert.deepEqual((await r.json()).items,[{...envelope,ciphertext:'ZWRpdGVk',createdAt}]);
  r=await api('/api/change-password',{method:'POST',cookie,csrf:login.csrf,body:{currentPassword:'wrong password here',newPassword:'another correct horse',kdf,wrappedKey}});assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'invalid_current_password'});
  r=await api('/api/change-password',{method:'POST',cookie,csrf:login.csrf,body:{currentPassword:'correct horse battery',newPassword:'short',kdf,wrappedKey}});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'invalid_new_password'});
  r=await api('/api/change-password',{method:'POST',cookie,csrf:login.csrf,body:{currentPassword:'correct horse battery',newPassword:'another correct horse',kdf:{salt:'bad',iterations:1},wrappedKey}});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'invalid_key_material'});
  {const sql=new DatabaseSync(db),user=sql.prepare('SELECT id FROM users WHERE username=?').get('alice'),now=Date.now();sql.prepare('INSERT INTO passkey_credentials VALUES(?,?,?,?,?,?,?,?,?,?)').run('credential_123',user.id,'public-key',0,'[]','singleDevice',0,'wrapped-key',now,now);sql.prepare('INSERT INTO passkey_challenges VALUES(?,?,?,?,?,?)').run('owned-challenge',user.id,'registration','challenge',now+60000,now);sql.prepare('INSERT INTO passkey_challenges VALUES(?,?,?,?,?,?)').run('anonymous-challenge',null,'authentication','anonymous',now+60000,now);sql.close()}
  assert.equal((await api('/api/change-password',{method:'POST',cookie,csrf:login.csrf,body:{currentPassword:'correct horse battery',newPassword:'another correct horse',kdf,wrappedKey}})).status,200);
  assert.equal((await api('/api/entries',{cookie})).status,401); // password change clears all sessions
  {const sql=new DatabaseSync(db);assert.equal(sql.prepare('SELECT COUNT(*) count FROM passkey_credentials').get().count,0);assert.deepEqual(sql.prepare('SELECT id_hash FROM passkey_challenges ORDER BY id_hash').all().map(row=>row.id_hash),['anonymous-challenge']);sql.close()}
  r=await api('/api/login',{method:'POST',body:{username:'alice',password:'another correct horse'}});assert.equal(r.status,200);login=await r.json();cookie=session(r);
  assert.equal((await api('/api/backup/import',{method:'POST',cookie,csrf:login.csrf,body:{kdf,wrappedKey,entries:[{...envelope,id:'entry_456'}]}})).status,200);
  await stop(); await start(db); // restart #2
  r=await api('/api/login',{method:'POST',body:{username:'alice',password:'another correct horse'}});login=await r.json();cookie=session(r);
  assert.deepEqual((await (await api('/api/entries',{cookie})).json()).items.map(x=>x.id),['entry_456']);
  assert.equal((await api('/api/logout',{method:'POST',cookie,csrf:login.csrf})).status,200);
  assert.equal((await api('/api/entries',{cookie})).status,401);
  for(let i=0;i<11;i++)r=await api('/api/login',{method:'POST',body:{username:'alice',password:'bad bad bad bad'}});
  assert.equal(r.status,429);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});

test('Linux 会话列表记录配置的可信 IP、登录时间和设备类别',async()=>{const dir=await mkdtemp(join(tmpdir(),'pv2-sessions-')),db=join(dir,'vault.sqlite');try{await start(db,{CLIENT_IP_HEADER:'x-forwarded-for'});await api('/api/register',{method:'POST',body:{username:'session-user',password:'correct horse battery',inviteCode,kdf,wrappedKey}});const r=await api('/api/login',{method:'POST',body:{username:'session-user',password:'correct horse battery'},headers:{'x-forwarded-for':'198.51.100.23','user-agent':'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile Safari/604.1'}}),login=await r.json(),cookie=session(r);const listed=await api('/api/sessions',{cookie});assert.equal(listed.status,200);const value=await listed.json();assert.equal(value.sessions.length,1);assert.deepEqual({ip:value.sessions[0].ip,device:value.sessions[0].device,browser:value.sessions[0].browser,current:value.sessions[0].current},{ip:'198.51.100.23',device:'tablet',browser:'safari',current:true});assert.ok(Number.isSafeInteger(value.sessions[0].createdAt));assert.ok(Number.isSafeInteger(value.sessions[0].lastSeenAt));assert.equal(JSON.stringify(value).includes('id_hash'),false);assert.equal(typeof login.csrf,'string');assert.match(login.sessionId,/^[A-Za-z0-9_-]{16,80}$/);const currentSession=await (await api('/api/session',{cookie})).json();assert.equal(currentSession.sessionId,login.sessionId);const chained=await api('/api/login',{method:'POST',body:{username:'session-user',password:'correct horse battery'},headers:{'x-forwarded-for':'203.0.113.8, 127.0.0.1'}}),chainedCookie=session(chained),chainedList=await (await api('/api/sessions',{cookie:chainedCookie})).json(),chainedCurrent=chainedList.sessions.find(row=>row.current);assert.equal(chainedCurrent.ip,'127.0.0.1','多值可信头必须回退到连接地址，而非接受可伪造链首');const sql=new DatabaseSync(db);sql.prepare('UPDATE sessions SET last_seen_at=1 WHERE public_id=?').run(chainedCurrent.id);assert.equal((await api('/api/session',{cookie:chainedCookie})).status,200);const seen=sql.prepare('SELECT last_seen_at FROM sessions WHERE public_id=?').get(chainedCurrent.id).last_seen_at;assert.ok(seen>1,'普通认证请求应更新最近活动');assert.equal((await api('/api/session',{cookie:chainedCookie})).status,200);assert.equal(sql.prepare('SELECT last_seen_at FROM sessions WHERE public_id=?').get(chainedCurrent.id).last_seen_at,seen,'五分钟内不得重复写最近活动');sql.close()}finally{await stop();await rm(dir,{recursive:true,force:true})}});

test('Linux 单会话注销和注销其他设备要求 CSRF、隔离账户且保留当前会话',async()=>{const dir=await mkdtemp(join(tmpdir(),'pv2-session-revoke-')),db=join(dir,'vault.sqlite');try{await start(db);await api('/api/register',{method:'POST',body:{username:'revoke-user',password:'correct horse battery',inviteCode,kdf,wrappedKey}});let r=await api('/api/login',{method:'POST',body:{username:'revoke-user',password:'correct horse battery'}}),first=await r.json(),firstCookie=session(r);r=await api('/api/login',{method:'POST',body:{username:'revoke-user',password:'correct horse battery'}});const secondCookie=session(r);let list=await (await api('/api/sessions',{cookie:firstCookie})).json(),current=list.sessions.find(x=>x.current),other=list.sessions.find(x=>!x.current);assert.equal((await api(`/api/sessions/${current.id}`,{method:'DELETE',cookie:firstCookie,csrf:first.csrf})).status,409);assert.equal((await api(`/api/sessions/${other.id}`,{method:'DELETE',cookie:firstCookie})).status,403);assert.equal((await api('/api/sessions/not_owned_session_id',{method:'DELETE',cookie:firstCookie,csrf:first.csrf})).status,404);assert.equal((await api(`/api/sessions/${other.id}`,{method:'DELETE',cookie:firstCookie,csrf:first.csrf})).status,200);assert.equal((await api('/api/session',{cookie:secondCookie})).status,401);r=await api('/api/login',{method:'POST',body:{username:'revoke-user',password:'correct horse battery'}});const thirdCookie=session(r);assert.equal((await api('/api/sessions/logout-others',{method:'POST',cookie:firstCookie,csrf:first.csrf})).status,200);assert.equal((await api('/api/session',{cookie:thirdCookie})).status,401);assert.equal((await api('/api/session',{cookie:firstCookie})).status,200);list=await (await api('/api/sessions',{cookie:firstCookie})).json();assert.equal(list.sessions.length,1);assert.equal(list.sessions[0].current,true)}finally{await stop();await rm(dir,{recursive:true,force:true})}});

test('Linux 改用户名要求认证 CSRF 与精确字段，并保留密码、密钥材料和密文',async()=>{const dir=await mkdtemp(join(tmpdir(),'pv2-username-')),db=join(dir,'vault.sqlite');try{await start(db);await api('/api/register',{method:'POST',body:{username:'alice',password:'correct horse battery',inviteCode,kdf,wrappedKey}});let r=await api('/api/login',{method:'POST',body:{username:'alice',password:'correct horse battery'}}),login=await r.json(),cookie=session(r);const r2=await api('/api/login',{method:'POST',body:{username:'alice',password:'correct horse battery'}}),cookie2=session(r2),envelope={id:'entry_123',type:'note',version:1,iv:'aXY=',ciphertext:'Y2lwaGVy'};await api('/api/entries/entry_123',{method:'PUT',cookie,csrf:login.csrf,body:envelope});assert.equal((await api('/api/change-username',{method:'POST',body:{newUsername:'new alice',currentPassword:'correct horse battery'}})).status,401);assert.equal((await api('/api/change-username',{method:'POST',cookie,body:{newUsername:'new alice',currentPassword:'correct horse battery'}})).status,403);for(const [body,status,code] of [[{newUsername:'new alice'},400,'invalid_request'],[{newUsername:'new alice',currentPassword:'wrong password here'},401,'invalid_current_password'],[{newUsername:'bad',currentPassword:'correct horse battery',extra:true},400,'invalid_request']]){r=await api('/api/change-username',{method:'POST',cookie,csrf:login.csrf,body});assert.equal(r.status,status);assert.deepEqual(await r.json(),{error:code})}await api('/api/register',{method:'POST',body:{username:'taken',password:'correct horse battery',inviteCode,kdf,wrappedKey}});r=await api('/api/change-username',{method:'POST',cookie,csrf:login.csrf,body:{newUsername:'taken',currentPassword:'correct horse battery'}});assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'username_taken'});r=await api('/api/change-username',{method:'POST',cookie,csrf:login.csrf,body:{newUsername:' 新 用户 ',currentPassword:'correct horse battery'}});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await api('/api/session',{cookie})).status,401);assert.equal((await api('/api/session',{cookie:cookie2})).status,401);assert.equal((await api('/api/login',{method:'POST',body:{username:'alice',password:'correct horse battery'}})).status,401);r=await api('/api/login',{method:'POST',body:{username:'新 用户',password:'correct horse battery'}});assert.equal(r.status,200);const relogin=await r.json();assert.deepEqual(relogin.wrappedKey,wrappedKey);assert.deepEqual((await (await api('/api/entries',{cookie:session(r)})).json()).items.map(({createdAt,...item})=>item),[envelope])}finally{await stop();await rm(dir,{recursive:true,force:true})}});

test('Linux 改用户名成功时撤销Passkey辅助材料和全部会话',async()=>{const dir=await mkdtemp(join(tmpdir(),'pv2-username-passkey-')),db=join(dir,'vault.sqlite');try{await start(db);await api('/api/register',{method:'POST',body:{username:'rename-passkey',password:'correct horse battery',inviteCode,kdf,wrappedKey}});const r=await api('/api/login',{method:'POST',body:{username:'rename-passkey',password:'correct horse battery'}}),login=await r.json(),cookie=session(r),sql=new DatabaseSync(db),user=sql.prepare('SELECT id FROM users WHERE username=?').get('rename-passkey'),now=Date.now();sql.prepare('INSERT INTO passkey_credentials VALUES(?,?,?,?,?,?,?,?,?,?)').run('credential_rename',user.id,'public-key',0,'[]','singleDevice',0,'wrapped-key',now,now);sql.prepare('INSERT INTO passkey_challenges VALUES(?,?,?,?,?,?)').run('rename-challenge',user.id,'registration','challenge',now+60000,now);sql.close();assert.equal((await api('/api/change-username',{method:'POST',cookie,csrf:login.csrf,body:{newUsername:'renamed passkey',currentPassword:'correct horse battery'}})).status,200);const verify=new DatabaseSync(db);assert.equal(verify.prepare('SELECT COUNT(*) count FROM passkey_credentials').get().count,0);assert.equal(verify.prepare('SELECT COUNT(*) count FROM passkey_challenges WHERE user_id=?').get(user.id).count,0);assert.equal(verify.prepare('SELECT COUNT(*) count FROM sessions WHERE user_id=?').get(user.id).count,0);verify.close()}finally{await stop();await rm(dir,{recursive:true,force:true})}});

test('Linux 附件真实二进制 CRUD、隔离、长度限制、持久化及磁盘清理',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-attachments-')),db=join(dir,'vault.sqlite'),metadata={version:1,iv:'bWV0YWRhdGFpdg==',ciphertext:'b3BhcXVlLW1ldGFkYXRh'};
 const registerLogin=async(username)=>{await api('/api/register',{method:'POST',body:{username,password:'correct horse battery',inviteCode,kdf,wrappedKey}});const r=await api('/api/login',{method:'POST',body:{username,password:'correct horse battery'}});return{cookie:session(r),...(await r.json())}};
 const upload=(id,who,data,extra={})=>fetch(origin+'/api/attachments/'+id,{method:'POST',headers:{origin,cookie:who.cookie,'x-csrf-token':who.csrf,'x-attachment-metadata':JSON.stringify(metadata),'content-type':'application/octet-stream',...extra},body:data});
 try{
  await start(db);const alice=await registerLogin('alice-files'),bob=await registerLogin('bob-files'),bytes=Buffer.from([0,255,1,2,3,128,10,0,99,42,7,8,9,10,11,12,13]);
  assert.equal((await upload('attach_123',alice,bytes,{'x-csrf-token':''})).status,403);let r=await upload('attach_123',alice,bytes);assert.equal(r.status,201,await r.text());
  const list=await (await api('/api/attachments',{cookie:alice.cookie})).json();assert.equal(list.items.length,1);assert.equal(list.items[0].ciphertextSize,bytes.length);assert.deepEqual(list.items[0].metadata,metadata);
  assert.deepEqual(Buffer.from(await (await api('/api/attachments/attach_123/content',{cookie:alice.cookie})).arrayBuffer()),bytes);assert.equal((await api('/api/attachments/attach_123/content',{cookie:bob.cookie})).status,404);assert.equal((await api('/api/attachments/attach_123/metadata',{method:'PUT',cookie:bob.cookie,csrf:bob.csrf,body:metadata})).status,404);
  const renamed={version:1,iv:'bmV3LWl2',ciphertext:'bmV3LW9wYXF1ZS1tZXRh'};r=await api('/api/attachments/attach_123/metadata',{method:'PUT',cookie:alice.cookie,csrf:alice.csrf,body:renamed});assert.equal(r.status,200);assert.deepEqual((await r.json()).metadata,renamed);
  await stop();await start(db);assert.deepEqual(Buffer.from(await (await api('/api/attachments/attach_123/content',{cookie:alice.cookie})).arrayBuffer()),bytes);assert.equal((await api('/api/attachments/attach_123',{method:'DELETE',cookie:alice.cookie,csrf:alice.csrf})).status,204);assert.equal((await api('/api/attachments/attach_123/content',{cookie:alice.cookie})).status,404);
  const raw=(headers,body)=>new Promise((resolve,reject)=>{const q=request(origin+'/api/attachments/attach_raw',{method:'POST',headers:{origin,cookie:alice.cookie,'x-csrf-token':alice.csrf,'x-attachment-metadata':JSON.stringify(metadata),...headers}},resolve);q.on('error',reject);if(body)q.write(body);q.end()});
  assert.equal((await raw({},bytes)).statusCode,413);assert.equal((await raw({'content-length':String(100*1024*1024+17)},null)).statusCode,413);
  const all=await readdir(join(dir,'attachments'),{recursive:true});assert.equal(all.some(x=>x.endsWith('.tmp')),false);assert.equal(all.filter(x=>x.includes('/')&&x.split('/').at(-1).length===64).length,0);assert.equal((await readFile(db)).includes(bytes),false);
 }finally{await stop();await rm(dir,{recursive:true,force:true})}
});

test('Linux 备份 v2 附件往返、v1 兼容并拒绝损坏',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-backup-')),db=join(dir,'vault.sqlite'),metadata={version:1,iv:'bWV0YQ==',ciphertext:'Y2lwaGVy'};
 try{
  await start(db);await api('/api/register',{method:'POST',body:{username:'backup-user',password:'correct horse battery',inviteCode,kdf,wrappedKey}});
  let r=await api('/api/login',{method:'POST',body:{username:'backup-user',password:'correct horse battery'}});const login=await r.json(),cookie=session(r),bytes=Buffer.alloc(16,9);
  r=await fetch(origin+'/api/attachments/attach_123',{method:'POST',headers:{origin,cookie,'x-csrf-token':login.csrf,'x-attachment-metadata':JSON.stringify(metadata)},body:bytes});assert.equal(r.status,201);
  const backup=await (await api('/api/backup?attachments=1',{cookie})).json();assert.equal(backup.version,2);assert.equal(backup.attachments.length,1);
  assert.equal((await api('/api/backup',{method:'PUT',cookie,csrf:login.csrf,body:backup})).status,200);
  assert.deepEqual(Buffer.from(await (await api('/api/attachments/attach_123/content',{cookie})).arrayBuffer()),bytes);
  const corrupt=structuredClone(backup);corrupt.attachments[0].sha256='bad';assert.equal((await api('/api/backup',{method:'PUT',cookie,csrf:login.csrf,body:corrupt})).status,400);
  assert.equal((await api('/api/backup',{method:'PUT',cookie,csrf:login.csrf,body:{version:1,kdf,wrappedKey,envelopes:[]}})).status,200);
 }finally{await stop();await rm(dir,{recursive:true,force:true})}
});
