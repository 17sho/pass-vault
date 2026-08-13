import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startTestServer } from './fixtures.mjs';

let origin;const inviteCode='test-invite-code-1234567890',password='correct horse battery';
const kek=Buffer.from(Uint8Array.from({length:32},(_,i)=>i+1)).toString('base64url');
const vaultKey=Buffer.from(Uint8Array.from({length:32},(_,i)=>255-i)).toString('base64url');
const kdf={salt:'c2FsdHNhbHRzYWx0c2FsdA==',iterations:310000,hash:'SHA-256'},wrappedKey={iv:'dGVzdGl2MTIzNDU2',ciphertext:'ZW5jcnlwdGVk'};

async function start(db){
 const server=await startTestServer({dbPath:db,hostname:'localhost',env:{ATTACHMENTS_DIR:join(db,'..','attachments'),PASSKEY_UNLOCK_KEK:kek,PASSKEY_RP_ID:'localhost',PASSKEY_ORIGIN:'__DYNAMIC_ORIGIN__',PASSKEY_ALLOW_INSECURE_ORIGIN:'true'}});origin=server.base;return server;
}
async function json(page,path,options={}){return page.evaluate(async({path,options})=>{const response=await fetch(path,{...options,headers:{'content-type':'application/json',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});return{status:response.status,headers:Object.fromEntries(response.headers),body:await response.json()}},{path,options})}

test('真实WebAuthn注册和匿名断言创建会话、恢复vaultKey、拒绝challenge重放并支持撤销',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pv2-passkey-e2e-')),db=join(dir,'vault.sqlite');let child,browser;
 try{
  child=await start(db);browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage();await page.goto(origin);
  await json(page,'/api/register',{method:'POST',body:{username:'passkey-user',password,inviteCode,kdf,wrappedKey}});
  let login=await json(page,'/api/login',{method:'POST',body:{username:'passkey-user',password}});assert.equal(login.status,200);let csrf=login.body.csrf;
  const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  const registrationOptions=await json(page,'/api/passkeys/registration/options',{method:'POST',headers:{'x-csrf-token':csrf},body:{}});assert.equal(registrationOptions.status,200);
  const registrationResponse=await page.evaluate(async publicKey=>(await import('/passkey-assisted-device.mjs')).createPasskeyCredential(publicKey),registrationOptions.body.publicKey);
  const registered=await json(page,'/api/passkeys/registration/complete',{method:'POST',headers:{'x-csrf-token':csrf},body:{challengeId:registrationOptions.body.challengeId,response:registrationResponse,currentPassword:password,vaultKey}});assert.equal(registered.status,201,JSON.stringify(registered.body));
  const replay=await json(page,'/api/passkeys/registration/complete',{method:'POST',headers:{'x-csrf-token':csrf},body:{challengeId:registrationOptions.body.challengeId,response:registrationResponse,currentPassword:password,vaultKey}});assert.equal(replay.status,400);assert.deepEqual(replay.body,{error:'invalid_passkey'});
  const listed=await json(page,'/api/passkeys');assert.equal(listed.status,200);assert.equal(listed.body.credentials.length,1);assert.equal(listed.body.credentials[0].id,registrationResponse.id);
  await json(page,'/api/logout',{method:'POST',headers:{'x-csrf-token':csrf},body:{}});
  const authenticationOptions=await json(page,'/api/passkeys/authentication/options',{method:'POST',body:{}});assert.equal(authenticationOptions.status,200);
  const authenticationResponse=await page.evaluate(async publicKey=>(await import('/passkey-assisted-device.mjs')).getPasskeyCredential(publicKey),authenticationOptions.body.publicKey);
  const authenticated=await json(page,'/api/passkeys/authentication/complete',{method:'POST',body:{challengeId:authenticationOptions.body.challengeId,response:authenticationResponse}});assert.equal(authenticated.status,200,JSON.stringify(authenticated.body));assert.equal(authenticated.body.username,'passkey-user');assert.equal(authenticated.body.vaultKey,vaultKey);csrf=authenticated.body.csrf;
  assert.equal((await json(page,'/api/session')).status,200);
  const authReplay=await json(page,'/api/passkeys/authentication/complete',{method:'POST',body:{challengeId:authenticationOptions.body.challengeId,response:authenticationResponse}});assert.equal(authReplay.status,400);
  await json(page,'/api/logout',{method:'POST',headers:{'x-csrf-token':csrf},body:{}});await page.reload();
  await page.route('**/api/entries',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'internal_error'})}));
  await page.getByRole('button',{name:'使用 Passkey 解锁'}).click();await page.getByText('服务器暂时异常，请稍后再试',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__vaultKeyPresent()),false);assert.equal((await json(page,'/api/session')).status,401);await page.unroute('**/api/entries');
  let entriesFetched,releaseEntries;const entriesReady=new Promise(resolve=>{entriesFetched=resolve}),entriesRelease=new Promise(resolve=>{releaseEntries=resolve});await page.route('**/api/entries',async route=>{const response=await route.fetch();entriesFetched();await entriesRelease;await route.fulfill({response})});await page.getByRole('button',{name:'使用 Passkey 解锁'}).click();await entriesReady;await page.evaluate(()=>window.__lockVaultForTest());releaseEntries();await page.getByRole('button',{name:'使用 Passkey 解锁'}).waitFor({state:'visible'});assert.equal((await json(page,'/api/session')).status,401);await page.unroute('**/api/entries');
  login=await json(page,'/api/login',{method:'POST',body:{username:'passkey-user',password}});assert.equal(login.status,200);csrf=login.body.csrf;
  assert.equal((await json(page,`/api/passkeys/${encodeURIComponent(registrationResponse.id)}`,{method:'DELETE',headers:{'x-csrf-token':csrf},body:{currentPassword:'wrong password here'}})).status,401);
  assert.equal((await json(page,`/api/passkeys/${encodeURIComponent(registrationResponse.id)}`,{method:'DELETE',headers:{'x-csrf-token':csrf},body:{currentPassword:password}})).status,200);
  assert.deepEqual((await json(page,'/api/passkeys')).body.credentials,[]);
  await json(page,'/api/logout',{method:'POST',headers:{'x-csrf-token':csrf},body:{}});await page.reload();
  let loginCreated,releaseLogin;const created=new Promise(resolve=>{loginCreated=resolve}),release=new Promise(resolve=>{releaseLogin=resolve});await page.route('**/api/login',async route=>{const response=await route.fetch();loginCreated();await release;await route.fulfill({response})});
  const authForm=page.locator('#auth-form');await authForm.getByLabel('用户名').fill('passkey-user');await authForm.getByLabel('主密码',{exact:true}).fill(password);await authForm.getByRole('button',{name:'登录并解锁'}).click();await created;await page.evaluate(()=>window.__lockVaultForTest());releaseLogin();await page.waitForFunction(()=>document.querySelector('#auth-form')?.dataset.authenticating!=='1');assert.equal((await json(page,'/api/session')).status,401);await page.unroute('**/api/login');
 }finally{await browser?.close();if(child)await child.stop();await rm(dir,{recursive:true,force:true})}
});
