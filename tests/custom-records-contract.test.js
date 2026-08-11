import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_TYPES, normalizeGroupRegistry, normalizeRecents, validatePlain, validEnvelope } from '../shared/contract.mjs';
import { CUSTOM_RECORD_TEMPLATES, customRecordSearchValues, customRecordSummary, cloneCustomRecord } from '../public/custom-records.mjs';

const fields=[
 {id:'field_ip01',label:'IP地址',type:'text',value:'192.0.2.10'},
 {id:'field_pwd1',label:'密码',type:'secret',value:'never-index-this'},
 {id:'field_port',label:'SSH端口',type:'number',value:'22'},
];
const record={title:'香港服务器',template:'server',notes:'仅允许密钥登录',tags:['生产环境'],fields};

test('custom是统一加密资料类型并进入分组与最近访问契约',()=>{
 assert.ok(GROUP_TYPES.includes('custom'));
 assert.equal(validEnvelope({id:'custom_0001',type:'custom',version:1,iv:'iv',ciphertext:'cipher'}),true);
 assert.deepEqual(normalizeRecents([{type:'custom',id:'custom_0001',at:1}]),[{type:'custom',id:'custom_0001',at:1}]);
 const legacy={account:[],website:[],note:[],totp:[],attachment:[]};
 assert.deepEqual(normalizeGroupRegistry(legacy),{...legacy,custom:[]});
});

test('custom明文严格验证标题、模板、备注、标签、状态与六种字段',()=>{
 assert.equal(validatePlain('custom',record),true);
 assert.equal(validatePlain('custom',{...record,groupId:'group_0001',favorite:true,pinned:true,pinRank:2,deletedAt:Date.now()}),true);
 for(const bad of [
  {...record,title:''},
  {...record,template:'passport'},
  {...record,fields:[{...fields[0],type:'unknown'}]},
  {...record,fields:[{...fields[0],label:''}]},
  {...record,fields:[{...fields[0],extra:'leak'}]},
  {...record,fields:Array.from({length:21},(_,i)=>({...fields[0],id:`field_${String(i).padStart(4,'0')}`}))},
  {...record,password:'plaintext'},
 ])assert.equal(validatePlain('custom',bad),false);
});

test('custom rejects duplicate stable field ids',()=>{const item={...record,fields:[{id:'duplicate_1',label:'一',type:'text',value:'a'},{id:'duplicate_1',label:'二',type:'number',value:'2'}]};assert.equal(validatePlain('custom',item),false)});

test('六个模板只预填字段且字段实例拥有新稳定ID',()=>{
 assert.deepEqual(Object.keys(CUSTOM_RECORD_TEMPLATES),['blank','bank-card','identity','api','server','software-license']);
 assert.deepEqual(CUSTOM_RECORD_TEMPLATES.server.fields.map(x=>[x.label,x.type]),[['IP地址','text'],['SSH端口','number'],['用户名','text'],['密码','secret'],['管理后台','url']]);
 const a=cloneCustomRecord('server'),b=cloneCustomRecord('server');
 assert.equal(a.template,'server');assert.notEqual(a.fields[0].id,b.fields[0].id);
 assert.equal(a.fields.every(x=>x.value===''),true);
});

test('自定义资料搜索和列表摘要绝不包含敏感字段',()=>{
 assert.deepEqual(customRecordSearchValues(record),['香港服务器','服务器','仅允许密钥登录','生产环境','IP地址','192.0.2.10','SSH端口','22']);
 assert.deepEqual(customRecordSummary(record),{label:'IP地址',value:'192.0.2.10'});
 const onlySecrets={...record,fields:[{id:'field_sec1',label:'API Secret',type:'secret',value:'top-secret'}]};
 assert.deepEqual(customRecordSummary(onlySecrets),null);
 assert.equal(customRecordSearchValues(onlySecrets).join('|').includes('top-secret'),false);
});
