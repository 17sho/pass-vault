import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlain, validatePlain, validEnvelope, normalizeRecents } from '../shared/contract.mjs';

const base={platform:'平台',loginUrl:'https://example.test',notes:'',tags:[]};
test('legacy account normalizes to canonical credentials',()=>assert.deepEqual(normalizePlain('account',{...base,username:'old',password:'secret'}),{...base,credentials:[{username:'old',password:'secret'}]}));
test('canonical account accepts bounded credential rows',()=>assert.equal(validatePlain('account',{...base,credentials:[{username:'a',password:'x'},{username:'b',password:'y'}]}),true));
test('account rejects malformed, excessive and unknown sensitive fields',()=>{for(const value of [{...base,credentials:[]},{...base,credentials:Array.from({length:21},()=>({username:'a',password:'b'}))},{...base,credentials:[{username:'a',password:'b',token:'leak'}]},{...base,credentials:[{username:'a'.repeat(257),password:'b'}]},{...base,credentials:[{username:'a',password:'b'}],password:'leak'}])assert.equal(validatePlain('account',value),false)});
test('account permits a sole empty row but rejects half-empty and extra empty rows',()=>{assert.equal(validatePlain('account',{...base,credentials:[{username:'',password:''}]}),true);for(const credentials of [[{username:'only-user',password:''}],[{username:'',password:'only-password'}],[{username:'a',password:'b'},{username:'',password:''}]])assert.equal(validatePlain('account',{...base,credentials}),false)});
test('website still rejects credential containers',()=>assert.equal(validatePlain('website',{name:'n',url:'u',description:'',tags:[],credentials:[{username:'a',password:'b'}]}),false));

// 功能6: 密码历史 + 修改时间
test('account accepts optional updatedAt and passwordHistory',()=>{
  assert.equal(validatePlain('account',{...base,credentials:[{username:'a',password:'x'}],updatedAt:1700000000000}),true);
  assert.equal(validatePlain('account',{...base,credentials:[{username:'a',password:'x'}],updatedAt:1700000000000,passwordHistory:[{username:'a',password:'old',changedAt:1699999999000}]}),true);
  assert.equal(validatePlain('account',{...base,credentials:[{username:'a',password:'x'}],passwordHistory:[]}),true);
});
test('account rejects malformed updatedAt / passwordHistory',()=>{
  for(const bad of [
    {...base,credentials:[{username:'a',password:'x'}],updatedAt:'nope'},
    {...base,credentials:[{username:'a',password:'x'}],updatedAt:-1},
    {...base,credentials:[{username:'a',password:'x'}],passwordHistory:'x'},
    {...base,credentials:[{username:'a',password:'x'}],passwordHistory:[{username:'a',password:'old'}]}, // missing changedAt
    {...base,credentials:[{username:'a',password:'x'}],passwordHistory:[{username:'a',password:'old',changedAt:1,extra:'leak'}]},
    {...base,credentials:[{username:'a',password:'x'}],passwordHistory:Array.from({length:11},()=>({username:'a',password:'p',changedAt:1}))}, // over 10
    {...base,credentials:[{username:'a',password:'x'}],passwordHistory:[{username:'a',password:'p'.repeat(4097),changedAt:1}]},
  ])assert.equal(validatePlain('account',bad),false);
});
test('website/note reject password history fields',()=>{
  assert.equal(validatePlain('website',{name:'n',url:'u',description:'',tags:[],passwordHistory:[]}),false);
  assert.equal(validatePlain('note',{title:'t',body:'b',tags:[],updatedAt:1}),false);
});

// 功能7: 最近访问注册表
test('validEnvelope permits both reserved settings ids, rejects other settings ids',()=>{
  const base2={type:'settings',version:1,iv:'aa',ciphertext:'bb'};
  assert.equal(validEnvelope({...base2,id:'settings_registry'}),true);
  assert.equal(validEnvelope({...base2,id:'recents_registry'}),true);
  assert.equal(validEnvelope({...base2,id:'evil_registry'}),false);
});
test('normalizeRecents dedupes, sorts desc, caps at 20, drops malformed',()=>{
  assert.deepEqual(normalizeRecents([{type:'account',id:'aaaaaaaa',at:100},{type:'note',id:'bbbbbbbb',at:200}]),[{type:'note',id:'bbbbbbbb',at:200},{type:'account',id:'aaaaaaaa',at:100}]);
  // dedupe by type+id keeps latest
  assert.deepEqual(normalizeRecents([{type:'account',id:'aaaaaaaa',at:100},{type:'account',id:'aaaaaaaa',at:300}]),[{type:'account',id:'aaaaaaaa',at:300}]);
  // cap 20
  assert.equal(normalizeRecents(Array.from({length:30},(_,i)=>({type:'note',id:'id'.padEnd(8,String(i%10)),at:i}))).length<=20,true);
  // malformed -> null
  for(const bad of [null,'x',[{type:'bogus',id:'aaaaaaaa',at:1}],[{type:'note',id:'short',at:1}],[{type:'note',id:'aaaaaaaa'}],[{type:'note',id:'aaaaaaaa',at:1,extra:'y'}]])assert.equal(normalizeRecents(bad),null);
});
