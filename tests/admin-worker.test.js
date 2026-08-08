import test from 'node:test';
import assert from 'node:assert/strict';

const mod=()=>import('../apps/admin-worker/src/index.ts?test='+Date.now());

const rows={
 users:[{id:'u1',username:'admin',created_at:1000,password_hash:'SECRET_HASH',password_salt:'SECRET_SALT',wrapped_key:'SECRET_KEY',password_iterations:100000},{id:'u2',username:'agent',created_at:2000,password_hash:'X',password_salt:'Y',wrapped_key:'Z',password_iterations:100000}],
 entries:[{user_id:'u1'},{user_id:'u1'}],attachments:[{user_id:'u1',ciphertext_size:1200,object_key:'SECRET_OBJECT'}],sessions:[{user_id:'u1',expires_at:9999999999999,auth_method:'password',last_seen_at:4000},{user_id:'u2',expires_at:1,auth_method:'passkey',last_seen_at:3000}],passkeys:[{user_id:'u2'}]
};
class DB{prepare(sql){return{all:async()=>({results:sql.includes('FROM users u')?[{username:'admin',created_at:1000,entry_count:2,attachment_count:1,attachment_bytes:1200,active_sessions:1,last_seen_at:4000,last_auth_method:'password',passkey_count:0,password_iterations:100000},{username:'agent',created_at:2000,entry_count:0,attachment_count:0,attachment_bytes:0,active_sessions:0,last_seen_at:3000,last_auth_method:'passkey',passkey_count:1,password_iterations:100000}]:[]}),first:async()=>{if(sql.includes('pragma_page_size'))throw Error('D1不支持pragma_page_size函数');return{users:2,entries:2,attachments:1,attachment_bytes:1200,active_sessions:1,pending_deletions:0,inflight_uploads:0,backup_locks:0,class_a:3,class_b:4}}}}}
const env={DB:new DB(),ATTACHMENTS:{list:async()=>({objects:[{size:1200}],truncated:false})},ADMIN_EMAIL:'admin@example.com',CF_VERSION_METADATA:{id:'version-1'}};
const req=(path='/',headers={})=>new Request('https://admin.example.com'+path,{headers});

test('未经过Cloudflare Access的请求一律拒绝且不泄露页面',async()=>{const {default:worker}=await mod();const r=await worker.fetch(req(),env);assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/)});
test('Access邮箱必须与唯一管理员邮箱完全匹配',async()=>{const {default:worker}=await mod();const r=await worker.fetch(req('/api/overview',{'cf-access-authenticated-user-email':'other@example.com'}),env);assert.equal(r.status,403)});
test('只读概览仅返回用户元数据和资源统计且不包含任何敏感字段',async()=>{const {default:worker}=await mod();const r=await worker.fetch(req('/api/overview',{'cf-access-authenticated-user-email':'admin@example.com'}),env);assert.equal(r.status,200);const text=await r.text();const data=JSON.parse(text);assert.equal(data.users.length,2);assert.equal(data.resources.r2.objects,1);for(const secret of ['password_hash','password_salt','wrapped_key','object_key','SECRET_HASH','SECRET_KEY'])assert.equal(text.includes(secret),false);assert.match(r.headers.get('content-security-policy'),/default-src 'none'/);assert.match(r.headers.get('cache-control'),/no-store/)});
test('管理Worker拒绝所有非GET/HEAD方法',async()=>{const {default:worker}=await mod();const r=await worker.fetch(new Request('https://admin.example.com/api/overview',{method:'POST',headers:{'cf-access-authenticated-user-email':'admin@example.com'}}),env);assert.equal(r.status,405)});
