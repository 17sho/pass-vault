import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = 'http://127.0.0.1:19876';
let child;
async function start(db) {
  child = spawn(process.execPath, ['apps/server/server.mjs'], { cwd: new URL('..', import.meta.url), env: {...process.env, INVITE_CODE:process.env.INVITE_CODE??'test-invite-code-1234567890', PORT:'19876', HOST:'127.0.0.1', DB_PATH:db, ATTACHMENTS_DIR:join(db,'..','attachments'), COOKIE_SECURE:'false'}, stdio:['ignore','pipe','pipe'] });
  let errors=''; child.stderr.on('data',c=>errors+=c);
  for(let i=0;i<80;i++){try{const r=await fetch(origin+'/api/health');if(r.ok)return;}catch{} await new Promise(r=>setTimeout(r,25));}
  throw new Error('server start failed '+errors);
}
async function stop(){if(!child)return; child.kill('SIGTERM'); await new Promise(r=>child.once('exit',r)); child=null;}
async function api(path,{method='GET',body,cookie,csrf,requestOrigin=origin}={}){const headers={origin:requestOrigin};if(body!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;if(csrf)headers['x-csrf-token']=csrf;return fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});}
function session(r){return r.headers.get('set-cookie').split(';',1)[0]}
const kdf={salt:'c2FsdHNhbHRzYWx0c2FsdA==',iterations:310000,hash:'SHA-256'};
const wrappedKey={iv:'dGVzdGl2MTIzNDU2',ciphertext:'ZW5jcnlwdGVk'};
const inviteCode='test-invite-code-1234567890';

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
  assert.equal((await api('/api/entries/entry_123',{method:'PUT',cookie,csrf:login.csrf,body:envelope})).status,200);
  let backup=await (await api('/api/backup',{cookie})).json();assert.deepEqual(backup.envelopes,[envelope]);assert.deepEqual(backup.wrappedKey,wrappedKey);assert.equal(JSON.stringify(backup).includes('password'),false);
  await stop(); await start(db); // restart #1: session and data both persist
  r=await api('/api/entries',{cookie});assert.equal(r.status,200);assert.deepEqual((await r.json()).items,[envelope]);
  r=await api('/api/change-password',{method:'POST',cookie,csrf:login.csrf,body:{currentPassword:'wrong password here',newPassword:'another correct horse',kdf,wrappedKey}});assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'invalid_current_password'});
  r=await api('/api/change-password',{method:'POST',cookie,csrf:login.csrf,body:{currentPassword:'correct horse battery',newPassword:'short',kdf,wrappedKey}});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'invalid_new_password'});
  r=await api('/api/change-password',{method:'POST',cookie,csrf:login.csrf,body:{currentPassword:'correct horse battery',newPassword:'another correct horse',kdf:{salt:'bad',iterations:1},wrappedKey}});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'invalid_key_material'});
  assert.equal((await api('/api/change-password',{method:'POST',cookie,csrf:login.csrf,body:{currentPassword:'correct horse battery',newPassword:'another correct horse',kdf,wrappedKey}})).status,200);
  assert.equal((await api('/api/entries',{cookie})).status,401); // password change clears all sessions
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
