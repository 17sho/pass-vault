import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';

const mod=()=>import('../apps/admin-worker/src/index.ts?nav='+Date.now());
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'});Object.assign(jwk,{kid:'nav-key',use:'sig',alg:'RS256'});
const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),h=b({alg:'RS256',kid:'nav-key'}),p=b({iss:'https://test.cloudflareaccess.com',aud:'nav-aud',email:'admin@example.com',exp:4102444800}),jwt=h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');
const headers={'cf-access-authenticated-user-email':'admin@example.com','cf-access-jwt-assertion':jwt};
const env={ADMIN_EMAILS:'admin@example.com',ACCESS_ISSUER:'https://test.cloudflareaccess.com',ACCESS_AUD:'nav-aud',ACCESS_JWKS:JSON.stringify({keys:[jwk]})};

test('Admin 提供桌面侧栏、移动抽屉与六个独立功能页面',async()=>{
 const {default:worker}=await mod(),html=await (await worker.fetch(new Request('https://admin.example.com/',{headers}),env)).text(),js=await (await worker.fetch(new Request('https://admin.example.com/app.js',{headers}),env)).text();
 assert.match(html,/class="admin-shell"/);
 assert.match(html,/class="admin-sidebar"/);
 assert.match(html,/data-nav-toggle/);
 assert.match(html,/data-sidebar-backdrop/);
 for(const [key,label] of [['overview','概览'],['users','用户管理'],['registration','注册与邀请码'],['operations','运维任务'],['security','安全事件'],['audit','审计日志']]){
  assert.match(html,new RegExp('data-nav-page="'+key+'"[^>]*>'+label));
  assert.match(js,new RegExp('data-page="'+key+'"'));
 }
 assert.match(js,/localStorage\.getItem\('pass-vault-admin-page'\)/);
 assert.match(js,/history\.replaceState/);
 assert.match(js,/aria-current/);
});

test('Admin 分页契约保证每次仅一个主功能页面可见且手机菜单可关闭',async()=>{
 const {default:worker}=await mod(),js=await (await worker.fetch(new Request('https://admin.example.com/app.js',{headers}),env)).text();
 assert.match(js,/function activatePage/);
 assert.match(js,/page\.hidden=page\.dataset\.page!==next/);
 assert.match(js,/classList.*remove.*is-open/);
 assert.match(js,/data-sidebar-backdrop/);
 assert.match(js,/Escape/);
});
