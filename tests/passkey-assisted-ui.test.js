import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');

test('登录页提供独立Passkey解锁且保留主密码表单',()=>{
 assert.match(html,/id="passkey-auth"[^>]*>使用 Passkey 解锁</);
 assert.match(html,/name="password"[^>]*autocomplete="current-password"/);
 assert.match(app,/passkeys\/authentication\/options/);
 assert.match(app,/passkeys\/authentication\/complete/);
 assert.match(app,/getPasskeyCredential/);
 assert.match(app,/importServerVaultKey/);
});

test('安全中心区分PRF本机快速解锁和服务器辅助Passkey',()=>{
 assert.match(html,/当前浏览器快速解锁/);
 assert.match(html,/Passkey 免主密码解锁/);
 assert.match(html,/id="passkey-assisted-status"/);
 assert.match(html,/id="passkey-assisted-toggle"/);
 assert.match(html,/id="passkey-credential-list"/);
});

test('服务器辅助开启弹窗披露边界并要求当前主密码',()=>{
 assert.match(html,/id="passkey-assisted-enable"/);
 assert.match(html,/服务器将在 Passkey 验证通过后协助恢复保险库密钥/);
 assert.match(html,/name="currentPassword"[^>]*autocomplete="current-password"/);
 assert.match(app,/passkeys\/registration\/options/);
 assert.match(app,/passkeys\/registration\/complete/);
 assert.match(app,/exportServerVaultKey/);
});

test('Passkey凭据可列出并以当前主密码撤销',()=>{
 assert.match(app,/api\('\/api\/passkeys'\)/);
 assert.match(app,/method:'DELETE'/);
 assert.match(app,/invalid_current_password/);
});

test('Passkey认证后本地加载失败会注销已创建的服务端会话',()=>{
 assert.match(app,/async function clearFailedAuthenticatedSession\(/);
 const handler=app.slice(app.indexOf("$('#passkey-auth').onclick"),app.indexOf('async function renderQuickUnlockSetting'));
 assert.match(handler,/await clearFailedAuthenticatedSession\(error\.message\)/);
 assert.match(app,/api\('\/api\/logout'.*method:'POST'/s);
});

test('Passkey登录与主密码认证互斥且迟到会话会被注销',()=>{
 const handler=app.slice(app.indexOf("$('#passkey-auth').onclick"),app.indexOf('function renderPasskeyCredentials'));
 const passwordHandler=app.slice(app.indexOf("$('#auth-form').onsubmit"),app.indexOf('const vaultSessionValid'));
 assert.match(handler,/setAuthInteractionDisabled\(true\)/);
 assert.match(handler,/dataset\.authenticating/);
 assert.match(handler,/logoutPasskeySession/);
 assert.match(handler,/setAuthInteractionDisabled\(false\)/);
 assert.match(passwordHandler,/cancelPasskeyAuthentication\(\).*setAuthInteractionDisabled\(true\)/s);
 assert.match(passwordHandler,/authenticatedSession=session/);
 assert.match(passwordHandler,/logoutPasskeySession\(authenticatedSession\)/);
 assert.match(passwordHandler,/finally\{.*setAuthInteractionDisabled\(false\)/s);
 assert.match(app,/function cancelPasskeyAuthentication\(/);
 assert.match(app,/dataset\.authenticating!==['"]1['"]\)setAuthInteractionDisabled\(false\)/);
});

test('Passkey注册可在设备验证阶段取消且提交阶段不可伪装取消',()=>{
 const handler=app.slice(app.indexOf("$('#passkey-assisted-enable-form').onsubmit"),app.indexOf("$('#passkey-assisted-revoke-form').onsubmit"));
 assert.match(handler,/new AbortController\(\)/);
 assert.match(handler,/createPasskeyCredential\(options\.publicKey,controller\.signal\)/);
 assert.match(handler,/setPasskeyEnableCommitting\(true\)/);
 assert.match(app,/function cancelPasskeyEnable\(/);
 assert.match(app,/dialog\.id==='passkey-assisted-enable'/);
});

test('浏览器测试钩子仅在loopback origin暴露',()=>{
 assert.match(app,/const testHooks=\['localhost','127\.0\.0\.1','\[::1\]'\]\.includes\(location\.hostname\)\?window:null/);
 assert.equal((app.match(/window\.__[A-Za-z0-9_]+/g)||[]).length,0);
 for(const name of ['__CLIPBOARD_CLEAR_MS','__TOTP_NOW','__IDLE_LOCK_MS','__refreshTotp','__lockVaultForTest'])assert.ok(app.includes(`testHooks?.${name}`)||app.includes(`testHooks.${name}`));
});

test('Passkey撤销提交期间不可伪装取消',()=>{
 const start=app.indexOf("$('#passkey-assisted-revoke-form').onsubmit");
 const handler=app.slice(start,app.indexOf('refreshQuickUnlockRecord',start));
 assert.match(handler,/setPasskeyRevokeCommitting\(true\)/);
 assert.match(handler,/setPasskeyRevokeCommitting\(false\)/);
 assert.match(app,/dialog\.id==='passkey-assisted-revoke'&&passkeyRevokeCommitting/);
});
